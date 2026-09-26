import { useState, useEffect } from 'react'

/**
 * AddPage —— 录卡片页
 *
 * 【产品设计关键点：录入成本决定一切】
 * 这类工具最大的死因不是复习算法不好，而是「录卡太麻烦」。
 * 用户录 20 个词觉得累，就不录了，工具就死了。
 * 所以这一页做了两个模式：
 *   单张录入 —— 适合精雕细琢、要写例句的词
 *   批量录入 —— 一行一个词，适合从课本/单词表一次性搬进来
 * 这一个功能的价值，可能比复习算法本身还高。
 *
 * 【术语：受控表单】
 * 每个输入框的 value 都绑在一个 state 上，onChange 时更新 state。
 * 好处是「想拿到全部数据」和「想清空表单」都只是读写一个普通对象，
 * 不用去 DOM 里一个个查元素。React 里几乎所有表单都这么写。
 */

const EMPTY = { term: '', reading: '', meaning: '', example: '', tags: '' }

export default function AddPage({ onSave, editingCard, onCancelEdit, onDone }) {
  const [form, setForm] = useState(EMPTY)
  const [batchMode, setBatchMode] = useState(false)
  const [batchText, setBatchText] = useState('')
  const [message, setMessage] = useState('')

  // 当父组件把「要编辑的卡片」传进来时，把表单填上。
  // useEffect 的意思是「当某个值变化后，去做一件副作用的事」。
  // 这里是：editingCard 变了，就同步一下表单内容。
  useEffect(() => {
    if (editingCard) {
      setForm({
        term: editingCard.term || '',
        reading: editingCard.reading || '',
        meaning: editingCard.meaning || '',
        example: editingCard.example || '',
        tags: (editingCard.tags || []).join(' '),
      })
      setBatchMode(false)
    } else {
      setForm(EMPTY)
    }
  }, [editingCard])

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
    // { ...f, [key]: value } 是「展开语法」：
    // 把 f 里原有的字段全抄过来，只替换 key 这一个。
    // 【为什么不直接写 f[key] = value？】那会「原地修改」原对象，
    // React 靠「对象是不是换了个新的」来判断要不要重画界面，原地改它检测不到。这叫「不可变更新」。
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.term.trim() || !form.meaning.trim()) {
      setMessage('单词和释义是必须填的')
      return
    }
    onSave({
      term: form.term.trim(),
      reading: form.reading.trim(),
      meaning: form.meaning.trim(),
      example: form.example.trim(),
      tags: form.tags
        .split(/[\s,，]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    })
    setForm(EMPTY) // 清空，方便连着录下一个
    setMessage('已保存 ✓ 继续录下一个')
    onDone?.()
  }

  function handleBatch() {
    // 每行格式：单词 | 读音 | 释义 | 例句   （后三项可以省略）
    const lines = batchText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    const parsed = []
    const bad = []
    lines.forEach((line, i) => {
      const parts = line.split('|').map((p) => p.trim())
      const [term, reading, meaning, example] = parts
      if (!term || !meaning) {
        bad.push(i + 1)
        return
      }
      parsed.push({ term, reading, meaning, example })
    })

    if (parsed.length === 0) {
      setMessage('没有解析出有效内容。每行至少要有「单词 | 释义」')
      return
    }

    onSave(parsed, { batch: true })
    setBatchText('')
    setMessage(
      `成功导入 ${parsed.length} 张卡片 ✓` +
        (bad.length ? `　⚠️ 第 ${bad.join('、')} 行格式不对已跳过` : '')
    )
  }

  return (
    <div className="page">
      <div className="stack">
        {editingCard && (
          <div className="note">
            正在编辑 <b>{editingCard.term}</b>。
            <button
              className="btn btn-ghost"
              style={{ marginLeft: 8, padding: '4px 10px', fontSize: 13 }}
              onClick={onCancelEdit}
            >
              取消编辑
            </button>
          </div>
        )}

        {!editingCard && (
          <div className="toolbar">
            <button
              className={'btn ' + (!batchMode ? 'btn-primary' : 'btn-ghost')}
              onClick={() => setBatchMode(false)}
            >
              单张录入
            </button>
            <button
              className={'btn ' + (batchMode ? 'btn-primary' : 'btn-ghost')}
              onClick={() => setBatchMode(true)}
            >
              ⚡ 批量录入
            </button>
          </div>
        )}

        {batchMode && !editingCard ? (
          <>
            <div className="field">
              <label>一行一个词，用竖线 <code>|</code> 分隔</label>
              <textarea
                rows={10}
                placeholder={
                  'apple | /ˈæpl/ | n. 苹果 | I ate an apple.\n' +
                  'abandon | /əˈbændən/ | v. 放弃，抛弃\n' +
                  '気持ち | きもち | 心情，感觉'
                }
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
              />
              <div className="tip">
                格式：<b>单词 | 读音 | 释义 | 例句</b>。读音、例句可以留空不写。
              </div>
            </div>

            <div className="note">
              <b>为什么要有这个功能？</b> 因为从单词表搬 200 个词，
              如果一个个填表单，你要花一个下午。录入成本直接决定你会不会坚持用这个软件。
              <br />
              <br />
              <b>术语：为什么要用竖线 <code>|</code> 分隔？</b>
              因为释义里经常有逗号、空格。用逗号分隔的话，
              「v. 放弃，抛弃」会被切错。选一个正文里几乎不会出现的符号做分隔符，是数据录入的常规技巧。
            </div>

            <button className="btn btn-primary btn-block" onClick={handleBatch}>
              导入这些卡片
            </button>
          </>
        ) : (
          <form className="card stack" onSubmit={handleSubmit}>
            <div className="field">
              <label>单词 / 短语　<span className="tip">必填</span></label>
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                placeholder="比如 abandon"
                value={form.term}
                onChange={(e) => set('term', e.target.value)}
              />
            </div>

            <div className="field">
              <label>读音　<span className="tip">选填，音标或假名</span></label>
              <input
                type="text"
                autoComplete="off"
                placeholder="比如 /əˈbændən/　或　きもち"
                value={form.reading}
                onChange={(e) => set('reading', e.target.value)}
              />
            </div>

            <div className="field">
              <label>释义　<span className="tip">必填</span></label>
              <textarea
                rows={2}
                placeholder="比如 v. 放弃，抛弃，遗弃"
                value={form.meaning}
                onChange={(e) => set('meaning', e.target.value)}
              />
            </div>

            <div className="field">
              <label>例句　<span className="tip">选填，但强烈建议写</span></label>
              <textarea
                rows={2}
                placeholder="比如 He abandoned his car in the snow."
                value={form.example}
                onChange={(e) => set('example', e.target.value)}
              />
            </div>

            <div className="field">
              <label>标签　<span className="tip">选填，空格分隔</span></label>
              <input
                type="text"
                autoComplete="off"
                placeholder="比如 考研 unit3 高频"
                value={form.tags}
                onChange={(e) => set('tags', e.target.value)}
              />
            </div>

            <button className="btn btn-primary btn-block" type="submit">
              {editingCard ? '保存修改' : '保存并继续录入'}
            </button>

            <div className="note">
              <b>为什么例句这么重要？</b> 孤立地背「abandon = 放弃」，
              大脑记的是一个抽象符号，很容易忘。
              但如果你记得「他把车扔在雪地里」，这个画面会顺手把单词一起带出来。
              这叫<b>情境记忆</b>——大脑对故事的记忆能力远强于对列表的记忆能力。
            </div>
          </form>
        )}

        {message && <div className="toast">{message}</div>}
      </div>
    </div>
  )
}
