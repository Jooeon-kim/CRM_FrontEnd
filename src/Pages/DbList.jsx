import { useEffect, useState } from 'react'
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

export default function DbList() {
  const dispatch = useDispatch()
  const dbCache = useSelector((state) => state.main.adminDatasets?.dbRows)
  const agentsCache = useSelector((state) => state.main.adminDatasets?.agents)
  const [rows, setRows] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [tmFilter, setTmFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [nameQuery, setNameQuery] = useState('')
  const [phoneQuery, setPhoneQuery] = useState('')
  const [eventFilter, setEventFilter] = useState('all')
  const [callMin, setCallMin] = useState('')
  const [missMin, setMissMin] = useState('')
  const [regionQuery, setRegionQuery] = useState('')
  const [memoQuery, setMemoQuery] = useState('')
  const [assignedTodayOnly, setAssignedTodayOnly] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [activeLead, setActiveLead] = useState(null)
  const [memos, setMemos] = useState([])
  const [saving, setSaving] = useState(false)
  const [createSaving, setCreateSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    event: '',
    status: '',
    region: '',
    memo: '',
    date: '',
    time: '',
    tmId: '',
  })
  const [createForm, setCreateForm] = useState({
    name: '',
    phone: '',
    event: '',
    tmId: '',
  })
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

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
      const [res, tmRes] = await Promise.all([
        api.get('/dbdata'),
        api.get('/tm/agents'),
      ])
      const normalizedRows = (res.data || []).map((row) => ({
        ...row,
        배정날짜:
          row?.['배정날짜'] ||
          row?.assigned_at ||
          row?.assigned_date ||
          row?.tm_assigned_at ||
          '',
      }))
      setRows(normalizedRows)
      setAgents(tmRes.data || [])
      dispatch(setAdminDataset({ key: 'dbRows', rows: normalizedRows, fetchedAt: Date.now() }))
      dispatch(setAdminDataset({ key: 'agents', rows: tmRes.data || [], fetchedAt: Date.now() }))
      setError('')
    } catch (err) {
      setError('DB 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) return <div className="db-list">불러오는 중...</div>

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

  const toKstDateKeyFromUtc = (value) => {
    const local = parseDateTimeLocal(value)
    if (!local) return ''
    const yyyy = local.getFullYear()
    const mm = String(local.getMonth() + 1).padStart(2, '0')
    const dd = String(local.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

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

  const formatMemoDateTimeKst = (value) => {
    if (!value) return ''
    const local = parseDateTimeLocal(value)
    if (!local) return String(value)
    const yyyy = local.getFullYear()
    const mm = String(local.getMonth() + 1).padStart(2, '0')
    const dd = String(local.getDate()).padStart(2, '0')
    const hh = String(local.getHours()).padStart(2, '0')
    const min = String(local.getMinutes()).padStart(2, '0')
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

  const formatUtcAsKstDateTime = (value) => {
    if (!value) return ''
    const local = parseDateTimeLocal(value)
    if (!local) return String(value)
    const yyyy = local.getFullYear()
    const mm = String(local.getMonth() + 1).padStart(2, '0')
    const dd = String(local.getDate()).padStart(2, '0')
    const hh = String(local.getHours()).padStart(2, '0')
    const min = String(local.getMinutes()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`
  }

  const formatReservationDateTime = (value) => {
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

  const normalizePhoneDigits = (value) => {
    if (!value) return ''
    let digits = String(value).replace(/\D/g, '')
    if (digits.startsWith('82')) {
      digits = `0${digits.slice(2)}`
    }
    return digits
  }

  const visibleColumns = [
    '인입날짜',
    '배정날짜',
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
    if (key === '예약_내원일시') {
      return value ? formatReservationDateTime(value) : '-'
    }
    if (key === '배정날짜') {
      return value ? formatUtcAsKstDateTime(value) : '-'
    }
    if (key === '콜_날짜시간') {
      return value ? formatUtcAsKstDateTime(value) : '-'
    }
    if (key === '인입날짜' || key === '배정날짜' || key === '콜_날짜시간' || key === '최근메모시간') {
      return value ? formatDateTime(value) : '-'
    }
    if (key === '연락처') {
      let digits = String(value ?? '').replace(/\D/g, '')
      if (digits.startsWith('82')) {
        digits = `0${digits.slice(2)}`
      }
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

  const splitDateTime = (value) => {
    if (!value) return { date: '', time: '' }
    const date = parseDateTimeLocal(value)
    if (!date || Number.isNaN(date.getTime())) return { date: '', time: '' }
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
      name: lead['이름'] || '',
      event: lead['이벤트'] || '',
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
    if (value === '예약부도') {
      setForm((prev) => ({
        ...prev,
        status: value,
        memo: String(prev.memo || '').includes('예약부도')
          ? prev.memo
          : (prev.memo ? `${prev.memo} 예약부도` : '예약부도'),
      }))
      return
    }
    if (value === '내원완료') {
      setForm((prev) => ({
        ...prev,
        status: value,
        memo: String(prev.memo || '').includes('내원완료')
          ? prev.memo
          : (prev.memo ? `${prev.memo} 내원완료` : '내원완료'),
      }))
      return
    }
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
        name: form.name,
        event: form.event,
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
                이름: form.name,
                이벤트: form.event,
                상태: form.status,
                거주지: form.region,
                예약_내원일시: reservationAt || row['예약_내원일시'],
                tm: form.tmId || row.tm,
                최근메모내용: form.memo || row['최근메모내용'],
                최근메모시간: form.memo ? new Date() : row['최근메모시간'],
              }
            : row
        )
      )
      dispatch(
        patchAdminDbLead({
          leadId: activeLead.id,
          patch: {
            이름: form.name,
            이벤트: form.event,
            상태: form.status,
            거주지: form.region,
            예약_내원일시: reservationAt || activeLead['예약_내원일시'],
            tm: form.tmId || activeLead.tm,
            최근메모내용: form.memo || activeLead['최근메모내용'],
            최근메모시간: form.memo ? new Date() : activeLead['최근메모시간'],
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

  const tmOptions = Array.from(
    new Set(
      rows
        .map((row) => row.tm)
        .filter((tm) => tm !== null && tm !== undefined && String(tm) !== '')
    )
  ).sort((a, b) => {
    const aNum = Number(a)
    const bNum = Number(b)
    if (aNum === 0) return -1
    if (bNum === 0) return 1
    return String(a).localeCompare(String(b), 'ko')
  })

  const statusOptions = ['대기', '예약', '부재중', '리콜대기', '실패', '무효', '예약부도', '내원완료']
  const eventOptions = Array.from(
    new Set(
      rows
        .map((row) => String(row['이벤트'] || '').trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, 'ko'))

  const normalizedRegion = regionQuery.trim().toLowerCase()
  const normalizedMemo = memoQuery.trim().toLowerCase()
  const normalizedName = nameQuery.trim().toLowerCase()
  const normalizedPhone = normalizePhoneDigits(phoneQuery)
  const callMinNum = Number(callMin)
  const missMinNum = Number(missMin)

  const isAssignedToday = (value) => {
    if (!value) return false
    const todayKst = toKstDateKeyFromUtc(new Date())
    return toKstDateKeyFromUtc(value) === todayKst
  }

  const filteredRows = rows.filter((row) => {
    const tmOk = tmFilter === 'all' || String(row.tm) === String(tmFilter)
    const statusValue = String(row['상태'] || '').trim()
    const normalizedStatus = statusValue || '대기'
    const statusOk =
      statusFilter === 'all' || normalizedStatus === statusFilter
    const callCount = Number(row['콜횟수'] || 0)
    const missCount = Number(row['부재중_횟수'] || 0)
    const callOk = Number.isNaN(callMinNum) || callMin === '' || callCount >= callMinNum
    const missOk = Number.isNaN(missMinNum) || missMin === '' || missCount >= missMinNum
    const nameOk =
      !normalizedName ||
      String(row['이름'] || '').toLowerCase().includes(normalizedName)
    const phoneOk =
      !normalizedPhone ||
      normalizePhoneDigits(row['연락처']).includes(normalizedPhone)
    const eventOk = eventFilter === 'all' || String(row['이벤트'] || '') === eventFilter
    const regionOk =
      !normalizedRegion ||
      String(row['거주지'] || '').toLowerCase().includes(normalizedRegion)
    const memoOk =
      !normalizedMemo ||
      String(row['최근메모내용'] || '').toLowerCase().includes(normalizedMemo)
    const assignedOk = !assignedTodayOnly || isAssignedToday(row['배정날짜'])

    return tmOk && statusOk && callOk && missOk && nameOk && phoneOk && eventOk && regionOk && memoOk && assignedOk
  })

  const handleReset = () => {
    setTmFilter('all')
    setStatusFilter('all')
    setNameQuery('')
    setPhoneQuery('')
    setEventFilter('all')
    setCallMin('')
    setMissMin('')
    setRegionQuery('')
    setMemoQuery('')
  }

  const handleExport = async () => {
    try {
      setDownloading(true)
      const response = await api.get('/dbdata/export', {
        responseType: 'blob',
        params: {
          tm: tmFilter,
          status: statusFilter,
          name: nameQuery,
          phone: phoneQuery,
          callMin,
          missMin,
          event: eventFilter === 'all' ? '' : eventFilter,
          region: regionQuery,
          memo: memoQuery,
          assignedTodayOnly: assignedTodayOnly ? '1' : '',
        },
      })
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'db_list.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError('엑셀 다운로드에 실패했습니다.')
    } finally {
      setDownloading(false)
    }
  }

  const openCreateModal = () => {
    setCreateForm({
      name: '',
      phone: '',
      event: eventOptions[0] || '',
      tmId: '',
    })
    setCreateModalOpen(true)
  }

  const handleCreate = async () => {
    if (!createForm.name.trim() || !createForm.phone.trim() || !createForm.event.trim()) {
      setError('이름, 연락처, 이벤트를 입력해주세요.')
      return
    }
    try {
      setCreateSaving(true)
      await api.post('/admin/leads', {
        name: createForm.name.trim(),
        phone: createForm.phone.trim(),
        event: createForm.event.trim(),
        tmId: createForm.tmId || null,
      })
      await load()
      setCreateModalOpen(false)
      setError('')
    } catch (err) {
      setError('DB 추가에 실패했습니다.')
    } finally {
      setCreateSaving(false)
    }
  }

  return (
      <div className="db-list">
        <div className="db-list-header">
          <h1>DB 목록</h1>
          <div className="db-list-actions">
            <button
              className="db-list-reset mobile-filter-toggle"
              type="button"
              onClick={() => setMobileFiltersOpen((prev) => !prev)}
            >
              {mobileFiltersOpen ? '필터 닫기' : '필터 열기'}
            </button>
            <div className="tm-db-search">
              <input
                type="text"
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
              placeholder="이름 검색"
            />
          </div>
          <div className="tm-db-search">
            <input
              type="text"
              value={phoneQuery}
              onChange={(e) => setPhoneQuery(e.target.value)}
              placeholder="전화번호 검색"
            />
          </div>
            <button className="db-list-export" type="button" onClick={openCreateModal}>
              DB 추가
            </button>
          <button className="db-list-reset" type="button" onClick={handleReset}>
            초기화
          </button>
          <span className="db-list-count">{filteredRows.length}건</span>
        </div>
      </div>

        <div className={`db-list-filters${mobileFiltersOpen ? ' open' : ''}`}>
        <label>
          TM
          <select value={tmFilter} onChange={(e) => setTmFilter(e.target.value)}>
            <option value="all">전체</option>
            {tmOptions.map((tm) => (
              <option key={tm} value={tm}>
                {String(tm) === '0'
                  ? '보류'
                  : agents.find((agent) => String(agent.id) === String(tm))?.name || tm}
              </option>
            ))}
          </select>
        </label>
        <label>
          상태
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">전체</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          이벤트
          <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
            <option value="all">전체</option>
            {eventOptions.map((event) => (
              <option key={event} value={event}>{event}</option>
            ))}
          </select>
        </label>
        <label>
          콜횟수 ≥
          <input
            type="number"
            min="0"
            value={callMin}
            onChange={(e) => setCallMin(e.target.value)}
          />
        </label>
        <label>
          부재중 ≥
          <input
            type="number"
            min="0"
            value={missMin}
            onChange={(e) => setMissMin(e.target.value)}
          />
        </label>
        <label>
          거주지
          <input
            type="text"
            placeholder="검색"
            value={regionQuery}
            onChange={(e) => setRegionQuery(e.target.value)}
          />
        </label>
        <label>
          메모내용
          <input
            type="text"
            placeholder="검색"
            value={memoQuery}
            onChange={(e) => setMemoQuery(e.target.value)}
          />
        </label>
          <label className="db-list-checkbox">
            <input
              type="checkbox"
              checked={assignedTodayOnly}
              onChange={(e) => setAssignedTodayOnly(e.target.checked)}
            />
            당일배정DB
          </label>
          <button
            className="db-list-export"
            type="button"
            onClick={handleExport}
            disabled={downloading}
          >
            {downloading ? '다운로드 중...' : '엑셀 다운로드'}
          </button>
        </div>

      {error ? <div className="db-list-error">{error}</div> : null}

        {filteredRows.length === 0 ? (
          <div className="db-list-empty">표시할 데이터가 없습니다.</div>
        ) : (
          <>
          <div className="db-list-table desktop-table">
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
          <div className="db-list-mobile-cards">
            {filteredRows.map((row, index) => (
              <button
                type="button"
                key={`m-${index}`}
                className="db-mobile-card"
                onClick={() => openModal(row)}
              >
                <div className="db-mobile-card-head">
                  <strong>{row['이름'] || '-'}</strong>
                  <span>{formatCell('상태', row['상태'])}</span>
                </div>
                <div className="db-mobile-card-line">연락처: {formatCell('연락처', row['연락처'])}</div>
                <div className="db-mobile-card-line">이벤트: {formatCell('이벤트', row['이벤트'])}</div>
                <div className="db-mobile-card-line">TM: {formatCell('tm', row['tm'])}</div>
                <div className="db-mobile-card-line">인입: {formatCell('인입날짜', row['인입날짜'])}</div>
                <div className="db-mobile-card-line">배정: {formatCell('배정날짜', row['배정날짜'])}</div>
                {row['예약_내원일시'] ? (
                  <div className="db-mobile-card-line">
                    <span className="db-mobile-badge is-reserved">예약</span>{' '}
                    {formatCell('예약_내원일시', row['예약_내원일시'])}
                  </div>
                ) : null}
                <div className="db-mobile-card-line db-mobile-card-memo">
                  메모: {formatCell('최근메모내용', row['최근메모내용'])}
                </div>
              </button>
            ))}
          </div>
          </>
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
                          <div className="tm-lead-memo-time">{formatMemoDateTimeKst(memo.memo_time)}</div>
                          {(() => {
                            const parsed = parseMemoStatusMeta(memo)
                            if (!parsed.badge) return null
                            const statusTimeText = parsed.badge === '리콜대기'
                              ? (
                                parsed.reservationText ||
                                (activeLead?.['리콜_예정일시'] ? formatDateTime(activeLead['리콜_예정일시']) : '')
                              )
                              : (
                                parsed.reservationText ||
                                (activeLead?.['예약_내원일시'] ? formatDateTime(activeLead['예약_내원일시']) : '')
                              )
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
                            return (
                              <div className="tm-lead-memo-status">
                                <span className={badgeClass}>{parsed.badge}</span>
                                {statusTimeText ? (
                                  <span className="tm-lead-memo-status-time">{statusTimeLabel}: {statusTimeText}</span>
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
                    고객 이름
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </label>

                  <label>
                    이벤트
                    <input
                      type="text"
                      list="admin-event-options"
                      value={form.event}
                      onChange={(e) => setForm({ ...form, event: e.target.value })}
                    />
                    <datalist id="admin-event-options">
                      {eventOptions.map((event) => (
                        <option key={event} value={event} />
                      ))}
                    </datalist>
                  </label>

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

      {createModalOpen ? (
        <div className="tm-lead-modal">
          <div className="tm-lead-backdrop" onClick={() => setCreateModalOpen(false)} />
          <div className="tm-lead-card">
            <div className="tm-lead-header">
              <h3>DB 추가</h3>
              <button type="button" onClick={() => setCreateModalOpen(false)}>닫기</button>
            </div>

            <div className="tm-lead-form">
              <label>
                이름
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </label>
              <label>
                연락처
                <input
                  type="text"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </label>
              <label>
                이벤트
                <select
                  value={createForm.event}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, event: e.target.value }))}
                >
                  <option value="">선택</option>
                  {eventOptions.map((event) => (
                    <option key={event} value={event}>{event}</option>
                  ))}
                </select>
              </label>
              <label>
                TM
                <select
                  value={createForm.tmId}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, tmId: e.target.value }))}
                >
                  <option value="">미지정</option>
                  {agents
                    .filter((agent) => !agent.isAdmin)
                    .map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.name}</option>
                    ))}
                </select>
              </label>
            </div>

            <div className="tm-lead-actions">
              <button type="button" onClick={() => setCreateModalOpen(false)}>취소</button>
              <button type="button" onClick={handleCreate} disabled={createSaving}>
                {createSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}



