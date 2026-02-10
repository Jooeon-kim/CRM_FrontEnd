import { useEffect, useMemo, useState } from 'react'
import api from '../apiClient'

const statusOptions = ['부재중', '리콜대기', '예약', '무효', '예약부도', '내원완료']

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

export default function TmCallStatus() {
  const [rows, setRows] = useState([])
  const [agents, setAgents] = useState([])
  const [activeTm, setActiveTm] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [assignedTodayOnly, setAssignedTodayOnly] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [activeLead, setActiveLead] = useState(null)
  const [memos, setMemos] = useState([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    status: '',
    region: '',
    memo: '',
    date: '',
    time: '',
    tmId: '',
  })

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const [dbRes, tmRes] = await Promise.all([
          api.get('/dbdata'),
          api.get('/tm/agents'),
        ])
        setRows(dbRes.data || [])
        setAgents(tmRes.data || [])
        setError('')
      } catch (err) {
        setError('TM 콜 현황을 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const formatDateTime = (value) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const hh = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`
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

  const visibleColumns = [
    '인입날짜',
    '이름',
    '연락처',
    '이벤트',
    'tm',
    '상태',
    '최근메모내용',
    '콜_날짜시간',
    '예약_내원일시',
    '거주지',
    '최근메모시간',
    '콜횟수',
  ]

  const formatCell = (key, value) => {
    if (key === '인입날짜' || key === '콜_날짜시간' || key === '예약_내원일시' || key === '최근메모시간') {
      return value ? formatDateTime(value) : '-'
    }
    if (key === '연락처') {
      const digits = String(value ?? '').replace(/\D/g, '')
      if (digits.length === 11) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
      }
      if (digits.length === 10) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
      }
      return value ?? '-'
    }
    if (key === 'tm') {
      if (value === null || value === undefined || value === '') return '-'
      const match = agents.find((agent) => String(agent.id) === String(value))
      return match?.name || value
    }
    return value ?? '-'
  }

  const isAssignedToday = (value) => {
    if (!value) return false
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return false
    const today = new Date()
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    )
  }

  const splitDateTime = (value) => {
    if (!value) return { date: '', time: '' }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return { date: '', time: '' }
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const hh = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` }
  }

  const openModal = async (lead) => {
    setActiveLead(lead)
    const { date, time } = splitDateTime(lead['예약_내원일시'])
    setForm({
      status: lead['상태'] || '',
      region: lead['거주지'] || '',
      memo: '',
      date,
      time,
      tmId: lead.tm ?? '',
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
    setForm((prev) => ({ ...prev, status: value }))
  }

  const handleSave = async () => {
    if (!activeLead) return
    if (form.status === '예약' && (!form.date || !form.time)) return
    const reservationAt =
      form.status === '예약' && form.date && form.time ? `${form.date} ${form.time}:00` : null
    try {
      setSaving(true)
      await api.post(`/admin/leads/${activeLead.id}/update`, {
        status: form.status,
        region: form.region,
        memo: form.memo,
        tmId: form.tmId || null,
        reservationAt,
        phone: activeLead['연락처'] || '',
      })
      setRows((prev) =>
        prev.map((row) =>
          row.id === activeLead.id
            ? {
                ...row,
                상태: form.status,
                거주지: form.region,
                예약_내원일시: reservationAt || row['예약_내원일시'],
                tm: form.tmId || row.tm,
                최근메모내용: form.memo || row['최근메모내용'],
                최근메모시간: form.memo ? new Date().toISOString() : row['최근메모시간'],
              }
            : row
        )
      )
      setModalOpen(false)
    } catch (err) {
      setError('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const filteredRows = useMemo(() => {
    const base = activeTm === 'all' ? rows : rows.filter((row) => String(row.tm) === String(activeTm))
    if (!assignedTodayOnly) return base
    return base.filter((row) => isAssignedToday(row['배정날짜']))
  }, [rows, activeTm, assignedTodayOnly])

  const statusBuckets = ['대기', '부재중', '리콜대기', '예약', '무효', '예약부도', '내원완료']
  const statusCounts = statusBuckets.reduce((acc, status) => {
    acc[status] = filteredRows.filter((row) => {
      const state = String(row['상태'] || '').trim()
      if (!state) return status === '대기'
      return state.includes(status)
    }).length
    return acc
  }, {})
  const totalCount = statusBuckets.reduce((sum, key) => sum + statusCounts[key], 0)
  const statusColors = {
    대기: '#60a5fa',
    부재중: '#fbbf24',
    리콜대기: '#a78bfa',
    예약: '#34d399',
    무효: '#f87171',
    예약부도: '#f97316',
    내원완료: '#22c55e',
  }

  const eventCounts = filteredRows.reduce((acc, row) => {
    const event = String(row['이벤트'] || '미지정').trim() || '미지정'
    acc[event] = (acc[event] || 0) + 1
    return acc
  }, {})
  const eventEntries = Object.entries(eventCounts).sort((a, b) => b[1] - a[1])
  const eventTotal = eventEntries.reduce((sum, [, count]) => sum + count, 0)
  const eventPalette = [
    '#38bdf8',
    '#fb7185',
    '#a3e635',
    '#f59e0b',
    '#818cf8',
    '#34d399',
    '#f97316',
    '#22c55e',
    '#e879f9',
  ]

  const buildDonut = (entries, total, colors) => {
    if (total === 0) return 'conic-gradient(#e2e8f0 0deg, #e2e8f0 360deg)'
    let current = 0
    const parts = entries.map(([, value], idx) => {
      const angle = (value / total) * 360
      const start = current
      const end = current + angle
      current = end
      return `${colors[idx % colors.length]} ${start}deg ${end}deg`
    })
    return `conic-gradient(${parts.join(', ')})`
  }

  const regionCounts = filteredRows.reduce((acc, row) => {
    const region = String(row['거주지'] || '미지정').trim() || '미지정'
    acc[region] = (acc[region] || 0) + 1
    return acc
  }, {})
  const regionEntries = Object.entries(regionCounts).sort((a, b) => b[1] - a[1])
  const regionTotal = regionEntries.reduce((sum, [, count]) => sum + count, 0)

  const chartStops = () => {
    if (totalCount === 0) return 'conic-gradient(#e2e8f0 0deg, #e2e8f0 360deg)'
    let current = 0
    const parts = statusBuckets.map((status) => {
      const value = statusCounts[status] || 0
      const angle = (value / totalCount) * 360
      const start = current
      const end = current + angle
      current = end
      return `${statusColors[status]} ${start}deg ${end}deg`
    })
    return `conic-gradient(${parts.join(', ')})`
  }

  if (loading) return <div className="db-list">불러오는 중...</div>

  return (
    <div className="tm-call">
      <div className="tm-call-header">
        <h1>TM 콜 현황</h1>
        <div className="db-list-actions">
          <label>
            오늘 배정만
            <input
              type="checkbox"
              checked={assignedTodayOnly}
              onChange={(e) => setAssignedTodayOnly(e.target.checked)}
            />
          </label>
          <span className="db-list-count">{filteredRows.length}건</span>
        </div>
      </div>

      <div className="tm-call-charts">
        <div className="tm-call-box">
          <div className="tm-call-box-title">상태 비율</div>
          <div className="tm-call-box-body">
            <div className="tm-call-donut" style={{ background: chartStops() }}>
              <div className="tm-call-donut-center">
                <div className="tm-call-total">{totalCount}</div>
                <div className="tm-call-label">총 건수</div>
              </div>
            </div>
            <div className="tm-call-legend">
              {statusBuckets.map((status) => (
                <div className="tm-call-legend-row" key={status}>
                  <span
                    className="tm-call-legend-dot"
                    style={{ background: statusColors[status] }}
                  />
                  <span className="tm-call-legend-name">{status}</span>
                  <span className="tm-call-legend-count">{statusCounts[status] || 0}건</span>
                  <span className="tm-call-legend-percent">
                    {totalCount ? Math.round((statusCounts[status] / totalCount) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="tm-call-box">
          <div className="tm-call-box-title">이벤트 비율</div>
          <div className="tm-call-box-body">
            <div
              className="tm-call-donut"
              style={{ background: buildDonut(eventEntries, eventTotal, eventPalette) }}
            >
              <div className="tm-call-donut-center">
                <div className="tm-call-total">{eventTotal}</div>
                <div className="tm-call-label">이벤트</div>
              </div>
            </div>
            <div className="tm-call-legend">
              {eventEntries.map(([event, count], idx) => (
                <div className="tm-call-legend-row" key={event}>
                  <span
                    className="tm-call-legend-dot"
                    style={{ background: eventPalette[idx % eventPalette.length] }}
                  />
                  <span className="tm-call-legend-name">{event}</span>
                  <span className="tm-call-legend-count">{count}건</span>
                  <span className="tm-call-legend-percent">
                    {eventTotal ? Math.round((count / eventTotal) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="tm-call-box">
          <div className="tm-call-box-title">거주지 비율</div>
          <div className="tm-call-box-body">
            <div
              className="tm-call-donut"
              style={{ background: buildDonut(regionEntries, regionTotal, eventPalette) }}
            >
              <div className="tm-call-donut-center">
                <div className="tm-call-total">{regionTotal}</div>
                <div className="tm-call-label">거주지</div>
              </div>
            </div>
            <div className="tm-call-legend">
              {regionEntries.map(([region, count], idx) => (
                <div className="tm-call-legend-row" key={region}>
                  <span
                    className="tm-call-legend-dot"
                    style={{ background: eventPalette[idx % eventPalette.length] }}
                  />
                  <span className="tm-call-legend-name">{region}</span>
                  <span className="tm-call-legend-count">{count}건</span>
                  <span className="tm-call-legend-percent">
                    {regionTotal ? Math.round((count / regionTotal) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="tm-call-tabs">
        <button
          className={`tm-call-tab${activeTm === 'all' ? ' active' : ''}`}
          type="button"
          onClick={() => setActiveTm('all')}
        >
          전체
        </button>
        {agents.map((agent) => (
          <button
            key={agent.id}
            className={`tm-call-tab${String(activeTm) === String(agent.id) ? ' active' : ''}`}
            type="button"
            onClick={() => setActiveTm(agent.id)}
          >
            {agent.name}
          </button>
        ))}
      </div>

      {error ? <div className="db-list-error">{error}</div> : null}

      {filteredRows.length === 0 ? (
        <div className="db-list-empty">표시할 데이터가 없습니다.</div>
      ) : (
        <div className="db-list-table">
          <div className="db-list-row db-list-head">
            {visibleColumns.map((key) => (
              <div key={key}>{key}</div>
            ))}
          </div>
          {filteredRows.map((row, index) => (
            <div
              className="db-list-row db-list-click"
              key={index}
              onClick={() => openModal(row)}
            >
              {visibleColumns.map((key) => (
                <div key={key}>{formatCell(key, row[key])}</div>
              ))}
            </div>
          ))}
        </div>
      )}

      {modalOpen && activeLead ? (
        <div className="tm-lead-modal">
          <div className="tm-lead-backdrop" onClick={() => setModalOpen(false)} />
          <div className="tm-lead-card">
            <div className="tm-lead-header">
              <h3>DB 수정</h3>
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
                    담당 TM
                    <select
                      value={form.tmId}
                      onChange={(e) => setForm({ ...form, tmId: e.target.value })}
                    >
                      <option value="">미지정</option>
                      {agents
                        .filter((agent) => !agent.isAdmin)
                        .map((agent) => (
                          <option key={agent.id} value={agent.id}>{agent.name}</option>
                        ))}
                    </select>
                  </label>

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
              <button type="button" onClick={() => setModalOpen(false)}>취소</button>
              <button type="button" onClick={handleSave} disabled={saving}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
