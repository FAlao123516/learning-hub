/**
 * srs.test.mjs —— 间隔重复算法的验证脚本
 * =====================================
 *
 * 【术语：单元测试（unit test）】
 * 就是一个「自动帮你检查代码对不对」的小程序。
 * 你写清楚「输入 A 应该得到 B」，电脑帮你跑一遍，不符合就报错。
 *
 * 【为什么算法特别需要测试？】
 * 因为算法没有界面，你肉眼看不出对错。而且它一旦错了，
 * 表现是「一个月后突然发现全忘了」——那时候你根本不知道是这个 bug 造成的。
 * 算法错了，用户不会觉得「有 bug」，只会觉得「这软件没用」然后卸载。
 * 这就是为什么「看不见的地方」反而更需要测试。
 *
 * 运行方式：  node src/lib/srs.test.mjs
 */

import { applyRating, initialSchedule, describeDue, DAY_MS, MINUTE_MS } from './srs.js'

let passed = 0
let failed = 0

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name}`)
    console.log(`      期望: ${JSON.stringify(expected)}`)
    console.log(`      实际: ${JSON.stringify(actual)}`)
  }
}

function section(title) {
  console.log(`\n${title}`)
}

const T0 = 1700000000000 // 固定的假时间，保证测试结果永远一致（这叫「可复现」）

section('新卡片的初始状态')
{
  const s = initialSchedule(T0)
  check('立刻就能复习', s.due, T0)
  check('间隔从 0 开始', s.interval, 0)
  check('难度系数初始 2.5', s.ease, 2.5)
}

section('第一次答对：明天再见')
{
  const card = { ...initialSchedule(T0) }
  const r = applyRating(card, 2, T0)
  check('间隔变成 1 天', r.interval, 1)
  check('到期时间是 24 小时后', r.due, T0 + DAY_MS)
  check('连续答对次数 +1', r.reps, 1)
}

section('第二次答对：间隔 3 天')
{
  const card = { ...initialSchedule(T0), reps: 1, interval: 1, ease: 2.5 }
  const r = applyRating(card, 2, T0)
  check('间隔变成 3 天', r.interval, 3)
  check('连续答对 2 次', r.reps, 2)
}

section('第三次答对：按难度系数放大')
{
  const card = { ...initialSchedule(T0), reps: 2, interval: 3, ease: 2.5 }
  const r = applyRating(card, 2, T0)
  // 3 × 2.5 = 7.5 → 四舍五入 8
  check('间隔变成 8 天', r.interval, 8)
  check('难度系数不变', r.ease, 2.5)
}

section('答「忘了」：间隔归零，10 分钟后重来')
{
  const card = { ...initialSchedule(T0), reps: 5, interval: 30, ease: 2.5, lapses: 0 }
  const r = applyRating(card, 0, T0)
  check('间隔归零', r.interval, 0)
  check('10 分钟后到期', r.due, T0 + 10 * MINUTE_MS)
  check('连续答对清零', r.reps, 0)
  check('忘记次数 +1', r.lapses, 1)
  check('难度系数下调到 2.3', Number(r.ease.toFixed(2)), 2.3)
}

section('难度系数有下限，不会无限下降')
{
  let card = { ...initialSchedule(T0) }
  for (let i = 0; i < 20; i++) {
    const r = applyRating(card, 0, T0)
    card = { ...card, ...r }
  }
  check('最低停在 1.3', Number(card.ease.toFixed(2)), 1.3)
}

section('答「太简单」：间隔涨得比「记得」更快')
{
  const base = { ...initialSchedule(T0), reps: 2, interval: 10, ease: 2.5 }
  const good = applyRating(base, 2, T0)
  const easy = applyRating(base, 3, T0)
  check('「太简单」走得更远', easy.interval > good.interval, true)
  check('难度系数被调高', easy.ease > base.ease, true)
}

section('答「模糊」：前进但很慢，难度系数下调')
{
  const card = { ...initialSchedule(T0), reps: 2, interval: 10, ease: 2.5 }
  const r = applyRating(card, 1, T0)
  check('间隔只 ×1.2', r.interval, 12)
  check('难度系数下调到 2.35', Number(r.ease.toFixed(2)), 2.35)
}

section('间隔有上限，不会涨到荒谬的天数')
{
  let card = { ...initialSchedule(T0), reps: 3, interval: 300, ease: 2.5 }
  const r = applyRating(card, 3, T0)
  check('最多 365 天', r.interval, 365)
}

section('异常数据不会把算法搞崩（稳健性）')
{
  // 模拟从旧版本导入的、缺少字段的卡片
  const broken = { term: 'test', meaning: '测试' }
  const r = applyRating(broken, 2, T0)
  check('不产生 NaN', Number.isNaN(r.interval) || Number.isNaN(r.ease), false)
  check('照样能算出间隔', r.interval, 1)
}

section('到期时间的人话翻译')
{
  check('已过期', describeDue(T0 - 1000, T0), '现在就该复习')
  check('30 分钟', describeDue(T0 + 30 * MINUTE_MS, T0), '30 分钟后')
  check('5 小时', describeDue(T0 + 5 * 60 * MINUTE_MS, T0), '5 小时后')
  check('3 天', describeDue(T0 + 3 * DAY_MS, T0), '3 天后')
  check('2 个月', describeDue(T0 + 60 * DAY_MS, T0), '2 个月后')
}

console.log(`\n${'─'.repeat(40)}`)
console.log(`通过 ${passed} 项，失败 ${failed} 项`)
console.log('─'.repeat(40))

// 有失败就让脚本以「非 0 退出码」结束，这样自动化流程能发现出错了
process.exit(failed > 0 ? 1 : 0)
