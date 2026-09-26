import { useState, useMemo } from 'react'
import { describeDue, describeInterval } from '../lib/srs.js'

/**
 * CardsPage —— 卡片管理页
 *
 * 【术语：搜索与过滤】
 * 这里用的是「客户端过滤」：把所有卡片一次性拿到内存里，然后在内存里筛选。
 * 好处：零延迟、断网也能搜。
 * 坏处：卡片到几万张时手机内存吃不消。
 * 什么时候需要换方案？大概是 5000 张以上。做产品要记住这种「先简单、够用再说」的取舍。
 */
export default function CardsPage({ cards, onEdit, onDelete, onGoAdd }) {
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState('due') // due = 按到期时间 / new = 按录入时间 / alpha = 按字母

  const list = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    let result = cards

    if (kw) {
      result = result.filter((c) =>
        [c.term, c.reading, c.meaning, c.example, (c.tags || []).join(' ')]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(kw)
      )
    }

    // [...result] 是「复制一份再排序」。
    // 【为什么要复制？】sort() 会直接改原数组。直接对 props 排序 = 偷偷改了别人的数据，
    // 这在 React 里会造成很难查的 bug。这是新手最常踩的坑之一。
    const copy = [...result]
    if (sort === 'due') copy.sort((a, b) => a.due - b.due)
    if (sort === 'new') copy.sort((a, b) => b.createdAt - a.createdAt)
    if (sort === 'alpha') copy.sort((a, b) => a.term.localeCompare(b.term))
    return copy
  }, [cards, keyword, sort])

  if (cards.length === 0) {
    return (
      <div className="page">
        <div className="empty">
          <div className="big">📇</div>
          <h2 style={{ margin: '0 0 6px' }}>还没有卡片</h2>
          <p>先录几个你最近老是记不住的词试试。</p>
          <button className="btn btn-primary" onClick={onGoAdd}>
            ＋ 添加第一张卡片
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="stack">
        <input
          className="search"
          type="text"
          placeholder="搜索单词、释义、例句、标签…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />

        <div className="toolbar">
          <span className="muted" style={{ fontSize: 13, alignSelf: 'center' }}>
            共 {cards.length} 张
            {keyword ? `，找到 ${list.length} 张` : ''}
          </span>
          <span style={{ flex: 1 }} />
          <button
            className={'btn ' + (sort === 'due' ? 'btn-primary' : 'btn-ghost')}
            onClick={() => setSort('due')}
          >
            按到期
          </button>
          <button
            className={'btn ' + (sort === 'new' ? 'btn-primary' : 'btn-ghost')}
            onClick={() => setSort('new')}
          >
            按录入
          </button>
          <button
            className={'btn ' + (sort === 'alpha' ? 'btn-primary' : 'btn-ghost')}
            onClick={() => setSort('alpha')}
          >
            按字母
          </button>
        </div>

        {list.length === 0 && (
          <div className="empty">没有匹配「{keyword}」的卡片</div>
        )}

        {list.map((card) => (
          <div className="card-item" key={card.id}>
            <div className="body">
              <div className="word">
                {card.term}
                {card.reading && (
                  <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>
                    {' '}
                    {card.reading}
                  </span>
                )}
              </div>
              <div className="def">{card.meaning}</div>
              <div className="meta">
                <span>⏱ {describeDue(card.due)}</span>
                <span>· 间隔 {describeInterval(card.interval)}</span>
                {card.lapses > 0 && <span>· 忘过 {card.lapses} 次</span>}
                {(card.tags || []).map((t) => (
                  <span className="tag" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <button
              className="icon-btn"
              title="编辑"
              onClick={() => onEdit(card)}
            >
              ✏️
            </button>
            <button
              className="icon-btn"
              title="删除"
              onClick={() => {
                // 【产品设计】删除一定要二次确认。
                // 用户辛苦录了两百个词，误点一下全没了，这个产品就废了。
                if (window.confirm(`删除「${card.term}」？此操作无法撤销。`)) {
                  onDelete(card.id)
                }
              }}
            >
              🗑
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
