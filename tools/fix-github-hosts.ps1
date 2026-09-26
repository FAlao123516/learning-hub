#Requires -RunAsAdministrator
<#
    fix-github-hosts.ps1
    ====================
    Pin github.com to a working IP in the Windows hosts file.

    WHY THIS IS NEEDED
    ------------------
    On some networks the system DNS returns an IP for github.com that is
    unreachable. GitHub itself is fine - only the address is wrong. Writing the
    correct IP into the hosts file bypasses DNS for that one hostname.

    WHY IT PROBES INSTEAD OF HARD-CODING AN IP
    ------------------------------------------
    The set of reachable GitHub IPs changes over time. So this script:
      1. TCP-connects to a list of candidate IPs and times each one
      2. Writes the fastest reachable candidate into the hosts file
      3. Verifies by actually fetching https://github.com
      4. If verification fails, tries the next candidate

    Run it again whenever GitHub becomes unreachable.

    WHY THIS SCRIPT IS PURE ASCII
    -----------------------------
    The hosts file must be ASCII. Any non-ASCII character in the marker line
    would be written as "?", so a later run would not recognise its own marker
    and would keep appending duplicate blocks (the older, dead IP would then
    win, because the first match in a hosts file takes effect). Keeping every
    string ASCII removes that whole class of bug - and also avoids the
    PowerShell 5.1 trap where a UTF-8 script without a BOM is misread.

    USAGE
    -----
    Right-click -> Run with PowerShell, or run as administrator:
        powershell -ExecutionPolicy Bypass -File fix-github-hosts.ps1
    Undo with: undo-github-hosts.ps1
#>

param(
  [string]$Ip = ''
)

$ErrorActionPreference = 'Stop'

$hostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$logPath   = Join-Path $PSScriptRoot 'fix-github-hosts.log'
$marker    = '# === learning-hub GitHub accelerator ==='

# Candidate IPs from GitHub's published github.com ranges.
# If they all go dead one day, add new ones here.
$candidates = @(
  '20.200.245.247', '20.27.177.113', '140.82.112.3', '140.82.113.3',
  '140.82.114.3', '140.82.116.3', '140.82.121.3', '140.82.121.4',
  '20.205.243.166', '4.208.26.197', '20.26.156.215'
)

$log = New-Object System.Collections.Generic.List[string]
function Say($msg) {
  Write-Host $msg
  $log.Add([string]$msg)
}

# Measure a real HTTPS request to github.com forced through one specific IP.
# Returns seconds on success, or -1 on failure.
#
# WHY NOT A TCP CONNECT TEST?
# A plain TCP connect is a trap on this kind of network. A middlebox can
# complete the TCP handshake for an unreachable IP and then drop all data, so
# TCP succeeds in 86 ms while the actual page never loads. We measured exactly
# that: an IP with a 3/3 TCP success rate turned out to be 0/3 for real HTTPS.
# Always probe with the real request you actually care about.
function Test-HttpsViaIp {
  param([string]$Target, [int]$TimeoutSec = 8)
  $prev = $ErrorActionPreference
  # PowerShell 5.1 turns native-command stderr into terminating errors when
  # ErrorActionPreference is Stop - and curl writes to stderr on timeout, which
  # is an expected outcome while probing. Loosen it just for this call.
  $ErrorActionPreference = 'Continue'
  try {
    $curl = Join-Path $env:SystemRoot 'System32\curl.exe'
    if (-not (Test-Path $curl)) { $curl = 'curl.exe' }
    $raw = & $curl -sS -o NUL -w '%{http_code}|%{time_total}' --max-time $TimeoutSec `
             --resolve "github.com:443:$Target" https://github.com 2>$null
    $parts = "$raw".Trim().Split('|')
    if ($parts.Count -ge 2 -and $parts[0] -eq '200') {
      $sec = 0.0
      [void][double]::TryParse($parts[1], [ref]$sec)
      return $sec
    }
    return -1
  } catch {
    return -1
  } finally {
    $ErrorActionPreference = $prev
  }
}

# Remove every line this tool ever added (loose match, so even blocks written
# by earlier versions of the script are cleaned up).
function Get-CleanedHostsLines {
  $lines = @(Get-Content -Path $hostsPath)
  $kept = New-Object System.Collections.Generic.List[string]
  $inside = $false
  foreach ($line in $lines) {
    $t = $line.Trim()
    if ($t -match 'learning-hub') { $inside = $true; continue }
    if ($inside) {
      if ($t -eq '') { continue }
      if ($t.StartsWith('#')) { continue }
      if ($t -match 'github\.com') { continue }
      $inside = $false
    }
    $kept.Add($line)
  }
  while ($kept.Count -gt 0 -and $kept[$kept.Count - 1].Trim() -eq '') {
    $kept.RemoveAt($kept.Count - 1)
  }
  # The generics List must be unwrapped before Set-Content, otherwise
  # PowerShell can try to read it twice and throw "stream was not readable".
  return ,@($kept.ToArray())
}

function Set-HostsEntry {
  param([string]$Target)
  $lines = Get-CleanedHostsLines
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($l in $lines) { $out.Add([string]$l) }
  $out.Add('')
  $out.Add($marker)
  $out.Add("# updated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
  $out.Add('# why: system DNS returned an unreachable IP for github.com')
  $out.Add('# undo: run undo-github-hosts.ps1')
  $out.Add("$Target`tgithub.com")
  $out.Add("$Target`twww.github.com")
  $text = [string]::Join("`r`n", $out.ToArray())
  [System.IO.File]::WriteAllText($hostsPath, $text, [System.Text.Encoding]::ASCII)
}

function Clear-DnsCache {
  try {
    Clear-DnsClientCache -ErrorAction Stop
  } catch {
    try {
      $null = & "$env:SystemRoot\System32\ipconfig.exe" /flushdns
    } catch { }
  }
}

try {
  Say '=== fixing github.com resolution ==='
  Say ''

  if (-not $Ip) {
    Say 'probing candidate IPs with real HTTPS requests (2 tries each)...'
    $reachable = @()
    foreach ($cand in $candidates) {
      $a = Test-HttpsViaIp -Target $cand
      $b = Test-HttpsViaIp -Target $cand
      if ($a -ge 0 -and $b -ge 0) {
        # Use the slower of the two, so we rank by worst-case rather than luck
        $worst = [math]::Max($a, $b)
        Say ("  [ok]   $cand   $([math]::Round($a,2))s / $([math]::Round($b,2))s")
        $reachable += [pscustomobject]@{ IP = $cand; Sec = $worst }
      } else {
        Say ("  [fail] $cand")
      }
    }
    if ($reachable.Count -eq 0) {
      Say ''
      Say 'No candidate is reachable right now. Try again in a few minutes.'
      $log | Set-Content -Path $logPath -Encoding UTF8
      exit 1
    }
    $ordered = @($reachable | Sort-Object Sec | ForEach-Object { $_.IP })
    Say ''
    Say ("stable candidates: " + ($ordered -join ', '))
  } else {
    Say "using IP from the command line: $Ip"
    $ordered = @($Ip)
  }

  Say ''
  $backup = "$hostsPath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item -Path $hostsPath -Destination $backup -Force
  Say "backed up hosts to: $backup"
  Say ''

  $chosen = $null
  foreach ($cand in ($ordered | Select-Object -First 4)) {
    Say "trying $cand ..."
    Set-HostsEntry -Target $cand
    Clear-DnsCache
    Start-Sleep -Milliseconds 700
    try {
      $r = Invoke-WebRequest -Uri 'https://github.com' -Method Head -TimeoutSec 15 -UseBasicParsing -ErrorAction Stop
      Say ("  -> OK, github.com answered HTTP $($r.StatusCode)")
      $chosen = $cand
      break
    } catch {
      Say ("  -> failed: $($_.Exception.Message)")
    }
  }

  Say ''
  if ($chosen) {
    Say "SUCCESS: github.com is now pinned to $chosen"
    $log | Set-Content -Path $logPath -Encoding UTF8
    exit 0
  }

  Say 'FAILED: could not verify any candidate. Try running the script again.'
  $log | Set-Content -Path $logPath -Encoding UTF8
  exit 1
} catch {
  Say "UNEXPECTED ERROR: $($_.Exception.Message)"
  Say ($_.ScriptStackTrace)
  $log | Set-Content -Path $logPath -Encoding UTF8
  exit 1
}
