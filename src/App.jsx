import { useState, useEffect, useCallback } from 'react'
import ReviewPage from './pages/ReviewPage.jsx'
import CardsPage from './pages/CardsPage.jsx'
import AddPage from './pages/AddPage.jsx'
import DataPage from './pages/DataPage.jsx'
import {
  getAllCards,
  putCard,
  putCards,
  deleteCard,
  clearAllCards,
  newId,
} from './lib/db.js'
import { applyRating, initialSchedule, describeDue } from './lib/srs.js'

/**
 * App.jsx —— 主程序：管数据、管导航、把各个页面拼起来
 *
 * 【术语：这个文件在做「状态提升」】
 * 三个页面都需要卡片数据：复习页要读、卡片页要读要删、添加页要写。
 * 如果每个页面各自去读数据库，就会出现「A 页面删了一张卡，B 页面还显示着」的问题。
 * 解决办法：把数据放到它们共同的「父亲」这里（也就是 App），
 * 页面只负责显示，改数据的动作都回调给 App 统一处理。
 * 这个模式叫「状态提升（lifting state up）」，是 React 里最重要的架构习惯。
 * 它对应的产品原则是：**同一个事实只能有一个权威来源**（单一数据源）。
 */

const TABS = [
  { key: 'today', icon: '🎯', label: '今日' },
  { key: 'cards', icon: '📇', label: '卡片' },
  { key: 'add', icon: '➕', label: '添加' },
  { key: 'data', icon: '👤', label: '我的' },
]

export default function App() {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('today')

  // 本轮复习队列。它是一个「快照」：一旦建立，中途新到期的卡不会插队，
  // 否则你会永远复习不完 —— 这是个人学习类工具最常见的体验陷阱。
  //
  // 【这里被测试抓出来的一个真实 bug，值得记住】
  // 我最初的写法是：一进入「今日」页就把队列建好，并打上一个「已建立」的标记。
  // 问题是：App 刚启动时还没有任何卡片，队列被建成空的，标记却被设上了。
  // 结果你添加完卡片再回到「今日」，它认为「队列早建好了」，于是永远显示空。
  // 教训：**不要用「某个动作发生过没有」当条件，要用「现在的状态对不对」当条件。**
  // 前者是记流水账，后者才是描述事实。这个坑在后端、缓存、权限检查里到处都是。
  const [queue, setQueue] = useState([])
  const [sessionKey, setSessionKey] = useState(0)

  const [editingCard, setEditingCard] = useState(null)
  const [toast, setToast] = useState('')
  // 一个纯「滴答」计数器：它唯一的作用是定时触发界面重画，
  // 好让「X 分钟后到期」这类相对时间文案保持新鲜。
  // 它不参与任何逻辑判断 —— 判断用的时间一律当场取 Date.now()，避免上面那种错。
  const [, setTick] = useState(0)

  // ——— 启动时把数据从 IndexedDB 读进内存 ———
  useEffect(() => {
    let alive = true
    getAllCards()
      .then((list) => {
        if (!alive) return
        setCards(list)
        setLoading(false)
      })
      .catch((err) => {
        console.error('读取本地数据失败', err)
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  // 每 30 秒滴答一次，刷新相对时间的显示
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(timer)
  }, [])

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }, [])

  // ——— 建立今日复习队列 ———
  // 判断条件是「现在队列是不是空的、现在到底有没有到期的卡片」，
  // 而不是「之前建过没有」。这样新录入的卡片也能被正确排进来。
  useEffect(() => {
    if (loading) return
    if (tab !== 'today') return
    if (queue.length > 0) return // 这一轮还没复习完，不动它
    const current = Date.now()
    const due = cards.filter((c) => c.due <= current).sort((a, b) => a.due - b.due)
    if (due.length === 0) return
    setQueue(due)
  }, [loading, tab, cards, queue.length])

  // ——— 保存：新增 / 批量 / 编辑 ———
  async function handleSave(data) {
    const nowTs = Date.now()

    // 情况一：编辑已有卡片
    if (editingCard) {
      const updated = {
        ...editingCard,
        term: data.term,
        reading: data.reading || '',
        meaning: data.meaning,
        example: data.example || '',
        tags: data.tags || [],
      }
      await putCard(updated)
      setCards((cs) => cs.map((c) => (c.id === updated.id ? updated : c)))
      setEditingCard(null)
      setTab('cards')
      showToast('已保存修改 ✓')
      return
    }

    // 情况二：新增（data 可能是单张对象，也可能是批量数组）
    const items = Array.isArray(data) ? data : [data]
    const fresh = items.map((d) => ({
      id: newId(),
      term: d.term,
      reading: d.reading || '',
      meaning: d.meaning,
      example: d.example || '',
      tags: d.tags || [],
      createdAt: nowTs,
      ...initialSchedule(nowTs),
    }))

    await putCards(fresh)
    setCards((cs) => [...fresh, ...cs])
    showToast(`已保存 ${fresh.length} 张卡片 ✓`)
  }

  // ——— 复习打分 ———
  async function handleRate(card, rating) {
    const patch = applyRating(card, rating)
    const updated = { ...card, ...patch }

    // 【术语：乐观更新（optimistic update）】
    // 先改界面，再去写数据库。因为写磁盘要几十毫秒，
    // 如果等写完再更新界面，快速点「记得」时会有一顿一顿的卡顿感。
    // 代价是：如果写入失败，界面就和数据库不一致了，所以要处理失败。
    setCards((cs) => cs.map((c) => (c.id === card.id ? updated : c)))

    try {
      await putCard(updated)
    } catch (err) {
      console.error('保存复习进度失败', err)
      showToast('⚠️ 进度保存失败，请检查手机存储空间')
    }

    // 打「忘了」的卡片，塞回队尾，今天再问一次
    if (rating === 0) {
      setQueue((q) => [...q, updated])
    }
  }

  // ——— 删除 / 清空 ———
  async function handleDelete(id) {
    await deleteCard(id)
    setCards((cs) => cs.filter((c) => c.id !== id))
    showToast('已删除')
  }

  async function handleClearAll() {
    await clearAllCards()
    setCards([])
    setQueue([])
    showToast('已清空')
  }

  // ——— 导出 / 导入 ———
  function handleExport() {
    const payload = {
      app: 'learning-hub',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      cards,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `学习中枢-备份-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast('已导出，请把文件保存到安全的地方')
  }

  async function handleImport(list) {
    const byId = new Map(cards.map((c) => [c.id, c]))
    let added = 0
    let updated = 0

    list.forEach((raw) => {
      if (!raw || !raw.term || !raw.meaning) return
      const incoming = { ...initialSchedule(), ...raw, id: raw.id || newId() }
      const existing = byId.get(incoming.id)
      if (!existing) {
        byId.set(incoming.id, incoming)
        added++
      } else if ((incoming.lastReviewedAt || 0) > (existing.lastReviewedAt || 0)) {
        // 同一张卡在两台设备上都复习过：谁的复习记录更新，就保留谁的
        byId.set(incoming.id, incoming)
        updated++
      }
    })

    const merged = Array.from(byId.values())
    await putCards(merged)
    setCards(merged)
    showToast(`导入完成：新增 ${added} 张，更新 ${updated} 张`)
  }

  // ——— 派生数据（每次渲染时现算，不单独存一份 state） ———
  //
  // 【这里也踩过一个坑，而且是在看截图时才发现的】
  // 我原来写的是 cards.filter((c) => c.due <= now)，其中 now 是「每 30 秒更新一次」的 state。
  // 结果：你在 15 秒时新录了一张卡，它的到期时间是 15 秒，但 now 还停在 0 秒，
  // 于是「15 <= 0」不成立，顶栏显示「今日任务已清空」——明明有待复习的卡。
  // 教训：**用来做判断的时间，一定要当场取，不要用缓存的。**
  // 缓存时间戳只适合做「每隔一会儿重画一次界面」的触发器，不适合做逻辑判断的依据。
  const nowTs = Date.now()
  const dueCount = cards.filter((c) => c.due <= nowTs).length
  const futureCards = cards.filter((c) => c.due > nowTs)
  const nextDueText =
    futureCards.length > 0
      ? `下一批卡片 ${describeDue(Math.min(...futureCards.map((c) => c.due)), nowTs)}到期。`
      : '你还没有录入任何卡片。'

  if (loading) {
    return (
      <div className="app">
        <div className="empty" style={{ margin: 'auto' }}>
          正在打开你的学习库…
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>学习中枢</h1>
        <p className="sub">
          {cards.length} 张卡片
          {dueCount > 0 ? `　·　${dueCount} 张待复习` : '　·　今日任务已清空'}
        </p>
      </header>

      {tab === 'today' && (
        <ReviewPage
          // key 变化时 React 会把这个组件整个重建成新的，
          // 于是「复习到第几张」也被重置为 0。这就是「再来一轮」的实现方式。
          key={sessionKey}
          queue={queue}
          totalCount={cards.length}
          onRate={handleRate}
          nextDueText={nextDueText}
          onGoAdd={() => setTab('add')}
          onRestart={() => {
            setQueue([])
            setSessionKey((k) => k + 1)
          }}
        />
      )}

      {tab === 'cards' && (
        <CardsPage
          cards={cards}
          onEdit={(card) => {
            setEditingCard(card)
            setTab('add')
          }}
          onDelete={handleDelete}
          onGoAdd={() => setTab('add')}
        />
      )}

      {tab === 'add' && (
        <AddPage
          onSave={handleSave}
          editingCard={editingCard}
          onCancelEdit={() => {
            setEditingCard(null)
            setTab('cards')
          }}
          onDone={() => {}}
        />
      )}

      {tab === 'data' && (
        <DataPage
          cards={cards}
          onExport={handleExport}
          onImport={handleImport}
          onClearAll={handleClearAll}
        />
      )}

      <nav className="nav">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'active' : ''}
            onClick={() => {
              // 点「添加」时如果不是在编辑，就清掉上次的编辑状态，
              // 避免用户以为在新增，结果改掉了一张老卡片
              if (t.key === 'add' && editingCard && tab !== 'add') {
                setEditingCard(null)
              }
              setTab(t.key)
            }}
          >
            <span className="icon">{t.icon}</span>
            {t.label}
            {t.key === 'today' && dueCount > 0 && (
              <span className="badge">{dueCount > 99 ? '99+' : dueCount}</span>
            )}
          </button>
        ))}
      </nav>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
