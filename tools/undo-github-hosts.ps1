#Requires -RunAsAdministrator
<#
    undo-github-hosts.ps1 —— 撤销 hosts 文件的修改
    ============================================

    【什么时候需要跑它？】
    · 你换了网络环境，发现 GitHub 反而连不上了
    · 你想把这台电脑恢复成原始状态
    · 你怀疑 hosts 里的固定 IP 过期了（跑 fix-github-hosts.ps1 会自动换新的，通常不用撤销）

    它只会删掉本工具添加的那一段，hosts 里其它内容一律不动。
#>

$ErrorActionPreference = 'Stop'

$hostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'

Write-Host 'Removing learning-hub entries from the hosts file...'

$backup = "$hostsPath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -Path $hostsPath -Destination $backup -Force
Write-Host "Backed up to: $backup"

$lines = @(Get-Content -Path $hostsPath)
$kept = New-Object System.Collections.Generic.List[string]
$insideOurBlock = $false
$removed = 0

foreach ($line in $lines) {
  $t = $line.Trim()
  # 宽松匹配：任何提到 learning-hub 的注释行都视为本工具段落的开头，
  # 这样连早期版本用中文标记（存成 ASCII 后变成 "?"）的段落也能一并清掉。
  if ($t -match 'learning-hub') { $insideOurBlock = $true; $removed++; continue }
  if ($insideOurBlock) {
    if ($t -eq '') { $removed++; continue }
    if ($t.StartsWith('#')) { $removed++; continue }
    if ($t -match 'github\.com') { $removed++; continue }
    $insideOurBlock = $false
  }
  $kept.Add($line)
}

while ($kept.Count -gt 0 -and $kept[$kept.Count - 1].Trim() -eq '') {
  $kept.RemoveAt($kept.Count - 1)
}

Set-Content -Path $hostsPath -Value @($kept) -Encoding ASCII -Force
& ipconfig /flushdns | Out-Null

Write-Host "Removed $removed line(s) and flushed the DNS cache."
Write-Host 'Done.'
