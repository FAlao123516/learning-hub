/**
 * e2e.test.mjs —— 端到端测试（End-to-End Test）
 * ============================================
 *
 * 【术语：端到端测试】
 * 单元测试只验证一个函数（比如算法）。端到端测试是「模拟一个真人用户」：
 * 打开浏览器 → 点击按钮 → 输入文字 → 检查界面上出现了什么。
 * 它慢一些，但能抓到单元测试抓不到的问题，比如：
 *   · 按钮点不动（被别的元素挡住了）
 *   · 数据保存了但刷新后不见了
 *   · 页面直接白屏报错
 *
 * 【术语：无头浏览器（headless browser）】
 * 就是一个「没有窗口的 Chrome」。它照常渲染页面、执行 JS、读写数据库，
 * 只是不显示出来，所以能跑在后台，而且很快。做前端自动化就靠它。
 *
 * 运行方式：  node tests/e2e.test.mjs
 * 前置条件：  开发服务器已在 http://localhost:5173 运行（npm run dev）
 */

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const URL = process.env.APP_URL || 'http://localhost:5173/'
const CHROME =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const ROOT = process.cwd()
const SHOT_DIR = path.join(ROOT, 'screenshots')

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

function section(t) {
  console.log(`\n${t}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 页面上所有可见文字（用来断言「界面上有没有出现某句话」） */
const pageText = (page) => page.evaluate(() => document.body.innerText)

/** 按文字找元素并点击 —— 这最接近「用户看到的界面」，不怕改样式改坏选择器 */
async function clickText(page, text, tag = 'button') {
  const found = await page.evaluate(
    (text, tag) => {
      const els = [...document.querySelectorAll(tag)]
      const el = els.find((e) =>
        e.textContent.replace(/\s+/g, '').includes(text.replace(/\s+/g, ''))
      )
      if (!el) return false
      el.click()
      return true
    },
    text,
    tag
  )
  await sleep(350)
  if (!found) throw new Error(`找不到可点击的元素（文字包含「${text}」）`)
}

async function waitForText(page, text, timeout = 6000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const t = await pageText(page)
    if (t.includes(text)) return true
    await sleep(150)
  }
  return false
}

/**
 * 点底部导航。
 * 【为什么要单独写一个函数？】因为我们第一次跑测试就踩了坑：
 * 想点导航里的「卡片」，结果匹配到了页面上那个「导入这些卡片」按钮。
 * 教训：用文字找元素很方便，但文字会重复。**定位必须尽可能缩小到唯一区域**，
 * 否则测试会「看起来在点击，其实点错了地方」，比直接报错更难查。
 * 这是自动化测试里非常典型的一类坑。
 */
async function clickNav(page, label) {
  const found = await page.evaluate((label) => {
    const els = [...document.querySelectorAll('nav button')]
    const el = els.find((e) => e.textContent.replace(/\s+/g, '').includes(label))
    if (!el) return false
    el.click()
    return true
  }, label)
  await sleep(350)
  if (!found) throw new Error(`找不到底部导航项：${label}`)
}

// ————————————————————————————————————————————————

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  // 用手机尺寸的视口，因为它本来就是给手机用的
  defaultViewport: {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const page = await browser.newPage()

// 收集页面里的 JS 报错。白屏类的问题几乎都能靠这一条抓到。
const consoleErrors = []
page.on('pageerror', (e) => consoleErrors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})

fs.mkdirSync(SHOT_DIR, { recursive: true })

try {
  section('1. 打开应用')
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 })
  await sleep(800)
  ok('页面标题正确', (await page.title()) === '学习中枢')
  ok('首屏渲染出来了', await waitForText(page, '学习中枢'))
  ok('底部导航有四个入口', (await page.$$('nav button')).length === 4)
  await page.screenshot({ path: path.join(SHOT_DIR, '01-空状态.png') })

  section('2. 批量录入 3 张卡片')
  await clickNav(page, '添加')
  await clickText(page, '批量录入')
  const textarea = await page.$('textarea')
  ok('批量录入框出现了', !!textarea)
  await textarea.click()
  await page.keyboard.type(
    [
      'abandon | /əˈbændən/ | v. 放弃，抛弃 | He abandoned his car in the snow.',
      'brilliant | /ˈbrɪliənt/ | adj. 灿烂的；杰出的',
      '気持ち | きもち | 心情，感觉',
    ].join('\n'),
    { delay: 0 }
  )
  await page.screenshot({ path: path.join(SHOT_DIR, '02-批量录入.png') })
  await clickText(page, '导入这些卡片')
  ok('提示导入 3 张', await waitForText(page, '成功导入 3 张卡片'))

  section('3. 卡片列表')
  await clickNav(page, '卡片')
  ok('显示共 3 张', await waitForText(page, '共 3 张'))
  const text3 = await pageText(page)
  ok('能看到 abandon', text3.includes('abandon'))
  ok('能看到日文卡片', text3.includes('気持ち'))
  ok('能看到到期信息', text3.includes('间隔'))
  await page.screenshot({ path: path.join(SHOT_DIR, '03-卡片列表.png') })

  section('4. 搜索过滤')
  await page.click('input.search')
  await page.keyboard.type('abandon', { delay: 0 })
  await sleep(400)
  const textSearch = await pageText(page)
  ok('搜到 1 张', textSearch.includes('找到 1 张'))
  ok('搜索结果里没有気持ち', !textSearch.includes('気持ち'))
  // 清空搜索框。React 受控输入必须用「原生 setter + input 事件」才能被它识别，
  // 直接 input.value = '' 是没用的 —— 这是操作 React 页面时最常见的坑。
  await page.evaluate(() => {
    const input = document.querySelector('input.search')
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set
    setter.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await sleep(400)
  ok('清空后恢复 3 张', (await pageText(page)).includes('共 3 张'))

  section('5. 复习流程')
  await clickNav(page, '今日')
  ok('出现「显示答案」按钮', await waitForText(page, '显示答案'))
  // 【回归测试】这一条是为了锁住一个曾经真实出现过的 bug：
  // 顶栏曾经显示「今日任务已清空」，而实际上有 3 张卡在等着复习。
  // 加这条断言的意思是：以后谁改坏了这里，测试会立刻报警。
  ok(
    '顶栏正确显示「3 张待复习」',
    (await pageText(page)).includes('3 张待复习'),
    '顶栏文案与实际情况不符'
  )
  await page.screenshot({ path: path.join(SHOT_DIR, '04-复习正面.png') })
  const before = await pageText(page)
  ok('正面不泄题（看不到释义）', !before.includes('放弃，抛弃'))
  ok('显示进度 1 / 3', before.includes('1 / 3'))

  await clickText(page, '显示答案')
  const revealed = await pageText(page)
  ok('翻面后显示释义', revealed.includes('放弃，抛弃'))
  ok('翻面后显示例句', revealed.includes('abandoned his car'))
  ok('出现四个打分按钮', revealed.includes('忘了') && revealed.includes('太简单'))
  await page.screenshot({ path: path.join(SHOT_DIR, '05-复习背面.png') })

  await clickText(page, '记得')
  const afterNext = await pageText(page)
  ok('进入第 2 张', afterNext.includes('2 / 3'))

  section('6. 打「忘了」的卡片会回到队尾')
  await clickText(page, '显示答案')
  await clickText(page, '忘了')
  await sleep(300)
  const afterAgain = await pageText(page)
  ok('队列从 3 涨到 4（忘了的卡塞回队尾）', afterAgain.includes('/ 4'))

  section('7. 数据持久化（刷新后还在）—— 这是最关键的一项')
  await page.reload({ waitUntil: 'networkidle2' })
  await sleep(900)
  await clickNav(page, '卡片')
  ok('刷新后仍是 3 张卡片', await waitForText(page, '共 3 张'))
  const textAfterReload = await pageText(page)
  ok('abandon 还在', textAfterReload.includes('abandon'))
  ok('复习进度被保存了（出现「忘过」记录）', textAfterReload.includes('忘过'))

  section('8. 我的 / 数据页')
  await clickNav(page, '我的')
  const dataText = await pageText(page)
  ok('显示卡片总数', dataText.includes('卡片总数'))
  ok('显示累计复习次数', dataText.includes('累计复习次数'))
  ok('有导出按钮', dataText.includes('导出备份'))
  ok('有导入按钮', dataText.includes('从备份导入'))
  await page.screenshot({ path: path.join(SHOT_DIR, '06-我的.png') })

  section('9. 导出备份文件能正常下载')
  // 【教训】下载目录一开始放在了项目文件夹里，结果 Chrome 下载时的临时文件
  // （.crdownload）又把 Vite 的文件监听搞崩了，导致「应用一切正常、但服务器挂了」。
  // 现在改成放到操作系统的临时目录：**测试产生的垃圾文件，不要放在项目里。**
  const downloadDir = path.join(os.tmpdir(), 'learning-hub-e2e-download')
  fs.rmSync(downloadDir, { recursive: true, force: true })
  fs.mkdirSync(downloadDir, { recursive: true })
  const client = await page.createCDPSession()
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  })
  await clickText(page, '导出备份')
  await sleep(1800)
  const files = fs.readdirSync(downloadDir)
  ok('备份文件已生成', files.length > 0, `目录内容：${files.join(',')}`)
  if (files.length > 0) {
    const backup = JSON.parse(fs.readFileSync(path.join(downloadDir, files[0]), 'utf8'))
    ok('备份里有 3 张卡片', backup.cards?.length === 3)
    ok('备份带格式版本号（方便以后升级数据结构）', backup.schemaVersion === 1)
  }

  section('10. 全程没有 JS 报错')
  ok('浏览器控制台干净', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} catch (err) {
  failed++
  failures.push('测试过程抛出异常：' + err.message)
  console.log('\n💥 测试中断：' + err.message)
  try {
    await page.screenshot({ path: path.join(SHOT_DIR, 'error.png') })
  } catch {}
} finally {
  await browser.close()
}

console.log(`\n${'─'.repeat(46)}`)
console.log(`通过 ${passed} 项，失败 ${failed} 项`)
if (failures.length) {
  console.log('\n失败清单：')
  failures.forEach((f) => console.log('  · ' + f))
}
console.log(`截图已保存到 ${SHOT_DIR}`)
console.log('─'.repeat(46))

process.exit(failed > 0 ? 1 : 0)
