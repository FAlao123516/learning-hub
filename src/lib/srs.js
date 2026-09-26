/**
 * srs.js —— SRS 间隔重复算法（Spaced Repetition System）
 * ==================================================
 * 这是整个软件的「灵魂」。它只做一件事：
 *   根据你这次的打分，决定这张卡片下次什么时候再出现。
 *
 * 【核心原理：遗忘曲线】
 * 100 多年前德国心理学家艾宾浩斯发现：人忘东西的速度是「先快后慢」。
 * 刚背完 20 分钟就忘了 40%，一天后忘了 70%，但剩下的会忘得越来越慢。
 *
 * 所以复习的黄金时机不是「背得越多越好」，而是
 *   「在你马上就要忘、但还没忘的那一刻」再见到它。
 * 这时大脑会判断「这信息很重要，值得长期保存」，记忆强度大幅提升。
 *
 * 算法要做的事就是不断试探这个临界点：
 *   记住 → 把间隔拉长（1天 → 3天 → 8天 → 21天……）
 *   忘了 → 把间隔打回原点，并把这个词标记为「比较难」
 *
 * 这里实现的是 SM-2 算法的简化版（Anki 早期用的就是 SM-2）。
 * SuperMemo 的原始论文是公开的，这是少见的「算法原理完全透明」的领域。
 *
 * 【术语：ease / 难度系数】
 * ease 是每个单词自己的「难度属性」，初始 2.5。
 * 你觉得简单 → ease 上升 → 它的间隔涨得更快（很快就不用再见了）
 * 你总忘     → ease 下降 → 它的间隔涨得慢（会反复出现）
 * 最低不低于 1.3，否则这个词会每天缠着你。
 */

export const DAY_MS = 24 * 60 * 60 * 1000
export const MINUTE_MS = 60 * 1000

/** 四档打分。数字会存进数据库，所以顺序不要随便改。 */
export const RATINGS = [
  { value: 0, key: 'again', label: '忘了', hint: '10 分钟后再来', color: 'var(--rate-again)' },
  { value: 1, key: 'hard', label: '模糊', hint: '有点印象但想不起来', color: 'var(--rate-hard)' },
  { value: 2, key: 'good', label: '记得', hint: '正常答对', color: 'var(--rate-good)' },
  { value: 3, key: 'easy', label: '太简单', hint: '一眼就会，别浪费我时间', color: 'var(--rate-easy)' },
]

/** 一张新卡片的初始复习状态 */
export function initialSchedule(now = Date.now()) {
  return {
    due: now, // 下次该复习的时间（时间戳）。新卡立刻就能复习
    interval: 0, // 当前间隔，单位「天」
    ease: 2.5, // 难度系数
    reps: 0, // 连续答对次数
    lapses: 0, // 累计忘记次数
    lastReviewedAt: null, // 上次复习时间
  }
}

/**
 * 计算复习后的新状态。
 * @param {object} card  当前卡片（含上面那些字段）
 * @param {number} rating 0=忘了 1=模糊 2=记得 3=太简单
 * @param {number} now    当前时间戳（传进来是为了方便测试，正常不传）
 * @returns {object} 新的复习状态字段
 */
export function applyRating(card, rating, now = Date.now()) {
  // 老数据可能缺字段，先兜底，避免出现 NaN 把整个算法搞崩
  let { interval = 0, ease = 2.5, reps = 0, lapses = 0 } = card

  if (rating === 0) {
    // —— 忘了 ——
    // 间隔归零，10 分钟后在「今天」的队列里再出现一次。
    // 【设计取舍】为什么不是明天？
    // 因为「今天背了 10 个词，明天全忘」是最打击人的体验。
    // 当天多刷一遍，第二天的通过率会明显提高。
    lapses += 1
    reps = 0
    ease = Math.max(1.3, ease - 0.2)
    return {
      interval: 0,
      ease,
      reps,
      lapses,
      due: now + 10 * MINUTE_MS,
      lastReviewedAt: now,
    }
  }

  // —— 记住了 ——
  let factor
  if (rating === 1) {
    ease = Math.max(1.3, ease - 0.15)
    factor = 1.2 // 「模糊」也让它前进，但走得很慢，很快会再见到
  } else if (rating === 2) {
    factor = ease
  } else {
    ease = ease + 0.15
    factor = ease * 1.3 // 「太简单」直接把间隔乘得更狠
  }

  reps += 1

  if (reps === 1) {
    interval = 1 // 第一次答对：明天见
  } else if (reps === 2) {
    interval = 3 // 第二次：3 天后
  } else {
    interval = Math.round(interval * factor)
  }

  // 上限一年。避免某个词被你点了几次「太简单」后，间隔变成 100 年。
  interval = Math.min(interval, 365)

  return {
    interval,
    ease,
    reps,
    lapses,
    due: now + interval * DAY_MS,
    lastReviewedAt: now,
  }
}

/** 给界面用的：把「还有多久到期」翻译成人话 */
export function describeDue(due, now = Date.now()) {
  const diff = due - now
  if (diff <= 0) return '现在就该复习'

  const mins = Math.round(diff / MINUTE_MS)
  if (mins < 60) return `${mins} 分钟后`

  const hours = Math.round(diff / (60 * MINUTE_MS))
  if (hours < 24) return `${hours} 小时后`

  const days = Math.round(diff / DAY_MS)
  if (days < 30) return `${days} 天后`

  const months = Math.round(days / 30)
  if (months < 12) return `${months} 个月后`

  return `${Math.round(days / 365)} 年后`
}

/** 把天数间隔翻译成 Anki 那种「1天 / 3天 / 21天」的短标签 */
export function describeInterval(days) {
  if (!days) return '新卡'
  return `${days} 天`
}
