import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import api from '../apiClient'

const weekLabels = ['??, '??, '??, '??, '紐?, '湲?, '??]
const statusOptions = ['遺?ъ쨷', '由ъ퐳?湲?, '?덉빟', '臾댄슚', '?덉빟遺??, '?댁썝?꾨즺']

const buildTimes = () => {
  const times = []
  const start = 10 * 60
  const end = 20 * 60 + 30
  for (let mins = start; mins <= end; mins += 30) {
    const hh = String(Math.floor(mins / 60)).padStart(2, '0')
    const mm = String(mins % 60).padStart(2, '0')
    times.push(`${hh}:${mm}`)
  }
  return times
}

const timeOptions = buildTimes()

const formatPhone = (value) => {
  if (!value) return '-'
  let digits = String(value).replace(/\D/g, '')
  if (digits.startsWith('82')) {
    digits = `0${digits.slice(2)}`
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return value
}

const formatDateKey = (date) => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const formatTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}



const calendarStatuses = new Set(['예약', '내원완료', '예약부도'])

export default function TmCalendar() {
  const { user } = useSelector((state) => state.auth)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [activeLead, setActiveLead] = useState(null)
  const [form, setForm] = useState({
    status: '',
    region: '',
    memo: '',
    date: '',
    time: '',
  })
  const [memos, setMemos] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return
      try {
        setLoading(true)
        const res = await api.get('/dbdata', {
          params: { tm: user.id },
        })
        setReservations((res.data || []).filter((row) => {
          const status = String(row['상태'] || '').trim()
          return calendarStatuses.has(status) && Boolean(row['예약_내원일시'])
        }))
        setError('')
      } catch (err) {
        setError('?덉빟 ?곗씠?곕? 遺덈윭?ㅼ? 紐삵뻽?듬땲??')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user?.id])

  const monthLabel = useMemo(() => {
    const yyyy = currentMonth.getFullYear()
    const mm = String(currentMonth.getMonth() + 1).padStart(2, '0')
    return `${yyyy}.${mm}`
  }, [currentMonth])

  const monthReservations = useMemo(() => {
    const month = currentMonth.getMonth()
    const year = currentMonth.getFullYear()
    return reservations.filter((item) => {
      const date = new Date(item['?덉빟_?댁썝?쇱떆'])
      return (
        !Number.isNaN(date.getTime()) &&
        date.getFullYear() === year &&
        date.getMonth() === month
      )
    })
  }, [reservations, currentMonth])

  const reservationsByDate = useMemo(() => {
    const map = new Map()
    monthReservations.forEach((item) => {
      const date = new Date(item['?덉빟_?댁썝?쇱떆'])
      if (Number.isNaN(date.getTime())) return
      const key = formatDateKey(date)
      const list = map.get(key) || []
      list.push(item)
      map.set(key, list)
    })
    map.forEach((list, key) => {
      list.sort((a, b) => {
        const ta = new Date(a['?덉빟_?댁썝?쇱떆']).getTime()
        const tb = new Date(b['?덉빟_?댁썝?쇱떆']).getTime()
        return ta - tb
      })
      map.set(key, list)
    })
    return map
  }, [monthReservations])

  const calendarCells = useMemo(() => {
    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    const startDay = start.getDay()
    const firstCell = new Date(start)
    firstCell.setDate(start.getDate() - startDay)
    const cells = []
    for (let i = 0; i < 42; i += 1) {
      const date = new Date(firstCell)
      date.setDate(firstCell.getDate() + i)
      cells.push(date)
    }
    return cells
  }, [currentMonth])

  const selectedReservations = selectedDate ? reservationsByDate.get(selectedDate) || [] : []

  const openModal = async (lead) => {
    setSelectedDate('')
    setActiveLead(lead)
    setForm({
      status: lead['?곹깭'] || '',
      region: lead['嫄곗＜吏'] || '',
      memo: '',
      date: '',
      time: '',
    })
    setMemos([])
    setModalOpen(true)
    try {
      const res = await api.get('/tm/memos', { params: { phone: lead['?곕씫泥?] } })
      setMemos(res.data || [])
    } catch {
      setMemos([])
    }
  }

  const handleStatusChange = (value) => {
    if (!activeLead) return
    if (value === '遺?ъ쨷') {
      const missCount = Number(activeLead['遺?ъ쨷_?잛닔'] || 0) + 1
      setForm((prev) => ({ ...prev, status: value, memo: `${missCount}李⑤??? }))
      return
    }
    if (value === '?덉빟遺??) {
      const reservationText = activeLead['?덉빟_?댁썝?쇱떆']
        ? formatDateTime(activeLead['?덉빟_?댁썝?쇱떆'])
        : ''
      const memo = reservationText ? `?덉빟遺??${reservationText}` : '?덉빟遺??
      setForm((prev) => ({ ...prev, status: value, memo }))
      return
    }
    setForm((prev) => ({ ...prev, status: value }))
  }

  const handleSave = async () => {
    if (!activeLead || !user?.id) return
    if (!form.status) return
    if (form.status === '?덉빟' && (!form.date || !form.time)) return

    const reservationAt =
      form.status === '?덉빟' ? `${form.date} ${form.time}:00` : null

    try {
      setSaving(true)
      await api.post(`/tm/leads/${activeLead.id}/update`, {
        status: form.status,
        region: form.region,
        memo: form.memo,
        tmId: user.id,
        reservationAt,
        phone: activeLead['?곕씫泥?] || '',
      })
      setReservations((prev) => {
        const updated = prev.map((row) =>
          row.id === activeLead.id
            ? {
                ...row,
                ?곹깭: form.status,
                嫄곗＜吏: form.region,
                ?덉빟_?댁썝?쇱떆: reservationAt || row['?덉빟_?댁썝?쇱떆'],
                肄쒗슏?? (Number(row['肄쒗슏??] || 0) + (['遺?ъ쨷', '由ъ퐳?湲?, '?덉빟', '?덉빟遺??].includes(form.status) ? 1 : 0)),
                遺?ъ쨷_?잛닔: form.status === '遺?ъ쨷' ? Number(row['遺?ъ쨷_?잛닔'] || 0) + 1 : row['遺?ъ쨷_?잛닔'],
                ?덉빟遺???잛닔: form.status === '?덉빟遺?? ? Number(row['?덉빟遺???잛닔'] || 0) + 1 : row['?덉빟遺???잛닔'],
                理쒓렐硫붾え?댁슜: form.memo || row['理쒓렐硫붾え?댁슜'],
                理쒓렐硫붾え?쒓컙: form.memo ? new Date().toISOString() : row['理쒓렐硫붾え?쒓컙'],
              }
            : row
        )
        if (form.status !== '?덉빟') {
          return updated.filter((row) => row.id !== activeLead.id)
        }
        return updated
      })
      setModalOpen(false)
    } catch (err) {
      setError('??μ뿉 ?ㅽ뙣?덉뒿?덈떎.')
    } finally {
      setSaving(false)
    }
  }

  if (!user?.id) {
    return <div className="db-list">TM ?뺣낫媛 ?놁뒿?덈떎.</div>
  }

  return (
    <div className="tm-calendar">
      <div className="tm-calendar-header">
        <div>
          <h1>罹섎┛??/h1>
          <p>?덉빟 ?몄썝???좎쭨蹂꾨줈 ?뺤씤?섏꽭??</p>
        </div>
        <div className="tm-calendar-nav">
          <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>
            ?댁쟾
          </button>
          <div className="tm-calendar-month">{monthLabel}</div>
          <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>
            ?ㅼ쓬
          </button>
        </div>
      </div>

      {error ? <div className="db-list-error">{error}</div> : null}

      {loading ? (
        <div className="db-list-empty">遺덈윭?ㅻ뒗 以?..</div>
      ) : (
        <div className="tm-calendar-grid">
          {weekLabels.map((label) => (
            <div key={label} className="tm-calendar-week">{label}</div>
          ))}
          {calendarCells.map((date) => {
            const key = formatDateKey(date)
            const count = (reservationsByDate.get(key) || []).length
            const isCurrentMonth = date.getMonth() === currentMonth.getMonth()
            return (
              <button
                type="button"
                key={key}
                className={`tm-calendar-cell${isCurrentMonth ? '' : ' is-outside'}${count ? ' has-reservation' : ''}`}
                onClick={() => {
                  if (!count) return
                  setSelectedDate(key)
                }}
              >
                <div className="tm-calendar-date">{date.getDate()}</div>
                {count ? <div className="tm-calendar-count">{count}紐?/div> : null}
              </button>
            )
          })}
        </div>
      )}

      {selectedDate ? (
        <div className="tm-calendar-modal">
          <div className="tm-calendar-backdrop" onClick={() => setSelectedDate('')} />
          <div className="tm-calendar-card">
            <div className="tm-calendar-card-header">
              <div>
                <h3>{selectedDate} ?덉빟 紐⑸줉</h3>
                <p>?쒓컙 ?대Ⅸ?쒖쑝濡??뺣젹?⑸땲??</p>
              </div>
              <button type="button" onClick={() => setSelectedDate('')}>?リ린</button>
            </div>
            {selectedReservations.length === 0 ? (
              <div className="tm-calendar-empty">?덉빟???놁뒿?덈떎.</div>
            ) : (
              <div className="tm-calendar-list">
                {selectedReservations.map((item) => (
                  <div
                    key={item.id}
                    className="tm-calendar-row db-list-click"
                    onClick={() => openModal(item)}
                  >
                    <div className="tm-calendar-time">{formatTime(item['?덉빟_?댁썝?쇱떆'])}</div>
                    <div className="tm-calendar-cell-info">
                      <div className="tm-calendar-label">?대쫫</div>
                      <div className="tm-calendar-value">{item['?대쫫'] || '-'}</div>
                    </div>
                    <div className="tm-calendar-cell-info">
                      <div className="tm-calendar-label">?꾪솕踰덊샇</div>
                      <div className="tm-calendar-value">{formatPhone(item['?곕씫泥?])}</div>
                    </div>
                    <div className="tm-calendar-cell-info">
                      <div className="tm-calendar-label">?대깽??/div>
                      <div className="tm-calendar-value">{item['?대깽??] || '-'}</div>
                    </div>
                    <div className="tm-calendar-cell-info">
                      <div className="tm-calendar-label">嫄곗＜吏</div>
                      <div className="tm-calendar-value">{item['嫄곗＜吏'] || '-'}</div>
                    </div>
                    <div className="tm-calendar-cell-info tm-calendar-memo">
                      <div className="tm-calendar-label">硫붾え</div>
                      <div className="tm-calendar-value" title={item['理쒓렐硫붾え?댁슜'] || ''}>
                        {item['理쒓렐硫붾え?댁슜'] || '-'}
                      </div>
                    </div>
                    <div className="tm-calendar-cell-info tm-calendar-call">
                      <div className="tm-calendar-label">肄쒗슏??/div>
                      <div className="tm-calendar-value">{item['肄쒗슏??] ?? 0}??/div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {modalOpen && activeLead ? (
        <div className="tm-lead-modal">
          <div className="tm-lead-backdrop" onClick={() => setModalOpen(false)} />
          <div className="tm-lead-card">
            <div className="tm-lead-header">
              <h3>怨좉컼 ?곷떞 湲곕줉</h3>
              <button type="button" onClick={() => setModalOpen(false)}>?リ린</button>
            </div>

            <div className="tm-lead-top">
              <div className="tm-lead-summary-card">
                <div className="tm-lead-summary-label">?몄엯?좎쭨</div>
                <div className="tm-lead-summary-value">{formatDateTime(activeLead['?몄엯?좎쭨'])}</div>
              </div>
              <div className="tm-lead-summary-card">
                <div className="tm-lead-summary-label">?곷떞媛?μ떆媛?/div>
                <div className="tm-lead-summary-value">{activeLead['?곷떞媛?μ떆媛?] || '-'}</div>
              </div>
              <div className="tm-lead-summary-card">
                <div className="tm-lead-summary-label">?대깽??/div>
                <div className="tm-lead-summary-value">{activeLead['?대깽??] || '-'}</div>
              </div>
              <div className="tm-lead-summary-card">
                <div className="tm-lead-summary-label">嫄곗＜吏</div>
                <div className="tm-lead-summary-value">{activeLead['嫄곗＜吏'] || '-'}</div>
              </div>
            </div>

            <div className="tm-lead-body">
              <div className="tm-lead-left">
                <div className="tm-lead-memos">
                  <div className="tm-lead-memos-title">理쒓렐 硫붾え</div>
                  {memos.length === 0 ? (
                    <div className="tm-lead-memos-empty">硫붾え媛 ?놁뒿?덈떎.</div>
                  ) : (
                    <div className="tm-lead-memos-list">
                      {memos.map((memo, idx) => (
                        <div key={idx} className="tm-lead-memo">
                          <div className="tm-lead-memo-time">{formatDateTime(memo.memo_time)}</div>
                          <div className="tm-lead-memo-content">{memo.memo_content}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="tm-lead-right">
                <div className="tm-lead-summary">
                  <div className="tm-lead-identity">
                    <div className="tm-lead-identity-label">怨좉컼 ?뺣낫</div>
                    <div className="tm-lead-identity-name">{activeLead['?대쫫'] || '-'}</div>
                    <div className="tm-lead-identity-phone">{formatPhone(activeLead['?곕씫泥?])}</div>
                  </div>
                </div>

                <div className="tm-lead-form">
                  <label>
                    ?곹깭
                    <select value={form.status} onChange={(e) => handleStatusChange(e.target.value)}>
                      <option value="">?좏깮</option>
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </label>

                  {form.status === '?덉빟' ? (
                    <div className="tm-lead-reservation">
                      <label>
                        ?덉빟 ?좎쭨
                        <input
                          type="date"
                          value={form.date}
                          onChange={(e) => setForm({ ...form, date: e.target.value })}
                        />
                      </label>
                      <label>
                        ?덉빟 ?쒓컙
                        <select
                          value={form.time}
                          onChange={(e) => setForm({ ...form, time: e.target.value })}
                        >
                          <option value="">?쒓컙 ?좏깮</option>
                          {timeOptions.map((time) => (
                            <option key={time} value={time}>{time}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}

                  <label>
                    嫄곗＜吏
                    <input
                      type="text"
                      value={form.region}
                      onChange={(e) => setForm({ ...form, region: e.target.value })}
                    />
                  </label>

                  <label>
                    ?곷떞 硫붾え
                    <textarea
                      value={form.memo}
                      onChange={(e) => setForm({ ...form, memo: e.target.value })}
                      rows="5"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="tm-lead-actions">
              <button
                type="button"
                onClick={() => setForm((prev) => ({
                  ...prev,
                  memo: prev.memo ? `${prev.memo}\n${formatDateTime(new Date())}` : formatDateTime(new Date()),
                }))}
              >
                ?꾩옱?쒓컙湲곗엯
              </button>
              <button
                type="button"
                onClick={() => setForm((prev) => ({
                  ...prev,
                  memo: prev.memo ? `${prev.memo}/臾몄옄蹂대깂` : '/臾몄옄蹂대깂',
                }))}
              >
                臾몄옄蹂대깂
              </button>
              <button type="button" onClick={() => setModalOpen(false)}>痍⑥냼</button>
              <button type="button" onClick={handleSave} disabled={saving}>
                {saving ? '???以?..' : '???}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

