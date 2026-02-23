import { useEffect, useMemo, useState } from 'react'
import api from '../apiClient'

const weekLabels = ['일', '월', '화', '수', '목', '금', '토']
const isCalendarStatus = (value) => {
  const status = String(value || '').replace(/\s+/g, '').trim()
  if (!status) return false
  if (status.includes('예약부도')) return true
  if (status.includes('내원완료')) return true
  return status === '예약'
}

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
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/)
  if (iso) {
    const local = new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3]),
      Number(iso[4]),
      Number(iso[5]),
      Number(iso[6] || '0')
    )
    return Number.isNaN(local.getTime()) ? null : local
  }
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

const normalizePhoneDigits = (value) => {
  if (!value) return ''
  let digits = String(value).replace(/\D/g, '')
  if (digits.startsWith('82')) {
    digits = `0${digits.slice(2)}`
  }
  return digits
}

const toDateInput = (date = new Date()) => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const buildMonthRange = (monthDate) => {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
  return {
    from: toDateInput(start),
    to: toDateInput(end),
  }
}

const parseDateOnly = (value) => {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

const isSameDate = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const buildCompanyBarsByDate = (monthDate, rows) => {
  const map = new Map()
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)

  ;(rows || []).forEach((row) => {
    const srcStart = parseDateOnly(row.start_date)
    const srcEnd = parseDateOnly(row.end_date)
    if (!srcStart || !srcEnd) return
    if (srcEnd < srcStart) return

    const visibleStart = srcStart < monthStart ? monthStart : srcStart
    const visibleEnd = srcEnd > monthEnd ? monthEnd : srcEnd
    if (visibleEnd < visibleStart) return

    for (const d = new Date(visibleStart); d <= visibleEnd; d.setDate(d.getDate() + 1)) {
      const key = formatDateKey(d)
      const list = map.get(key) || []
      list.push({
        id: row.id,
        content: String(row.content || '').trim(),
        isStart: isSameDate(d, visibleStart),
        isEnd: isSameDate(d, visibleEnd),
      })
      map.set(key, list)
    }
  })

  return map
}

const getScheduleTypeLabel = (item) => {
  const type = String(item?.schedule_type || '').trim()
  if (type === '기타') {
    const custom = String(item?.custom_type || '').trim()
    return custom || '기타'
  }
  return type || '-'
}

const getScheduleClassName = (item) => {
  const type = String(item?.schedule_type || '').trim()
  return type === '휴무' ? 'is-off' : ''
}

const getReservationStatus = (value) => {
  const status = String(value || '').replace(/\s+/g, '').trim()
  if (status.includes('예약부도')) return '예약부도'
  if (status.includes('내원완료')) return '내원완료'
  if (status === '예약') return '예약'
  return ''
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
  const [tmFilter, setTmFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [schedules, setSchedules] = useState([])
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleEditId, setScheduleEditId] = useState(null)
  const [scheduleForm, setScheduleForm] = useState({
    date: toDateInput(new Date()),
    tmId: '',
    type: '휴무',
    customType: '',
    memo: '',
  })
  const [companyScheduleModalOpen, setCompanyScheduleModalOpen] = useState(false)
  const [companyScheduleSaving, setCompanyScheduleSaving] = useState(false)
  const [companyScheduleEditId, setCompanyScheduleEditId] = useState(null)
  const [companySchedules, setCompanySchedules] = useState([])
  const [companyScheduleForm, setCompanyScheduleForm] = useState({
    startDate: toDateInput(new Date()),
    endDate: toDateInput(new Date()),
    content: '',
  })

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const [dbRes, tmRes] = await Promise.all([
          api.get('/dbdata'),
          api.get('/tm/agents'),
        ])
        setReservations(
          (dbRes.data || []).filter((row) => {
            const status = String(row['상태'] || '').trim()
            return isCalendarStatus(status) && Boolean(row['예약_내원일시'])
          })
        )
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

  useEffect(() => {
    const loadSchedules = async () => {
      try {
        const { from, to } = buildMonthRange(currentMonth)
        const res = await api.get('/tm/schedules', { params: { from, to } })
        setSchedules(Array.isArray(res.data) ? res.data : [])
      } catch {
        setSchedules([])
      }
    }
    loadSchedules()
  }, [currentMonth])

  useEffect(() => {
    const loadCompanySchedules = async () => {
      try {
        const { from, to } = buildMonthRange(currentMonth)
        const res = await api.get('/company/schedules', { params: { from, to } })
        setCompanySchedules(Array.isArray(res.data) ? res.data : [])
      } catch {
        setCompanySchedules([])
      }
    }
    loadCompanySchedules()
  }, [currentMonth])

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
      const date = parseDateTime(item['예약_내원일시'])
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

      const name = String(item['이름'] || '').toLowerCase()
      const event = String(item['이벤트'] || '').toLowerCase()
      const phone = normalizePhoneDigits(item['연락처'])
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
      const date = parseDateTime(item['예약_내원일시'])
      if (!date) return
      const key = formatDateKey(date)
      const list = map.get(key) || []
      list.push(item)
      map.set(key, list)
    })
    map.forEach((list, key) => {
      list.sort((a, b) => {
        const ta = parseDateTime(a['예약_내원일시'])?.getTime() ?? Number.MAX_SAFE_INTEGER
        const tb = parseDateTime(b['예약_내원일시'])?.getTime() ?? Number.MAX_SAFE_INTEGER
        return ta - tb
      })
      map.set(key, list)
    })
    return map
  }, [filteredReservations])

  const schedulesByDate = useMemo(() => {
    const map = new Map()
    schedules.forEach((row) => {
      const key = String(row.schedule_date || '').slice(0, 10)
      if (!key) return
      const list = map.get(key) || []
      list.push(row)
      map.set(key, list)
    })
    return map
  }, [schedules])

  const calendarCells = useMemo(() => {
    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    const startDay = start.getDay()
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate()
    const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7
    const firstCell = new Date(start)
    firstCell.setDate(start.getDate() - startDay)
    const cells = []
    for (let i = 0; i < totalCells; i += 1) {
      const date = new Date(firstCell)
      date.setDate(firstCell.getDate() + i)
      cells.push(date)
    }
    return cells
  }, [currentMonth])

  const companyBarsByDate = useMemo(
    () => buildCompanyBarsByDate(currentMonth, companySchedules),
    [currentMonth, companySchedules]
  )
  const companyScheduleMap = useMemo(() => {
    const map = new Map()
    companySchedules.forEach((row) => map.set(Number(row.id), row))
    return map
  }, [companySchedules])

  const selectedReservations = selectedDate ? reservationsByDate.get(selectedDate) || [] : []

  const openCreateScheduleModal = () => {
    const firstTm = agents.find((agent) => !agent.isAdmin)
    setScheduleEditId(null)
    setScheduleForm({
      date: toDateInput(new Date()),
      tmId: firstTm ? String(firstTm.id) : '',
      type: '휴무',
      customType: '',
      memo: '',
    })
    setScheduleModalOpen(true)
  }

  const openEditScheduleModal = (item) => {
    setScheduleEditId(item.id)
    setScheduleForm({
      date: String(item.schedule_date || '').slice(0, 10),
      tmId: String(item.tm_id || ''),
      type: String(item.schedule_type || '휴무'),
      customType: String(item.custom_type || ''),
      memo: String(item.memo || ''),
    })
    setScheduleModalOpen(true)
  }

  useEffect(() => {
    if (!scheduleModalOpen) return
    if (!scheduleForm.tmId) {
      const firstTm = agents.find((agent) => !agent.isAdmin)
      if (firstTm) {
        setScheduleForm((prev) => ({ ...prev, tmId: String(firstTm.id) }))
      }
    }
  }, [scheduleModalOpen, scheduleForm.tmId, agents])

  const handleScheduleSave = async () => {
    if (!scheduleForm.date || !scheduleForm.tmId || !scheduleForm.type) return
    if (scheduleForm.type === '기타' && !scheduleForm.customType.trim()) return
    try {
      setScheduleSaving(true)
      const payload = {
        tmId: Number(scheduleForm.tmId),
        scheduleDate: scheduleForm.date,
        scheduleType: scheduleForm.type,
        customType: scheduleForm.type === '기타' ? scheduleForm.customType.trim() : '',
        memo: scheduleForm.memo.trim(),
      }
      if (scheduleEditId) {
        await api.patch(`/tm/schedules/${scheduleEditId}`, payload)
      } else {
        await api.post('/tm/schedules', payload)
      }
      const { from, to } = buildMonthRange(currentMonth)
      const res = await api.get('/tm/schedules', { params: { from, to } })
      setSchedules(Array.isArray(res.data) ? res.data : [])
      setScheduleModalOpen(false)
      setScheduleEditId(null)
      setScheduleForm((prev) => ({ ...prev, customType: '', memo: '' }))
    } catch {
      setError('일정 저장에 실패했습니다.')
    } finally {
      setScheduleSaving(false)
    }
  }

  const handleScheduleDelete = async () => {
    if (!scheduleEditId) return
    try {
      setScheduleSaving(true)
      await api.delete(`/tm/schedules/${scheduleEditId}`)
      const { from, to } = buildMonthRange(currentMonth)
      const res = await api.get('/tm/schedules', { params: { from, to } })
      setSchedules(Array.isArray(res.data) ? res.data : [])
      setScheduleModalOpen(false)
      setScheduleEditId(null)
    } catch {
      setError('일정 삭제에 실패했습니다.')
    } finally {
      setScheduleSaving(false)
    }
  }

  const openCompanyScheduleModal = () => {
    const today = toDateInput(new Date())
    setCompanyScheduleForm({
      startDate: today,
      endDate: today,
      content: '',
    })
    setCompanyScheduleEditId(null)
    setCompanyScheduleModalOpen(true)
  }

  const closeCompanyScheduleModal = () => {
    setCompanyScheduleModalOpen(false)
    setCompanyScheduleEditId(null)
  }

  const openEditCompanySchedule = (item) => {
    setCompanyScheduleEditId(item.id)
    setCompanyScheduleForm({
      startDate: String(item.start_date || '').slice(0, 10),
      endDate: String(item.end_date || '').slice(0, 10),
      content: String(item.content || ''),
    })
    setCompanyScheduleModalOpen(true)
  }

  const handleCompanyScheduleSave = async () => {
    if (!companyScheduleForm.startDate || !companyScheduleForm.endDate || !companyScheduleForm.content.trim()) return
    if (companyScheduleForm.endDate < companyScheduleForm.startDate) return
    try {
      setCompanyScheduleSaving(true)
      const payload = {
        startDate: companyScheduleForm.startDate,
        endDate: companyScheduleForm.endDate,
        content: companyScheduleForm.content.trim(),
      }
      if (companyScheduleEditId) {
        await api.patch(`/company/schedules/${companyScheduleEditId}`, payload)
      } else {
        await api.post('/company/schedules', payload)
      }
      const { from, to } = buildMonthRange(currentMonth)
      const res = await api.get('/company/schedules', { params: { from, to } })
      setCompanySchedules(Array.isArray(res.data) ? res.data : [])
      setCompanyScheduleModalOpen(false)
      setCompanyScheduleEditId(null)
    } finally {
      setCompanyScheduleSaving(false)
    }
  }

  const handleCompanyScheduleDelete = async () => {
    if (!companyScheduleEditId) return
    try {
      setCompanyScheduleSaving(true)
      await api.delete(`/company/schedules/${companyScheduleEditId}`)
      const { from, to } = buildMonthRange(currentMonth)
      const res = await api.get('/company/schedules', { params: { from, to } })
      setCompanySchedules(Array.isArray(res.data) ? res.data : [])
      setCompanyScheduleModalOpen(false)
      setCompanyScheduleEditId(null)
    } finally {
      setCompanyScheduleSaving(false)
    }
  }

  return (
    <div className="tm-calendar">
      <div className="tm-calendar-header">
        <div>
          <h1>캘린더</h1>
          <p>전체 예약 인원을 날짜별로 확인하세요.</p>
        </div>
        <div className="tm-assign-controls">
          <div className="tm-assign-filter">
            <select value={tmFilter} onChange={(e) => setTmFilter(e.target.value)}>
              <option value="all">전체 TM</option>
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
              placeholder="이름, 전화번호, 이벤트 검색"
            />
          </div>
          <button
            type="button"
            className="tm-add-button"
            onClick={openCreateScheduleModal}
          >
            TM일정기입
          </button>
          <button
            type="button"
            className="tm-add-button"
            onClick={openCompanyScheduleModal}
          >
            회사일정기입
          </button>
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
            const daySchedules = schedulesByDate.get(key) || []
            const isCurrentMonth = date.getMonth() === currentMonth.getMonth()
            const dayReservations = isCurrentMonth ? (reservationsByDate.get(key) || []) : []
            const dayCompanyBars = isCurrentMonth ? (companyBarsByDate.get(key) || []) : []
            const statusCounts = dayReservations.reduce((acc, row) => {
              const statusKey = getReservationStatus(row['상태'])
              if (statusKey) acc[statusKey] = (acc[statusKey] || 0) + 1
              return acc
            }, { 예약: 0, 예약부도: 0, 내원완료: 0 })
            const hasReservationStatus = statusCounts['예약'] > 0 || statusCounts['예약부도'] > 0 || statusCounts['내원완료'] > 0
            const isToday = key === formatDateKey(new Date())
            const isWeekend = date.getDay() === 0 || date.getDay() === 6
            return (
              <button
                type="button"
                key={key}
                className={`tm-calendar-cell${isCurrentMonth ? '' : ' is-blank'}${hasReservationStatus ? ' has-reservation' : ''}${isToday && isCurrentMonth ? ' is-today' : ''}${isWeekend && isCurrentMonth ? ' is-weekend' : ''}`}
                onClick={() => {
                  if (!dayReservations.length) return
                  setSelectedDate(key)
                }}
              >
                {isCurrentMonth ? (
                  <>
                    <div className="tm-calendar-date">{date.getDate()}</div>
                    {dayCompanyBars.length > 0 ? (
                      <div className="tm-calendar-company-bars">
                        {dayCompanyBars.map((bar) => (
                          <div
                            key={`company-${bar.id}-${key}`}
                            className={`tm-calendar-company-bar${bar.isStart ? ' is-start' : ''}${bar.isEnd ? ' is-end' : ''}`}
                            title={bar.content || '회사일정'}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              const target = companyScheduleMap.get(Number(bar.id))
                              if (target) openEditCompanySchedule(target)
                            }}
                          >
                            {bar.isStart ? (bar.content || '회사일정') : '\u00A0'}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {hasReservationStatus ? (
                      <div className="tm-calendar-status-row">
                        {statusCounts['예약'] > 0 ? <span className="tm-calendar-status-badge is-reserved">예약:{statusCounts['예약']}명</span> : null}
                        {statusCounts['예약부도'] > 0 ? <span className="tm-calendar-status-badge is-noshow">예약부도:{statusCounts['예약부도']}명</span> : null}
                        {statusCounts['내원완료'] > 0 ? <span className="tm-calendar-status-badge is-visited">내원완료:{statusCounts['내원완료']}명</span> : null}
                      </div>
                    ) : null}
                    {daySchedules.map((item) => (
                      <div
                        key={`sch-${item.id}`}
                        className={`tm-calendar-schedule-line is-editable ${getScheduleClassName(item)}`.trim()}
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditScheduleModal(item)
                        }}
                      >
                        {(item.tm_name || '-') + ' ' + getScheduleTypeLabel(item)}
                      </div>
                    ))}
                  </>
                ) : null}
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
                    <div className="tm-calendar-cell-info">
                      <div className="tm-calendar-label">상태</div>
                      <div className="tm-calendar-value">{item['상태'] || '-'}</div>
                    </div>
                    <div className="tm-calendar-cell-info tm-calendar-memo">
                      <div className="tm-calendar-label">메모</div>
                      <div className="tm-calendar-value" title={item['최근메모내용'] || ''}>
                        {item['최근메모내용'] || '-'}
                      </div>
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

      {scheduleModalOpen ? (
        <div className="tm-lead-modal">
          <div className="tm-lead-backdrop" onClick={() => setScheduleModalOpen(false)} />
          <div className="tm-lead-card">
            <div className="tm-lead-header">
              <h3>{scheduleEditId ? '일정 수정' : '일정 기입'}</h3>
              <button type="button" onClick={() => { setScheduleModalOpen(false); setScheduleEditId(null) }}>닫기</button>
            </div>
            <div className="tm-lead-form">
              <label>
                날짜
                <input
                  type="date"
                  value={scheduleForm.date}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, date: e.target.value }))}
                />
              </label>
              <label>
                TM
                <select
                  value={scheduleForm.tmId}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, tmId: e.target.value }))}
                >
                  <option value="">선택</option>
                  {agents.filter((agent) => !agent.isAdmin).map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
              </label>
              <label>
                유형
                <select
                  value={scheduleForm.type}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, type: e.target.value }))}
                >
                  <option value="휴무">휴무</option>
                  <option value="근무">근무</option>
                  <option value="반차">반차</option>
                  <option value="교육">교육</option>
                  <option value="기타">기타</option>
                </select>
              </label>
              {scheduleForm.type === '기타' ? (
                <label>
                  기타 입력
                  <input
                    type="text"
                    value={scheduleForm.customType}
                    onChange={(e) => setScheduleForm((prev) => ({ ...prev, customType: e.target.value }))}
                    placeholder="유형 입력"
                  />
                </label>
              ) : null}
              <label>
                메모
                <textarea
                  rows="3"
                  value={scheduleForm.memo}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, memo: e.target.value }))}
                  placeholder="특이사항 (선택)"
                />
              </label>
            </div>
            <div className="tm-lead-actions">
              {scheduleEditId ? (
                <button type="button" onClick={handleScheduleDelete} disabled={scheduleSaving}>
                  삭제
                </button>
              ) : null}
              <button type="button" onClick={() => { setScheduleModalOpen(false); setScheduleEditId(null) }}>취소</button>
              <button type="button" onClick={handleScheduleSave} disabled={scheduleSaving}>
                {scheduleSaving ? '저장 중..' : '저장'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {companyScheduleModalOpen ? (
        <div className="tm-lead-modal">
          <div className="tm-lead-backdrop" onClick={closeCompanyScheduleModal} />
          <div className="tm-lead-card">
            <div className="tm-lead-header">
              <h3>{companyScheduleEditId ? '회사 일정 수정' : '회사 일정 기입'}</h3>
              <button type="button" onClick={closeCompanyScheduleModal}>닫기</button>
            </div>
            <div className="tm-lead-form">
              <label>
                시작일
                <input
                  type="date"
                  value={companyScheduleForm.startDate}
                  onChange={(e) => setCompanyScheduleForm((prev) => ({ ...prev, startDate: e.target.value }))}
                />
              </label>
              <label>
                종료일
                <input
                  type="date"
                  value={companyScheduleForm.endDate}
                  onChange={(e) => setCompanyScheduleForm((prev) => ({ ...prev, endDate: e.target.value }))}
                />
              </label>
              <label>
                내용
                <textarea
                  rows="3"
                  value={companyScheduleForm.content}
                  onChange={(e) => setCompanyScheduleForm((prev) => ({ ...prev, content: e.target.value }))}
                  placeholder="회사 일정 내용을 입력하세요"
                />
              </label>
            </div>
            <div className="tm-lead-actions">
              {companyScheduleEditId ? (
                <button type="button" onClick={handleCompanyScheduleDelete} disabled={companyScheduleSaving}>삭제</button>
              ) : null}
              <button type="button" onClick={closeCompanyScheduleModal}>취소</button>
              <button type="button" onClick={handleCompanyScheduleSave} disabled={companyScheduleSaving}>
                {companyScheduleSaving ? '저장 중...' : '저장'}
              </button>
            </div>
            <div className="tm-lead-memos" style={{ marginTop: '10px' }}>
              <div className="tm-lead-memos-title">이번 달 회사 일정</div>
              {companySchedules.length === 0 ? (
                <div className="tm-lead-memos-empty">등록된 일정이 없습니다.</div>
              ) : (
                <div className="tm-lead-memos-list">
                  {companySchedules.map((row) => (
                    <div key={row.id} className="tm-lead-memo">
                      <div className="tm-lead-memo-time">
                        {String(row.start_date || '').slice(0, 10)} ~ {String(row.end_date || '').slice(0, 10)}
                      </div>
                      <div className="tm-lead-memo-content">{row.content}</div>
                      <button
                        type="button"
                        style={{ marginTop: '6px' }}
                        onClick={() => openEditCompanySchedule(row)}
                      >
                        수정
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
