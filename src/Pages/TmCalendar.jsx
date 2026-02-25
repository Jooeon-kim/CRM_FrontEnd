import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import api from '../apiClient'
import { setTmCalendarBase, setTmCalendarMonth } from '../store/mainSlice'

const weekLabels = ['일', '월', '화', '수', '목', '금', '토']
const statusOptions = ['부재중', '리콜대기', '예약', '무효', '예약부도', '내원완료']
const isCalendarStatus = (value) => {
  const status = String(value || '').replace(/\s+/g, '').trim()
  if (!status) return false
  if (status.includes('예약부도')) return true
  if (status.includes('내원완료')) return true
  return status === '예약'
}

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
    const local = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6] || '0')
    )
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

const formatDateTime = (value) => {
  if (!value) return '-'
  const date = parseDateTime(value)
  if (!date) return String(value)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

const parseMemoStatusMeta = (memo) => {
  const text = String((typeof memo === 'object' && memo !== null ? memo.memo_content : memo) || '').trim()
  const columnTag = String(memo?.status_tag || '').trim()
  const columnReservationText = memo?.status_reservation_at ? formatDateTime(memo.status_reservation_at) : ''
  if (columnTag) {
    return {
      badge: columnTag,
      reservationText: columnReservationText,
      body: text,
    }
  }
  const re = /(리콜대기|예약부도|내원완료|예약)(?:\s+(?:예약일시|리콜일시):([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2}))?/u
  const m = text.match(re)
  if (!m) return { badge: '', reservationText: '', body: text }
  const fullMatch = String(m[0] || '').trim()
  const body = text
    .replace(fullMatch, '')
    .replace(/^\s*\/\s*/, '')
    .trim()
  return {
    badge: m[1] || '',
    reservationText: m[2] || '',
    body,
  }
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

const getMonthKey = (monthDate) => {
  const yyyy = monthDate.getFullYear()
  const mm = String(monthDate.getMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}`
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

    const dayCount = Math.floor((visibleEnd.getTime() - visibleStart.getTime()) / (24 * 60 * 60 * 1000)) + 1
    const labelIndex = Math.floor(dayCount / 2)
    let dayIndex = 0
    for (const d = new Date(visibleStart); d <= visibleEnd; d.setDate(d.getDate() + 1)) {
      const key = formatDateKey(d)
      const list = map.get(key) || []
      list.push({
        id: row.id,
        content: String(row.content || '').trim(),
        isStart: isSameDate(d, visibleStart),
        isEnd: isSameDate(d, visibleEnd),
        showLabel: dayIndex === labelIndex,
      })
      map.set(key, list)
      dayIndex += 1
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

export default function TmCalendar() {
  const dispatch = useDispatch()
  const { user } = useSelector((state) => state.auth)
  const calendarCache = useSelector((state) => state.main?.calendarCache || {})
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
  const [schedules, setSchedules] = useState([])
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleEditId, setScheduleEditId] = useState(null)
  const [scheduleForm, setScheduleForm] = useState({
    date: toDateInput(new Date()),
    type: '휴무',
    customType: '',
    memo: '',
  })
  const [companySchedules, setCompanySchedules] = useState([])
  const tmCalendarBaseCache = calendarCache?.tmBase?.[String(user?.id || '')]
  const currentMonthKey = useMemo(() => getMonthKey(currentMonth), [currentMonth])
  const currentMonthCacheKey = `${String(user?.id || '')}:${currentMonthKey}`
  const tmCalendarMonthCache = calendarCache?.tmMonth?.[currentMonthCacheKey]

  const loadReservations = async (withLoading = false, forceRefresh = false) => {
    if (!user?.id) return
    try {
      const cacheFresh =
        tmCalendarBaseCache &&
        Array.isArray(tmCalendarBaseCache.rows) &&
        Date.now() - Number(tmCalendarBaseCache.fetchedAt || 0) < 5 * 60 * 1000
      if (cacheFresh && !forceRefresh) {
        setReservations(
          (tmCalendarBaseCache.rows || []).filter((row) => {
            const status = String(row['상태'] || '').trim()
            return isCalendarStatus(status) && Boolean(row['예약_내원일시'])
          })
        )
        setError('')
        if (withLoading) setLoading(false)
        return
      }
      if (withLoading) setLoading(true)
      const res = await api.get('/dbdata', {
        params: { tm: user.id },
      })
      const nextRows = res.data || []
      dispatch(
        setTmCalendarBase({
          tmId: user.id,
          rows: nextRows,
          fetchedAt: Date.now(),
        })
      )
      setReservations(
        nextRows.filter((row) => {
          const status = String(row['상태'] || '').trim()
          return isCalendarStatus(status) && Boolean(row['예약_내원일시'])
        })
      )
      setError('')
    } catch (err) {
      setError('예약 데이터를 불러오지 못했습니다.')
    } finally {
      if (withLoading) setLoading(false)
    }
  }

  useEffect(() => {
    loadReservations(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, tmCalendarBaseCache])

  useEffect(() => {
    const loadSchedules = async () => {
      if (!user?.id) return
      try {
        const monthCacheFresh =
          tmCalendarMonthCache &&
          Date.now() - Number(tmCalendarMonthCache.fetchedAt || 0) < 10 * 60 * 1000
        if (monthCacheFresh) {
          setSchedules(Array.isArray(tmCalendarMonthCache.schedules) ? tmCalendarMonthCache.schedules : [])
          setCompanySchedules(Array.isArray(tmCalendarMonthCache.companySchedules) ? tmCalendarMonthCache.companySchedules : [])
          return
        }
        const { from, to } = buildMonthRange(currentMonth)
        const [tmRes, companyRes] = await Promise.all([
          api.get('/tm/schedules', { params: { from, to } }),
          api.get('/company/schedules', { params: { from, to } }),
        ])
        const nextSchedules = Array.isArray(tmRes.data) ? tmRes.data : []
        const nextCompanySchedules = Array.isArray(companyRes.data) ? companyRes.data : []
        setSchedules(nextSchedules)
        setCompanySchedules(nextCompanySchedules)
        dispatch(
          setTmCalendarMonth({
            tmId: user.id,
            monthKey: currentMonthKey,
            schedules: nextSchedules,
            companySchedules: nextCompanySchedules,
            fetchedAt: Date.now(),
          })
        )
      } catch {
        setSchedules([])
        setCompanySchedules([])
      }
    }
    loadSchedules()
  }, [currentMonth, user?.id, currentMonthKey, tmCalendarMonthCache, dispatch])

  useEffect(() => {
    if (!user?.id) return
    const prefetchMonth = async (offset) => {
      const target = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1)
      const targetKey = getMonthKey(target)
      const cacheKey = `${String(user.id)}:${targetKey}`
      const cached = calendarCache?.tmMonth?.[cacheKey]
      if (cached && Date.now() - Number(cached.fetchedAt || 0) < 10 * 60 * 1000) return
      try {
        const { from, to } = buildMonthRange(target)
        const [tmRes, companyRes] = await Promise.all([
          api.get('/tm/schedules', { params: { from, to } }),
          api.get('/company/schedules', { params: { from, to } }),
        ])
        dispatch(
          setTmCalendarMonth({
            tmId: user.id,
            monthKey: targetKey,
            schedules: Array.isArray(tmRes.data) ? tmRes.data : [],
            companySchedules: Array.isArray(companyRes.data) ? companyRes.data : [],
            fetchedAt: Date.now(),
          })
        )
      } catch {
        // prefetch failure is non-blocking
      }
    }
    prefetchMonth(-1)
    prefetchMonth(1)
  }, [currentMonth, user?.id, calendarCache?.tmMonth, dispatch])

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

  const reservationsByDate = useMemo(() => {
    const map = new Map()
    monthReservations.forEach((item) => {
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
  }, [monthReservations])

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

  const selectedReservations = selectedDate ? reservationsByDate.get(selectedDate) || [] : []

  const openCreateScheduleModal = () => {
    setScheduleEditId(null)
    setScheduleForm({
      date: toDateInput(new Date()),
      type: '휴무',
      customType: '',
      memo: '',
    })
    setScheduleModalOpen(true)
  }

  const openEditScheduleModal = (item) => {
    if (String(item.tm_id || '') !== String(user?.id || '')) return
    setScheduleEditId(item.id)
    setScheduleForm({
      date: String(item.schedule_date || '').slice(0, 10),
      type: String(item.schedule_type || '휴무'),
      customType: String(item.custom_type || ''),
      memo: String(item.memo || ''),
    })
    setScheduleModalOpen(true)
  }

  const handleScheduleSave = async () => {
    if (!user?.id || !scheduleForm.date || !scheduleForm.type) return
    if (scheduleForm.type === '기타' && !scheduleForm.customType.trim()) return
    try {
      setScheduleSaving(true)
      const payload = {
        tmId: Number(user.id),
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
      await api.delete(`/tm/schedules/${scheduleEditId}`, {
        params: { tmId: user?.id },
      })
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

  const openModal = async (lead) => {
    setSelectedDate('')
    setActiveLead(lead)
    setForm({
      status: lead['상태'] || '',
      region: lead['거주지'] || '',
      memo: '',
      date: '',
      time: '',
    })
    setMemos([])
    setModalOpen(true)
    try {
      const res = await api.get('/tm/memos', { params: { phone: lead['연락처'] } })
      setMemos(res.data || [])
    } catch {
      setMemos([])
    }
  }

  const handleStatusChange = (value) => {
    if (!activeLead) return
    if (value === '부재중') {
      const missCount = Number(activeLead['부재중_횟수'] || 0) + 1
      setForm((prev) => ({ ...prev, status: value, memo: `${missCount}차부재` }))
      return
    }
    if (value === '예약부도') {
      const reservationText = activeLead['예약_내원일시']
        ? formatDateTime(activeLead['예약_내원일시'])
        : ''
      const memo = reservationText ? `예약부도 ${reservationText}` : '예약부도'
      setForm((prev) => ({ ...prev, status: value, memo }))
      return
    }
    setForm((prev) => ({ ...prev, status: value }))
  }

  const handleSave = async () => {
    if (!activeLead || !user?.id) return
    if (!form.status) return
    if (form.status === '예약' && (!form.date || !form.time)) return

    const reservationAt =
      form.status === '예약' ? `${form.date} ${form.time}:00` : null

    try {
      setSaving(true)
      await api.post(`/tm/leads/${activeLead.id}/update`, {
        status: form.status,
        region: form.region,
        memo: form.memo,
        tmId: user.id,
        reservationAt,
        phone: activeLead['연락처'] || '',
      })
      await loadReservations(false, true)
      setModalOpen(false)
      setActiveLead(null)
    } catch (err) {
      setError('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (!user?.id) {
    return <div className="db-list">TM 정보가 없습니다.</div>
  }

  return (
    <div className="tm-calendar">
      <div className="tm-calendar-header">
        <div>
          <h1>캘린더</h1>
          <p>예약 인원을 날짜별로 확인하세요.</p>
        </div>
        <button
          type="button"
          className="tm-add-button"
          onClick={openCreateScheduleModal}
        >
          TM일정기입
        </button>
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
                          >
                            {bar.showLabel ? (bar.content || '회사일정') : '\u00A0'}
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
                        className={`tm-calendar-schedule-line ${getScheduleClassName(item)}${String(item.tm_id || '') === String(user?.id || '') ? ' is-editable' : ''}`.trim()}
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
                  <div
                    key={item.id}
                    className="tm-calendar-row db-list-click"
                    onClick={() => openModal(item)}
                  >
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
              <h3>고객 상담 기록</h3>
              <button type="button" onClick={() => setModalOpen(false)}>닫기</button>
            </div>

            <div className="tm-lead-top">
              <div className="tm-lead-summary-card">
                <div className="tm-lead-summary-label">인입날짜</div>
                <div className="tm-lead-summary-value">{formatDateTime(activeLead['인입날짜'])}</div>
              </div>
              <div className="tm-lead-summary-card">
                <div className="tm-lead-summary-label">상담가능시간</div>
                <div className="tm-lead-summary-value">{activeLead['상담가능시간'] || '-'}</div>
              </div>
              <div className="tm-lead-summary-card">
                <div className="tm-lead-summary-label">이벤트</div>
                <div className="tm-lead-summary-value">{activeLead['이벤트'] || '-'}</div>
              </div>
              <div className="tm-lead-summary-card">
                <div className="tm-lead-summary-label">거주지</div>
                <div className="tm-lead-summary-value">{activeLead['거주지'] || '-'}</div>
              </div>
            </div>

            <div className="tm-lead-body">
              <div className="tm-lead-left">
                <div className="tm-lead-memos">
                  <div className="tm-lead-memos-title">최근 메모</div>
                  {memos.length === 0 ? (
                    <div className="tm-lead-memos-empty">메모가 없습니다.</div>
                  ) : (
                    <div className="tm-lead-memos-list">
                      {memos.map((memo, idx) => (
                        <div key={idx} className="tm-lead-memo">
                          <div className="tm-lead-memo-time">{formatDateTime(memo.memo_time)}</div>
                          {(() => {
                            const parsed = parseMemoStatusMeta(memo)
                            const statusTimeText = String(
                              parsed.badge === '리콜대기'
                                ? (parsed.reservationText || (activeLead?.['리콜_예정일시'] ? formatDateTime(activeLead['리콜_예정일시']) : ''))
                                : (parsed.reservationText || (activeLead?.['예약_내원일시'] ? formatDateTime(activeLead['예약_내원일시']) : ''))
                            ).trim()
                            const statusTimeLabel = parsed.badge === '리콜대기' ? '리콜일시' : '예약일시'
                            const badgeClassMap = {
                              예약: 'tm-lead-memo-badge is-reserved',
                              예약부도: 'tm-lead-memo-badge is-noshow',
                              내원완료: 'tm-lead-memo-badge is-visited',
                              부재중: 'tm-lead-memo-badge is-missed',
                              리콜대기: 'tm-lead-memo-badge is-recall',
                              무효: 'tm-lead-memo-badge is-invalid',
                              실패: 'tm-lead-memo-badge is-failed',
                            }
                            const badgeClass = badgeClassMap[parsed.badge] || 'tm-lead-memo-badge'
                            return parsed.badge ? (
                              <div className="tm-lead-memo-status">
                                <span className={badgeClass}>{parsed.badge}</span>
                                {statusTimeText ? (
                                  <span className="tm-lead-memo-status-time">{statusTimeLabel}: {statusTimeText}</span>
                                ) : null}
                              </div>
                            ) : null
                          })()}
                          <div className="tm-lead-memo-content">{parseMemoStatusMeta(memo).body || memo.memo_content}</div>
                          {memo.tm_id ? (
                            <div className="tm-lead-memo-time">
                              작성 TM: {memo.tm_name || memo.tm_id}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="tm-lead-right">
                <div className="tm-lead-summary">
                  <div className="tm-lead-identity">
                    <div className="tm-lead-identity-label">고객 정보</div>
                    <div className="tm-lead-identity-name">{activeLead['이름'] || '-'}</div>
                    <div className="tm-lead-identity-phone">{formatPhone(activeLead['연락처'])}</div>
                  </div>
                </div>

                <div className="tm-lead-form">
                  <label>
                    상태
                    <select value={form.status} onChange={(e) => handleStatusChange(e.target.value)}>
                      <option value="">선택</option>
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </label>

                  {form.status === '예약' ? (
                    <div className="tm-lead-reservation">
                      <label>
                        예약 날짜
                        <input
                          type="date"
                          value={form.date}
                          onChange={(e) => setForm({ ...form, date: e.target.value })}
                        />
                      </label>
                      <label>
                        예약 시간
                        <select
                          value={form.time}
                          onChange={(e) => setForm({ ...form, time: e.target.value })}
                        >
                          <option value="">시간 선택</option>
                          {timeOptions.map((time) => (
                            <option key={time} value={time}>{time}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}

                  <label>
                    거주지
                    <input
                      type="text"
                      value={form.region}
                      onChange={(e) => setForm({ ...form, region: e.target.value })}
                    />
                  </label>

                  <label>
                    상담 메모
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
                현재시간기입
              </button>
              <button
                type="button"
                onClick={() => setForm((prev) => ({
                  ...prev,
                  memo: prev.memo ? `${prev.memo}/문자보냄` : '/문자보냄',
                }))}
              >
                문자보냄
              </button>
              <button type="button" onClick={() => setModalOpen(false)}>취소</button>
              <button type="button" onClick={handleSave} disabled={saving}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
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
    </div>
  )
}
