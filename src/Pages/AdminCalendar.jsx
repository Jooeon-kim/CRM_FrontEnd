import { useEffect, useMemo, useState } from 'react'
import api from '../apiClient'

const weekLabels = ['??, '??, '??, '??, '紐?, '湲?, '??]

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

const parseDateTime = (value) => {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  const raw = String(value).trim()
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (m) {
    const year = Number(m[1])
    const month = Number(m[2]) - 1
    const day = Number(m[3])
    const hour = Number(m[4])
    const minute = Number(m[5])
    const second = Number(m[6] || '0')
    const local = new Date(year, month, day, hour, minute, second)
    return Number.isNaN(local.getTime()) ? null : local
  }

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const formatTime = (value) => {
  if (!value) return ''
  const date = parseDateTime(value)
  if (!date) return ''
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}



const calendarStatuses = new Set(['예약', '내원완료', '예약부도'])

export default function AdminCalendar() {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [reservations, setReservations] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [tmFilter, setTmFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const [dbRes, tmRes] = await Promise.all([
          api.get('/dbdata'),
          api.get('/tm/agents'),
        ])
        setReservations((dbRes.data || []).filter((row) => {
          const status = String(row['상태'] || '').trim()
          return calendarStatuses.has(status) && Boolean(row['예약_내원일시'])
        }))
        setAgents(tmRes.data || [])
        setError('')
      } catch (err) {
        setError('?덉빟 ?곗씠?곕? 遺덈윭?ㅼ? 紐삵뻽?듬땲??')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const tmMap = useMemo(() => {
    const map = new Map()
    agents.forEach((tm) => {
      map.set(String(tm.id), tm.name)
    })
    return map
  }, [agents])

  const monthLabel = useMemo(() => {
    const yyyy = currentMonth.getFullYear()
    const mm = String(currentMonth.getMonth() + 1).padStart(2, '0')
    return `${yyyy}.${mm}`
  }, [currentMonth])

  const monthReservations = useMemo(() => {
    const month = currentMonth.getMonth()
    const year = currentMonth.getFullYear()
    return reservations.filter((item) => {
      const date = parseDateTime(item['?덉빟_?댁썝?쇱떆'])
      return (
        !!date &&
        date.getFullYear() === year &&
        date.getMonth() === month
      )
    })
  }, [reservations, currentMonth])

  const filteredReservations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    const termDigits = normalizePhoneDigits(term)
    return monthReservations.filter((item) => {
      const passTm = tmFilter === 'all' || String(item.tm) === String(tmFilter)
      if (!passTm) return false
      if (!term) return true

      const name = String(item['?대쫫'] || '').toLowerCase()
      const event = String(item['?대깽??] || '').toLowerCase()
      const phone = normalizePhoneDigits(item['?곕씫泥?])
      return (
        name.includes(term) ||
        event.includes(term) ||
        (termDigits ? phone.includes(termDigits) : false)
      )
    })
  }, [monthReservations, tmFilter, searchTerm])

  const reservationsByDate = useMemo(() => {
    const map = new Map()
    filteredReservations.forEach((item) => {
      const date = parseDateTime(item['?덉빟_?댁썝?쇱떆'])
      if (!date) return
      const key = formatDateKey(date)
      const list = map.get(key) || []
      list.push(item)
      map.set(key, list)
    })
    map.forEach((list, key) => {
      list.sort((a, b) => {
        const ta = parseDateTime(a['?덉빟_?댁썝?쇱떆'])?.getTime() ?? Number.MAX_SAFE_INTEGER
        const tb = parseDateTime(b['?덉빟_?댁썝?쇱떆'])?.getTime() ?? Number.MAX_SAFE_INTEGER
        return ta - tb
      })
      map.set(key, list)
    })
    return map
  }, [filteredReservations])

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

  return (
    <div className="tm-calendar">
      <div className="tm-calendar-header">
        <div>
          <h1>罹섎┛??/h1>
          <p>?꾩껜 ?덉빟 ?몄썝???좎쭨蹂꾨줈 ?뺤씤?섏꽭??</p>
        </div>
        <div className="tm-assign-controls">
          <div className="tm-assign-filter">
            <select value={tmFilter} onChange={(e) => setTmFilter(e.target.value)}>
              <option value="all">?꾩껜 TM</option>
              {agents
                .filter((agent) => !agent.isAdmin)
                .map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
            </select>
          </div>
          <div className="tm-assign-search">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="?대쫫, ?꾪솕踰덊샇, ?대깽??寃??
            />
          </div>
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
                  <div key={item.id} className="tm-calendar-row admin-calendar-row">
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
                    <div className="tm-calendar-cell-info">
                      <div className="tm-calendar-label">?대떦TM</div>
                      <div className="tm-calendar-value">{tmMap.get(String(item.tm)) || item.tm || '-'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

