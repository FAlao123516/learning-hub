import { useState, useEffect } from 'react'
import { RATINGS } from '../lib/srs.js'

/**
 * ReviewPage —— 今日复习页（这个软件真正的使用场景）
 *
 * 【术语：状态（state）与 props】
 * props  = 从外面传进来的、自己不能改的数据（像函数的参数）
 * state  = 组件自己管的数据，改了它界面会自动重画
 * 这里 props 是卡片列表和「保存」函数；state 是「当前复习到第几张」「答案翻了没」。
 *
 * 【术语：受控组件】
 * 卡片的显示完全由 state 决定（revealed ? 显示答案 : 不显示），
 * 而不是直接去操作 DOM 改样式。这是 React 的标准做法，好处是「界面永远和数据一致」。
 */

export default function ReviewPage({
  queue,
  totalCount,
  onRate,
  onGoAdd,
  onRestart,
  nextDueText,
}) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)

  // 当前这张卡。用 useMemo 缓存，避免每次重画都重新算。
  const current = queue[index]

  // 键盘快捷键（电脑上用）：空格翻面，1~4 打分。
  // 手机用不上，但在电脑上录卡片时非常快。
  //
  // 【为什么必须用 useEffect 而不是 useMemo？】
  // 两者都接收一个函数并返回「清理函数」，但只有 useEffect 的返回值会被 React 调用。
  // 用 useMemo 注册事件监听 = 监听器永远不会被移除，越积越多，最后同一个按键触发好几次。
  // 这是我刚才写错、现在修掉的一个真实 bug —— 记下来：注册了监听器，就必须有人负责注销。
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (e) => {
      if (!current) return
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault()
        if (!revealed) setRevealed(true)
      }
      if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        const rating = Number(e.key) - 1
        handleRate(rating)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  function handleRate(rating) {
    onRate(current, rating)
    setRevealed(false)
    setIndex((i) => i + 1)
  }

  // —— 情况一：队列走完了 ——
  if (!current) {
    const allDone = queue.length === 0
    return (
      <div className="page">
        <div className="empty">
          <div className="big">{allDone && index === 0 ? '🎉' : '✅'}</div>
          <h2 style={{ margin: '0 0 6px' }}>
            {allDone && index === 0 ? '今天没有要复习的卡片' : `今日复习完成！`}
          </h2>
          <p>
            {allDone && index === 0
              ? nextDueText || '去「添加」录几个新词吧。'
              : `这一轮过了 ${index} 张卡。记忆就是这样一点点长出来的。`}
          </p>
        </div>

        <div className="stack">
          <div className="stat-grid">
            <div className="stat">
              <div className="num">{totalCount}</div>
              <div className="label">卡片总数</div>
            </div>
            <div className="stat">
              <div className="num">{index}</div>
              <div className="label">本轮复习</div>
            </div>
            <div className="stat">
              <div className="num">{queue.length}</div>
              <div className="label">队列剩余</div>
            </div>
          </div>

          <button className="btn btn-primary btn-block" onClick={onGoAdd}>
            ＋ 添加新卡片
          </button>
          {index > 0 && (
            <button className="btn btn-ghost btn-block" onClick={onRestart}>
              🔄 再检查一次今天到期的卡片
            </button>
          )}
        </div>
      </div>
    )
  }

  // —— 情况二：正常复习 ——
  const progress = (index / queue.length) * 100

  return (
    <div className="page">
      <div className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
            第 {index + 1} / {queue.length} 张
          </span>
          <span className="muted" style={{ fontSize: 13 }}>
            {current.tags?.length ? current.tags.map((t) => `#${t}`).join(' ') : ''}
          </span>
        </div>

        <div className="progress">
          <div style={{ width: `${progress}%` }} />
        </div>

        <div className="flashcard">
          <div className="term">{current.term}</div>
          {current.reading && <div className="reading">{current.reading}</div>}

          {revealed && (
            <>
              <hr />
              <div className="meaning">{current.meaning}</div>
              {current.example && <div className="example">{current.example}</div>}
            </>
          )}
        </div>

        {!revealed ? (
          <button
            className="btn btn-primary btn-block"
            style={{ padding: '16px' }}
            onClick={() => setRevealed(true)}
          >
            显示答案
          </button>
        ) : (
          <div className="rating-grid">
            {RATINGS.map((r) => (
              <button
                key={r.value}
                style={{ background: r.color }}
                onClick={() => handleRate(r.value)}
              >
                {r.label}
                <span className="hint">{r.hint}</span>
              </button>
            ))}
          </div>
        )}

        <div className="note">
          <b>怎么打分？</b> 诚实比乐观重要。「记得」是「真的想起来了」，
          不是「看着答案觉得眼熟」。打分虚高会让算法误判你已掌握，
          把这个词推到很久以后，结果就是某天突然发现全忘了。
        </div>
      </div>
    </div>
  )
}
