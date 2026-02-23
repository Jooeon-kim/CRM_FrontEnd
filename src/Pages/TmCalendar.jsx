import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import api from '../apiClient'

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

const getScheduleTypeLabel = (item) => {
  const type = String(item?.schedule_type || '').trim()
  if (type === '기타') {
    const custom = String(item?.custom_type || '').trim()
    return custom || '기타'
  }
  return type || '-'
}

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
  const [schedules, setSchedules] = useState([])
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({
    date: toDateInput(new Date()),
    type: '휴무',
    customType: '',
    memo: '',
  })

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return
      try {
        setLoading(true)
        const res = await api.get('/dbdata', {
          params: { tm: user.id },
        })
        setReservations(
          (res.data || []).filter((row) => {
            const status = String(row['상태'] || '').trim()
            return isCalendarStatus(status) && Boolean(row['예약_내원일시'])
          })
        )
        setError('')
      } catch (err) {
        setError('예약 데이터를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user?.id])

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

  const handleScheduleSave = async () => {
    if (!user?.id || !scheduleForm.date || !scheduleForm.type) return
    if (scheduleForm.type === '기타' && !scheduleForm.customType.trim()) return
    try {
      setScheduleSaving(true)
      await api.post('/tm/schedules', {
        tmId: Number(user.id),
        scheduleDate: scheduleForm.date,
        scheduleType: scheduleForm.type,
        customType: scheduleForm.type === '기타' ? scheduleForm.customType.trim() : '',
        memo: scheduleForm.memo.trim(),
      })
      const { from, to } = buildMonthRange(currentMonth)
      const res = await api.get('/tm/schedules', { params: { from, to } })
      setSchedules(Array.isArray(res.data) ? res.data : [])
      setScheduleModalOpen(false)
      setScheduleForm((prev) => ({ ...prev, customType: '', memo: '' }))
    } catch {
      setError('일정 저장에 실패했습니다.')
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
      setReservations((prev) => {
        const updated = prev.map((row) =>
          row.id === activeLead.id
            ? {
                ...row,
                상태: form.status,
                거주지: form.region,
                예약_내원일시: reservationAt || row['예약_내원일시'],
                콜횟수: (Number(row['콜횟수'] || 0) + (['부재중', '리콜대기', '예약'].includes(form.status) ? 1 : 0)),
                부재중_횟수: form.status === '부재중' ? Number(row['부재중_횟수'] || 0) + 1 : row['부재중_횟수'],
                예약부도_횟수: form.status === '예약부도' ? Number(row['예약부도_횟수'] || 0) + 1 : row['예약부도_횟수'],
                최근메모내용: form.memo || row['최근메모내용'],
                최근메모시간: form.memo ? new Date().toISOString() : row['최근메모시간'],
              }
            : row
        )
        if (form.status !== '예약') {
          return updated.filter((row) => row.id !== activeLead.id)
        }
        return updated
      })
      setModalOpen(false)
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
          onClick={() => setScheduleModalOpen(true)}
        >
          일정 기입
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
            const count = (reservationsByDate.get(key) || []).length
            const daySchedules = schedulesByDate.get(key) || []
            const isCurrentMonth = date.getMonth() === currentMonth.getMonth()
            const isToday = key === formatDateKey(new Date())
            return (
              <button
                type="button"
                key={key}
                className={`tm-calendar-cell${isCurrentMonth ? '' : ' is-outside'}${count ? ' has-reservation' : ''}${isToday ? ' is-today' : ''}`}
                onClick={() => {
                  if (!count) return
                  setSelectedDate(key)
                }}
              >
                <div className="tm-calendar-date">{date.getDate()}</div>
                {count ? <div className="tm-calendar-count">{count}명</div> : null}
                {daySchedules.map((item) => (
                  <div key={`sch-${item.id}`} className="tm-calendar-schedule-line">
                    {(item.tm_name || '-') + ' ' + getScheduleTypeLabel(item)}
                  </div>
                ))}
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
              <h3>일정 기입</h3>
              <button type="button" onClick={() => setScheduleModalOpen(false)}>닫기</button>
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
              <button type="button" onClick={() => setScheduleModalOpen(false)}>취소</button>
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
