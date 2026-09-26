import { useRef } from 'react'
import { DAY_MS, describeDue } from '../lib/srs.js'

/**
 * DataPage —— 「我的」页：数据备份与统计
 *
 * 【为什么一个纯本地软件，第一版就必须有导出功能？】
 * 这是产品经理必须有的「风险意识」。
 * 数据只存在手机浏览器里，那么下面任何一件事都会让数据消失：
 *   · 清理浏览器缓存 / 「清除全部数据」
 *   · 手机换新、恢复出厂
 *   · 浏览器的存储被系统回收（长时间不访问时，手机系统会清理）
 *   · 手滑删掉了主屏幕图标，而某些浏览器把「卸载 PWA」当成「清空数据」
 * 没有导出 = 用户有一天会一夜之间失去全部积累。这是产品事故，不是小瑕疵。
 * 所以：**先做存档，再做功能**。这条经验在任何软件上都成立。
 */
export default function DataPage({ cards, onImport, onClearAll, onExport }) {
  const fileRef = useRef(null)

  // 【术语：useRef】
  // 它能在多次界面重画之间「记住一个值」，但改它不会触发重画。
  // 这里用它来拿到隐藏的文件选择框，从而能用 JS 触发「点击选择文件」。
  const fileInputRef = useRef(null)

  const now = Date.now()
  const total = cards.length
  const dueNow = cards.filter((c) => c.due <= now).length
  const learned = cards.filter((c) => c.reps >= 3).length // 连续记住 3 次以上就算「基本掌握」
  const lapsed = cards.filter((c) => c.lapses > 0).length
  const totalReviews = cards.reduce((sum, c) => sum + c.reps + c.lapses, 0)

  // 平均间隔：衡量「我的记忆整体推进到哪一步了」
  const avgInterval =
    total > 0 ? Math.round(cards.reduce((s, c) => s + (c.interval || 0), 0) / total) : 0

  // 今天/明天/本周各有多少要复习 —— 让你能预判工作量
  const in7days = cards.filter((c) => c.due > now && c.due <= now + 7 * DAY_MS).length

  function handleImportClick() {
    fileInputRef.current?.click()
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const list = Array.isArray(data) ? data : data.cards
      if (!Array.isArray(list)) throw new Error('文件里没有找到卡片数组')
      onImport(list)
    } catch (err) {
      alert('导入失败：' + err.message + '\n请确认选择的是本软件导出的 .json 备份文件。')
    }
    // 清空 input 的值，否则连续选同一个文件不会触发 change
    e.target.value = ''
  }

  return (
    <div className="page">
      <div className="stack">
        <div className="stat-grid">
          <div className="stat">
            <div className="num">{total}</div>
            <div className="label">卡片总数</div>
          </div>
          <div className="stat">
            <div className="num" style={{ color: 'var(--rate-again)' }}>
              {dueNow}
            </div>
            <div className="label">现在待复习</div>
          </div>
          <div className="stat">
            <div className="num" style={{ color: 'var(--rate-good)' }}>
              {learned}
            </div>
            <div className="label">已基本掌握</div>
          </div>
        </div>

        <div className="stat-grid">
          <div className="stat">
            <div className="num">{totalReviews}</div>
            <div className="label">累计复习次数</div>
          </div>
          <div className="stat">
            <div className="num">{avgInterval}</div>
            <div className="label">平均间隔（天）</div>
          </div>
          <div className="stat">
            <div className="num">{lapsed}</div>
            <div className="label">忘过的卡片</div>
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>接下来 7 天</div>
          <div className="muted" style={{ fontSize: 14 }}>
            还有 <b style={{ color: 'var(--text)' }}>{in7days}</b> 张卡片会在 7 天内到期。
            {total > 0 && (
              <>
                {' '}
                最远的一张要等 {describeDue(Math.max(...cards.map((c) => c.due)))}。
              </>
            )}
          </div>
        </div>

        <div className="card stack">
          <div style={{ fontWeight: 700 }}>数据备份</div>
          <div className="note">
            数据只存在这台手机的浏览器里，<b>没有上传到任何服务器</b>。
            好处是免费、私密、断网可用；代价是<b>清缓存或换手机就会丢</b>。
            <br />
            建议：每学完一批就导出一次，文件存到微信收藏或网盘里。
          </div>
          <button
            className="btn btn-primary btn-block"
            onClick={onExport}
            disabled={total === 0}
          >
            ⬇ 导出备份（.json 文件）
          </button>
          <button className="btn btn-ghost btn-block" onClick={handleImportClick}>
            ⬆ 从备份导入（合并，不覆盖）
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleFile}
          />
        </div>

        <div className="card stack">
          <div style={{ fontWeight: 700 }}>危险操作</div>
          <button
            className="btn btn-danger btn-block"
            onClick={() => {
              if (
                confirm(
                  `确定删除全部 ${total} 张卡片吗？此操作无法撤销。\n建议先导出备份。`
                )
              ) {
                if (confirm('再确认一次：真的要清空吗？')) onClearAll()
              }
            }}
            disabled={total === 0}
          >
            清空所有卡片
          </button>
        </div>

        <div className="note">
          <b>学习中枢 v0.1</b>
          <br />
          这是你自己的软件。下一步想加什么功能，直接跟负责开发的 AI 说就可以。
        </div>
      </div>
    </div>
  )
}
