import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import api from '../apiClient'
import { patchAdminDbLead, setAdminDataset } from '../store/mainSlice'

const statusOptions = ['부재중', '리콜대기', '예약', '실패', '무효', '예약부도', '내원완료']

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
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

const parseDateTimeLocal = (value) => {
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
  const plain = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (plain) {
    const local = new Date(
      Number(plain[1]),
      Number(plain[2]) - 1,
      Number(plain[3]),
      Number(plain[4]),
      Number(plain[5]),
      Number(plain[6] || '0')
    )
    return Number.isNaN(local.getTime()) ? null : local
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const parseUtcDateTime = (value) => {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const raw = String(value).trim()
  const plain = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (plain) {
    const utc = new Date(Date.UTC(
      Number(plain[1]),
      Number(plain[2]) - 1,
      Number(plain[3]),
      Number(plain[4]),
      Number(plain[5]),
      Number(plain[6] || '0')
    ))
    return Number.isNaN(utc.getTime()) ? null : utc
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const toKstDateTimeFromUtc = (value) => {
  const utc = parseUtcDateTime(value)
  if (!utc) return null
  return new Date(utc.getTime() + KST_OFFSET_MS)
}

const toKstDateKeyFromUtc = (value) => {
  const kst = toKstDateTimeFromUtc(value)
  if (!kst) return ''
  const yyyy = kst.getUTCFullYear()
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(kst.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const normalizeRegionForChart = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return '미지정'
  const compact = raw.replace(/\s+/g, '').toLowerCase()

  const isSeoul = [
    '서울',
    '강남',
    '서초',
    '방배',
    '송파',
    '잠실',
    '강동',
    '강서',
    '마포',
    '용산',
    '성동',
    '광진',
    '동작',
    '관악',
    '은평',
    '노원',
    '도봉',
    '강북',
    '중랑',
    '종로',
    '중구',
    '동대문',
    '성북',
    '서대문',
    '양천',
    '영등포',
    '금천',
    '구로',
  ].some((keyword) => compact.includes(keyword))
  if (isSeoul) return '서울'

  const isSuwon = ['수원', '영통', '권선', '팔달', '장안', '광교'].some((keyword) =>
    compact.includes(keyword)
  )
  if (isSuwon) return '수원'

  const isYongin = ['용인', '수지', '기흥', '처인', '죽전', '동백'].some((keyword) =>
    compact.includes(keyword)
  )
  if (isYongin) return '용인'

  return raw
}

export default function TmCallStatus() {
  const dispatch = useDispatch()
  const dbCache = useSelector((state) => state.main.adminDatasets?.dbRows)
  const agentsCache = useSelector((state) => state.main.adminDatasets?.agents)
  const todayKstKey = toKstDateKeyFromUtc(new Date().toISOString())
  const [rows, setRows] = useState([])
  const [agents, setAgents] = useState([])
  const [activeTm, setActiveTm] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [assignedTodayOnly, setAssignedTodayOnly] = useState(false)
  const [assignedDateFrom, setAssignedDateFrom] = useState(todayKstKey)
  const [assignedDateTo, setAssignedDateTo] = useState(todayKstKey)
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
    const CACHE_TTL_MS = 2 * 60 * 1000
    const load = async ({ force = false } = {}) => {
      const now = Date.now()
      const cachedRows = Array.isArray(dbCache?.rows) ? dbCache.rows : []
      const cachedAgents = Array.isArray(agentsCache?.rows) ? agentsCache.rows : []
      const dbFresh = now - Number(dbCache?.fetchedAt || 0) < CACHE_TTL_MS
      const agentsFresh = now - Number(agentsCache?.fetchedAt || 0) < CACHE_TTL_MS
      const hasCache = cachedRows.length > 0 && cachedAgents.length > 0

      if (!force && hasCache) {
        setRows(cachedRows)
        setAgents(cachedAgents)
        setLoading(false)
        if (dbFresh && agentsFresh) return
      }

      try {
        if (!hasCache || force) setLoading(true)
        const [dbRes, tmRes] = await Promise.all([
          api.get('/dbdata'),
          api.get('/tm/agents'),
        ])
        setRows(dbRes.data || [])
        setAgents(tmRes.data || [])
        dispatch(setAdminDataset({ key: 'dbRows', rows: dbRes.data || [], fetchedAt: Date.now() }))
        dispatch(setAdminDataset({ key: 'agents', rows: tmRes.data || [], fetchedAt: Date.now() }))
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
    const date = parseDateTimeLocal(value)
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
    const re = /(예약부도|내원완료|예약)(?:\s+예약일시:([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2}))?/u
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

  const formatUtcAsKstDateTime = (value) => {
    if (!value) return ''
    const kst = toKstDateTimeFromUtc(value)
    if (!kst) return String(value)
    const yyyy = kst.getUTCFullYear()
    const mm = String(kst.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(kst.getUTCDate()).padStart(2, '0')
    const hh = String(kst.getUTCHours()).padStart(2, '0')
    const min = String(kst.getUTCMinutes()).padStart(2, '0')
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
    if (key === '콜_날짜시간' || key === '최근메모시간') {
      return value ? formatUtcAsKstDateTime(value) : '-'
    }
    if (key === '인입날짜' || key === '예약_내원일시') {
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
    const todayKst = toKstDateKeyFromUtc(new Date().toISOString())
    return toKstDateKeyFromUtc(value) === todayKst
  }

  const toAssignedDateKey = (value) => {
    if (!value) return ''
    return toKstDateKeyFromUtc(value)
  }

  const getAssignedDateValue = (row) =>
    row?.['배정날짜'] || row?.assigned_at || row?.assigned_date || row?.tm_assigned_at || ''

  const applyQuickRange = (mode) => {
    const today = new Date()
    const todayKey = toKstDateKeyFromUtc(today.toISOString())
    if (mode === 'today') {
      setAssignedDateFrom(todayKey)
      setAssignedDateTo(todayKey)
      return
    }
    if (mode === 'yesterday') {
      const d = new Date(today)
      d.setDate(d.getDate() - 1)
      const key = toKstDateKeyFromUtc(d.toISOString())
      setAssignedDateFrom(key)
      setAssignedDateTo(key)
      return
    }
    if (mode === 'last7') {
      const start = new Date(today)
      start.setDate(start.getDate() - 6)
      setAssignedDateFrom(toKstDateKeyFromUtc(start.toISOString()))
      setAssignedDateTo(todayKey)
      return
    }
    setAssignedDateFrom('')
    setAssignedDateTo('')
  }

  const splitDateTime = (value) => {
    if (!value) return { date: '', time: '' }
    const date = parseDateTimeLocal(value)
    if (!date) return { date: '', time: '' }
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const hh = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` }
  }

  const nonAdminAgents = useMemo(
    () => agents.filter((agent) => !agent.isAdmin),
    [agents]
  )

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
      dispatch(
        patchAdminDbLead({
          leadId: activeLead.id,
          patch: {
            상태: form.status,
            거주지: form.region,
            예약_내원일시: reservationAt || activeLead['예약_내원일시'],
            tm: form.tmId || activeLead.tm,
            최근메모내용: form.memo || activeLead['최근메모내용'],
            최근메모시간: form.memo ? new Date().toISOString() : activeLead['최근메모시간'],
          },
        })
      )
      setModalOpen(false)
    } catch (err) {
      setError('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const dateFilteredRows = useMemo(() => {
    let base = rows
    if (assignedTodayOnly) {
      base = base.filter((row) => isAssignedToday(getAssignedDateValue(row)))
    }
    if (assignedDateFrom || assignedDateTo) {
      base = base.filter((row) => {
        const key = toAssignedDateKey(getAssignedDateValue(row))

        if (!key) return false
        if (assignedDateFrom && key < assignedDateFrom) return false
        if (assignedDateTo && key > assignedDateTo) return false
        return true
      })
    }
    return base
  }, [rows, assignedTodayOnly, assignedDateFrom, assignedDateTo])

  const filteredRows = useMemo(() => {
    const base = activeTm === 'all'
      ? [...dateFilteredRows]
      : dateFilteredRows.filter((row) => String(row.tm) === String(activeTm))

    const statusPriority = {
      예약: 1,
      내원완료: 2,
      리콜대기: 3,
      부재중: 4,
      실패: 5,
      무효: 6,
      대기: 7,
    }

    const normalizeStatus = (value) => {
      const raw = String(value || '').trim()
      return raw || '대기'
    }

    base.sort((a, b) => {
      const aStatus = normalizeStatus(a['상태'])
      const bStatus = normalizeStatus(b['상태'])
      const aPriority = statusPriority[aStatus] || 99
      const bPriority = statusPriority[bStatus] || 99
      if (aPriority !== bPriority) return aPriority - bPriority

      const aTime = parseDateTimeLocal(a['콜_날짜시간'])?.getTime()
        ?? parseDateTimeLocal(a['인입날짜'])?.getTime()
        ?? 0
      const bTime = parseDateTimeLocal(b['콜_날짜시간'])?.getTime()
        ?? parseDateTimeLocal(b['인입날짜'])?.getTime()
        ?? 0
      return bTime - aTime
    })

    return base
  }, [dateFilteredRows, activeTm])

  const statusBuckets = ['대기', '부재중', '리콜대기', '예약', '실패', '무효', '예약부도', '내원완료']
  const statusCounts = statusBuckets.reduce((acc, status) => {
    acc[status] = filteredRows.filter((row) => {
      const state = String(row['상태'] || '').trim()
      if (!state) return status === '대기'
      return state === status
    }).length
    return acc
  }, {})
  const totalCount = statusBuckets.reduce((sum, key) => sum + statusCounts[key], 0)
  const statusColors = {
    대기: '#60a5fa',
    부재중: '#fbbf24',
    리콜대기: '#a78bfa',
    예약: '#34d399',
    실패: '#ef4444',
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
    const region = normalizeRegionForChart(row['거주지'])
    acc[region] = (acc[region] || 0) + 1
    return acc
  }, {})
  const regionEntries = Object.entries(regionCounts).sort((a, b) => b[1] - a[1])
  const regionTotal = regionEntries.reduce((sum, [, count]) => sum + count, 0)

  const tmAssignedEntries = useMemo(() => {
    const validTmIds = new Set(nonAdminAgents.map((agent) => String(agent.id)))
    const counts = {}
    dateFilteredRows.forEach((row) => {
      const tmId = String(row.tm ?? '')
      if (!validTmIds.has(tmId)) return
      counts[tmId] = (counts[tmId] || 0) + 1
    })
    return nonAdminAgents
      .map((agent) => [agent.name, counts[String(agent.id)] || 0])
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
  }, [dateFilteredRows, nonAdminAgents])
  const tmAssignedTotal = tmAssignedEntries.reduce((sum, [, count]) => sum + count, 0)

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
          <span className="db-list-count">{filteredRows.length}건</span>
        </div>
      </div>

      <div className="db-list-filters">
        <label>
          배정 시작일
          <input
            type="date"
            value={assignedDateFrom}
            onChange={(e) => setAssignedDateFrom(e.target.value)}
          />
        </label>
        <label>
          배정 종료일
          <input
            type="date"
            value={assignedDateTo}
            onChange={(e) => setAssignedDateTo(e.target.value)}
          />
        </label>
        <button type="button" className="db-list-reset" onClick={() => applyQuickRange('today')}>오늘</button>
        <button type="button" className="db-list-reset" onClick={() => applyQuickRange('all')}>전체</button>
        <button type="button" className="db-list-reset" onClick={() => applyQuickRange('yesterday')}>어제</button>
        <button type="button" className="db-list-reset" onClick={() => applyQuickRange('last7')}>최근7일</button>
        <button type="button" className="db-list-reset" onClick={() => applyQuickRange('reset')}>날짜 초기화</button>
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
            <div className="tm-call-legend tm-call-legend-scroll">
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

        <div className="tm-call-box">
          <div className="tm-call-box-title">TM 배정 DB 비율</div>
          <div className="tm-call-box-body">
            <div
              className="tm-call-donut"
              style={{ background: buildDonut(tmAssignedEntries, tmAssignedTotal, eventPalette) }}
            >
              <div className="tm-call-donut-center">
                <div className="tm-call-total">{tmAssignedTotal}</div>
                <div className="tm-call-label">배정 DB</div>
              </div>
            </div>
            <div className="tm-call-legend">
              {tmAssignedEntries.map(([tmName, count], idx) => (
                <div className="tm-call-legend-row" key={tmName}>
                  <span
                    className="tm-call-legend-dot"
                    style={{ background: eventPalette[idx % eventPalette.length] }}
                  />
                  <span className="tm-call-legend-name">{tmName}</span>
                  <span className="tm-call-legend-count">{count}건</span>
                  <span className="tm-call-legend-percent">
                    {tmAssignedTotal ? Math.round((count / tmAssignedTotal) * 100) : 0}%
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
        {nonAdminAgents.map((agent) => (
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
        <div className="db-list-table tm-call-table">
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
                <div
                  key={key}
                  className={key === '최근메모내용' ? 'db-list-cell-memo' : ''}
                >
                  {formatCell(key, row[key])}
                </div>
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
                          {(() => {
                            const parsed = parseMemoStatusMeta(memo)
                            if (!parsed.badge) return null
                            const reservationText =
                              parsed.reservationText ||
                              (activeLead?.['예약_내원일시'] ? formatDateTime(activeLead['예약_내원일시']) : '')
                            const badgeClass =
                              parsed.badge === '예약'
                                ? 'tm-lead-memo-badge is-reserved'
                                : parsed.badge === '예약부도'
                                  ? 'tm-lead-memo-badge is-noshow'
                                  : 'tm-lead-memo-badge is-visited'
                            return (
                              <div className="tm-lead-memo-status">
                                <span className={badgeClass}>{parsed.badge}</span>
                                {reservationText ? (
                                  <span className="tm-lead-memo-status-time">예약일시: {reservationText}</span>
                                ) : null}
                              </div>
                            )
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


