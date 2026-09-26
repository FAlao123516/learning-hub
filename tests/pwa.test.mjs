/**
 * pwa.test.mjs —— 验证 PWA 的两个核心能力
 * ======================================
 *
 * 【为什么单独测这个？】
 * 因为 PWA 的两件事「装上桌面」和「断网可用」都依赖 Service Worker，
 * 而 Service Worker 只在正式打包后才会注册（开发时我们特意关掉了它，
 * 免得它缓存旧代码）。也就是说：**这类问题你在本地开发时永远看不到，
 * 只有上线后才会暴露。** 所以必须在线上地址上单独测一遍。
 *
 * 【术语：为什么断网可用需要专门测？】
 * Service Worker 的行为高度依赖浏览器缓存状态和 HTTPS 环境。
 * 「本机 localhost 能离线」不代表「线上能离线」—— 两者的作用域、
 * 缓存策略、跨域限制都不一样。凡是「只在线上才成立」的假设，都必须线上验证。
 *
 * 运行：node tests/pwa.test.mjs
 * 可通过环境变量 APP_URL 指定别的地址
 */

import puppeteer from 'puppeteer-core'

// 【踩过的坑】这个变量一开始叫 URL，结果把 Node 内置的 URL 类给覆盖了，
// 后面 new URL(...) 直接报 "URL is not a constructor"。
// 教训：**别用和内置全局对象同名的变量**（URL、Date、Map、Set、name、length 都是高危名字）。
// 这类 bug 不报语法错、只在运行时炸，而且报错信息指向的位置离真正的错误很远。
const TARGET = process.env.APP_URL || 'https://falao123516.github.io/learning-hub/'
const CHROME =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

let passed = 0
let failed = 0
const failures = []

function ok(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    failures.push(name + (detail ? ` — ${detail}` : ''))
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

console.log(`测试目标：${TARGET}\n`)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

try {
  console.log('1. 加载线上站点')
  await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 45000 })
  await sleep(1000)
  ok('页面正常渲染', (await page.evaluate(() => document.body.innerText)).includes('学习中枢'))

  console.log('\n2. PWA 安装清单（manifest）')
  const manifestHref = await page.evaluate(
    () => document.querySelector('link[rel="manifest"]')?.href
  )
  ok('HTML 里声明了 manifest', !!manifestHref, '找不到 link[rel=manifest]')

  if (manifestHref) {
    const m = await page.evaluate(async (href) => {
      const r = await fetch(href)
      return { status: r.status, body: await r.json() }
    }, manifestHref)
    ok('manifest 能正常下载', m.status === 200, `HTTP ${m.status}`)
    ok('有应用名称', !!m.body.name, JSON.stringify(m.body))
    ok('display 是 standalone（全屏无浏览器地址栏）', m.body.display === 'standalone', m.body.display)
    ok('有 start_url', !!m.body.start_url, String(m.body.start_url))
    ok(
      '至少有一个图标',
      Array.isArray(m.body.icons) && m.body.icons.length > 0,
      '没有图标就无法安装到桌面'
    )

    if (Array.isArray(m.body.icons) && m.body.icons.length > 0) {
      const iconUrl = new URL(m.body.icons[0].src, manifestHref).href
      const iconRes = await page.evaluate(async (u) => (await fetch(u)).status, iconUrl)
      ok('图标文件真实存在', iconRes === 200, `${iconUrl} -> HTTP ${iconRes}`)
    }
  }

  console.log('\n3. Service Worker 注册（离线能力的前提）')
  let registered = false
  try {
    await page.waitForFunction(
      async () => (await navigator.serviceWorker.getRegistrations()).length > 0,
      { timeout: 30000 }
    )
    registered = true
  } catch {
    registered = false
  }
  ok('Service Worker 已注册', registered, '30 秒内没有注册成功')

  if (registered) {
    const regs = await page.evaluate(async () => {
      const list = await navigator.serviceWorker.getRegistrations()
      return list.map((r) => ({ scope: r.scope, active: !!r.active }))
    })
    ok('Service Worker 已激活（不只是注册了）', regs.some((r) => r.active), JSON.stringify(regs))
    ok(
      '作用范围覆盖整个应用（不是只有根目录）',
      regs.some((r) => r.scope.includes('/learning-hub/')),
      JSON.stringify(regs.map((r) => r.scope))
    )
  }

  console.log('\n4. 真正的离线测试（这是最关键的一项）')
  // 先正常加载一次，让 Service Worker 把资源缓存下来
  await sleep(1500)
  await page.setOfflineMode(true)
  let offlineOk = false
  let offlineText = ''
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
    await sleep(2500)
    offlineText = await page.evaluate(() => document.body.innerText)
    offlineOk = offlineText.includes('学习中枢')
  } catch (e) {
    offlineText = '(reload 失败: ' + e.message + ')'
  }
  ok('断网后刷新页面仍然能打开', offlineOk, offlineText.slice(0, 120))

  // 断网状态下还能不能真正操作（不只是显示个壳）
  if (offlineOk) {
    const canOperate = await page.evaluate(() => {
      const nav = document.querySelector('nav')
      return !!nav && nav.querySelectorAll('button').length === 4
    })
    ok('断网状态下界面功能完整（底部导航还在）', canOperate)
  }

  await page.setOfflineMode(false)

  console.log('\n5. 运行时没有 JS 报错')
  ok('无 JS 异常', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (err) {
  failed++
  failures.push('测试异常：' + err.message)
  console.log('\n💥 ' + err.message)
} finally {
  await browser.close()
}

console.log(`\n${'─'.repeat(46)}`)
console.log(`通过 ${passed} 项，失败 ${failed} 项`)
if (failures.length) {
  console.log('\n失败清单：')
  failures.forEach((f) => console.log('  · ' + f))
}
console.log('─'.repeat(46))
process.exit(failed > 0 ? 1 : 0)
