import { useEffect, useMemo, useState } from 'react'
import api from '../apiClient'

const weekLabels = ['일', '월', '화', '수', '목', '금', '토']

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

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const [dbRes, tmRes] = await Promise.all([
          api.get('/dbdata', { params: { status: '예약' } }),
          api.get('/tm/agents'),
        ])
        setReservations(dbRes.data || [])
        setAgents(tmRes.data || [])
        setError('')
      } catch (err) {
        setError('예약 데이터를 불러오지 못했습니다.')
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
      const date = new Date(item['예약_내원일시'])
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
      const date = new Date(item['예약_내원일시'])
      if (Number.isNaN(date.getTime())) return
      const key = formatDateKey(date)
      const list = map.get(key) || []
      list.push(item)
      map.set(key, list)
    })
    map.forEach((list, key) => {
      list.sort((a, b) => {
        const ta = new Date(a['예약_내원일시']).getTime()
        const tb = new Date(b['예약_내원일시']).getTime()
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

  return (
    <div className="tm-calendar">
      <div className="tm-calendar-header">
        <div>
          <h1>캘린더</h1>
          <p>전체 예약 인원을 날짜별로 확인하세요.</p>
        </div>
        <div className="tm-calendar-nav">
          <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>
            이전
          </button>
          <div className="tm-calendar-month">{monthLabel}</div>
          <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>
            다음
          </button>
        </div>
      </div>

      {error ? <div className="db-list-error">{error}</div> : null}

      {loading ? (
        <div className="db-list-empty">불러오는 중...</div>
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
                {count ? <div className="tm-calendar-count">{count}명</div> : null}
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
                <h3>{selectedDate} 예약 목록</h3>
                <p>시간 이른순으로 정렬됩니다.</p>
              </div>
              <button type="button" onClick={() => setSelectedDate('')}>닫기</button>
            </div>
            {selectedReservations.length === 0 ? (
              <div className="tm-calendar-empty">예약이 없습니다.</div>
            ) : (
              <div className="tm-calendar-list">
                {selectedReservations.map((item) => (
                  <div key={item.id} className="tm-calendar-row admin-calendar-row">
                    <div className="tm-calendar-time">{formatTime(item['예약_내원일시'])}</div>
                    <div className="tm-calendar-cell-info">
                      <div className="tm-calendar-label">이름</div>
                      <div className="tm-calendar-value">{item['이름'] || '-'}</div>
                    </div>
                    <div className="tm-calendar-cell-info">
                      <div className="tm-calendar-label">전화번호</div>
                      <div className="tm-calendar-value">{formatPhone(item['연락처'])}</div>
                    </div>
                    <div className="tm-calendar-cell-info">
                      <div className="tm-calendar-label">이벤트</div>
                      <div className="tm-calendar-value">{item['이벤트'] || '-'}</div>
                    </div>
                    <div className="tm-calendar-cell-info">
                      <div className="tm-calendar-label">거주지</div>
                      <div className="tm-calendar-value">{item['거주지'] || '-'}</div>
                    </div>
                    <div className="tm-calendar-cell-info tm-calendar-memo">
                      <div className="tm-calendar-label">메모</div>
                      <div className="tm-calendar-value" title={item['최근메모내용'] || ''}>
                        {item['최근메모내용'] || '-'}
                      </div>
                    </div>
                    <div className="tm-calendar-cell-info tm-calendar-call">
                      <div className="tm-calendar-label">콜횟수</div>
                      <div className="tm-calendar-value">{item['콜횟수'] ?? 0}회</div>
                    </div>
                    <div className="tm-calendar-cell-info">
                      <div className="tm-calendar-label">담당TM</div>
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
