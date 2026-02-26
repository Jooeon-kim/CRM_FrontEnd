import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import api from '../apiClient'
import { patchTmDbLead, setTmDbCache } from '../store/mainSlice'

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
const recallHourOptions = Array.from({ length: 12 }, (_, idx) => String(idx + 1))

const parseDateTimeLocal = (value) => {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const raw = String(value).trim()
  // Keep wall-clock time stable even when backend sends ISO strings with timezone.
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/)
  if (iso) {
    const date = new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3]),
      Number(iso[4]),
      Number(iso[5]),
      Number(iso[6] || '0')
    )
    return Number.isNaN(date.getTime()) ? null : date
  }
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (m) {
    const date = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6] || '0')
    )
    return Number.isNaN(date.getTime()) ? null : date
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

const formatUtcAsKstDateTime = (value) => {
  const local = parseDateTimeLocal(value)
  if (!local) return String(value || '-')
  const yyyy = local.getFullYear()
  const mm = String(local.getMonth() + 1).padStart(2, '0')
  const dd = String(local.getDate()).padStart(2, '0')
  const hh = String(local.getHours()).padStart(2, '0')
  const min = String(local.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

const toDateTimeValue = (value) => {
  const date = parseDateTimeLocal(value)
  if (!date) return null
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

const splitDateTimeValue = (value) => {
  const date = parseDateTimeLocal(value)
  if (!date) return { date: '', time: '' }
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` }
}

const toLocalDateTimeString = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

export default function TmDbList({ statusFilter, onlyEmptyStatus = false, onlyAvailable = false, assignedTodayOnly = false }) {
  const dispatch = useDispatch()
  const { user } = useSelector((state) => state.auth)
  const tmDbCache = useSelector((state) => state.main?.tmDbCache || {})
  const cacheKey = useMemo(() => {
    const tmId = user?.id ? String(user.id) : '0'
    return `tm:${tmId}:base`
  }, [user?.id])
  const cacheEntry = tmDbCache?.[cacheKey]
  const [rows, setRows] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [activeLead, setActiveLead] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilterLocal, setStatusFilterLocal] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')
  const [regionFilter, setRegionFilter] = useState('all')
  const [inboundSort, setInboundSort] = useState('desc')
  const [callMin, setCallMin] = useState('')
  const [missMin, setMissMin] = useState('')
  const [noShowMin, setNoShowMin] = useState('')
  const [form, setForm] = useState({
    name: '',
    status: '',
    region: '',
    memo: '',
    date: '',
    time: '',
    recallHours: '1',
    recallDate: '',
    recallTime: '',
    recallAt: null,
  })
  const [memos, setMemos] = useState([])
  const [memoLoading, setMemoLoading] = useState(false)
  const [memoCacheByPhone, setMemoCacheByPhone] = useState({})
  const [phoneEventsCacheByPhone, setPhoneEventsCacheByPhone] = useState({})
  const [phoneEvents, setPhoneEvents] = useState([])
  const [editingMemoId, setEditingMemoId] = useState(null)
  const [editingMemoContent, setEditingMemoContent] = useState('')
  const [editingMemoSaving, setEditingMemoSaving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  useEffect(() => {
    if (cacheEntry && Array.isArray(cacheEntry.rows)) {
      setRows(cacheEntry.rows)
      setLoading(false)
    }
  }, [cacheEntry])

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return
      try {
        const cacheFresh =
          cacheEntry &&
          Array.isArray(cacheEntry.rows) &&
          Date.now() - Number(cacheEntry.fetchedAt || 0) < 5 * 60 * 1000
        if (cacheFresh) {
          setRows(cacheEntry.rows)
          try {
            const tmRes = await api.get('/tm/agents')
            setAgents(tmRes.data || [])
          } catch {
            // keep previous agents
          }
          setError('')
          setLoading(false)
          return
        }
        setLoading(true)
        const [dbRes, tmRes] = await Promise.all([
          api.get('/dbdata', {
            params: {
              tm: user.id,
              status: 'all',
            },
          }),
          api.get('/tm/agents'),
        ])
        const nextRows = dbRes.data || []
        setRows(nextRows)
        dispatch(
          setTmDbCache({
            key: cacheKey,
            rows: nextRows,
            fetchedAt: Date.now(),
          })
        )
        setAgents(tmRes.data || [])
        setError('')
      } catch (err) {
        setError('DB 목록을 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user?.id, cacheEntry, cacheKey, dispatch])

  const formatDateTime = (value) => {
    if (!value) return '-'
    const date = parseDateTimeLocal(value)
    if (!date) return String(value)
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const hh = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`
  }

  const formatMemoDateTime = (value) => {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return formatDateTime(value)
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
    if (digits.startsWith('82')) digits = `0${digits.slice(2)}`
    return digits
  }

  const getAssignedDateValue = (row) =>
    row?.['배정날짜'] || row?.assigned_at || row?.assigned_date || row?.tm_assigned_at || ''

  const parseKoreanRange = (value) => {
    if (!value) return null
    const parts = String(value).replace(/\s+/g, ' ').split('~').map((part) => part.trim())
    if (parts.length !== 2) return null

    const toMinutes = (text) => {
      let t = text.replace(/_/g, ' ')
      const isPm = t.includes('오후')
      const isAm = t.includes('오전')
      t = t.replace('오전', '').replace('오후', '').trim()
      const match = t.match(/(\d{1,2})시(?:\s*(\d{1,2})분?)?/)
      if (!match) return null
      let hour = Number(match[1])
      const minute = match[2] ? Number(match[2]) : 0
      if (isPm && hour < 12) hour += 12
      if (isAm && hour === 12) hour = 0
      return hour * 60 + minute
    }

    const start = toMinutes(parts[0])
    const end = toMinutes(parts[1])
    if (start === null || end === null) return null
    return { start, end }
  }

  const isAvailableNow = (lead) => {
    const range = parseKoreanRange(lead?.['상담가능시간'])
    if (!range) return false
    const now = new Date()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    return nowMinutes >= range.start && nowMinutes <= range.end
  }

  const isAssignedToday = (lead) => {
    const value = getAssignedDateValue(lead)
    if (!value) return false
    const todayKst = toKstDateKeyFromUtc(new Date())
    return toKstDateKeyFromUtc(value) === todayKst
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

  const visibleColumns = assignedTodayOnly
    ? ['배정날짜', '이름', '연락처', '이벤트', '상태', '거주지', '예약_내원일시', ...(statusFilter === '리콜대기' ? ['리콜_예정일시'] : []), '최근메모내용', '콜횟수']
    : ['인입날짜', '이름', '연락처', '이벤트', '상태', '거주지', '예약_내원일시', ...(statusFilter === '리콜대기' ? ['리콜_예정일시'] : []), '최근메모내용', '콜횟수']
  const hasRecallColumn = visibleColumns.includes('리콜_예정일시')

  const openModal = async (lead) => {
    const recallParts = splitDateTimeValue(lead?.['리콜_예정일시'])
    const phoneKey = normalizePhoneDigits(lead?.['연락처'])
    const phoneParam = phoneKey || String(lead?.['연락처'] || '')
    const cachedMemos = memoCacheByPhone?.[phoneKey]
    const cachedEvents = phoneEventsCacheByPhone?.[phoneKey]

    setActiveLead(lead)
    setForm({
      name: lead['이름'] || '',
      status: '',
      region: lead['거주지'] || '',
      memo: '',
      date: '',
      time: '',
      recallHours: '1',
      recallDate: recallParts.date,
      recallTime: recallParts.time,
      recallAt: toDateTimeValue(lead['리콜_예정일시']),
    })
    setMemos(Array.isArray(cachedMemos) ? cachedMemos : [])
    setPhoneEvents(Array.isArray(cachedEvents) ? cachedEvents : [])
    setEditingMemoId(null)
    setEditingMemoContent('')
    setModalOpen(true)
    try {
      setMemoLoading(!Array.isArray(cachedMemos))
      let loaded = false
      try {
        const res = await api.get('/tm/memos', { params: { phone: phoneParam, detailed: 1, leadId: lead.id, limit: 20 } })
        if (Array.isArray(res.data)) {
          const nextMemos = res.data || []
          setMemos(nextMemos)
          setPhoneEvents([])
          setMemoCacheByPhone((prev) => ({ ...prev, [phoneKey]: nextMemos }))
          setPhoneEventsCacheByPhone((prev) => ({ ...prev, [phoneKey]: [] }))
        } else {
          const nextMemos = res.data?.memos || []
          const nextEvents = res.data?.events || []
          setMemos(nextMemos)
          setPhoneEvents(nextEvents)
          setMemoCacheByPhone((prev) => ({ ...prev, [phoneKey]: nextMemos }))
          setPhoneEventsCacheByPhone((prev) => ({ ...prev, [phoneKey]: nextEvents }))
        }
        loaded = true
      } catch {
        loaded = false
      }

      if (!loaded) {
        const fallbackRes = await api.get('/tm/memos', { params: { phone: phoneParam } })
        const fallbackMemos = Array.isArray(fallbackRes.data) ? fallbackRes.data : (fallbackRes.data?.memos || [])
        setMemos(fallbackMemos)
        setPhoneEvents([])
        setMemoCacheByPhone((prev) => ({ ...prev, [phoneKey]: fallbackMemos }))
        setPhoneEventsCacheByPhone((prev) => ({ ...prev, [phoneKey]: [] }))
      }
    } catch {
      if (!Array.isArray(cachedMemos)) {
        setMemos([])
      }
      if (!Array.isArray(cachedEvents)) {
        setPhoneEvents([])
      }
    } finally {
      setMemoLoading(false)
    }
  }

  const handleStatusChange = (value) => {
    if (!activeLead) return
    if (value === '부재중') {
      const missCount = Number(activeLead['부재중_횟수'] || 0) + 1
      setForm((prev) => ({
        ...prev,
        status: value,
        memo: prev.memo ? `${prev.memo} ${missCount}차부재` : `${missCount}차부재`,
      }))
      return
    }
    if (value === '예약부도') {
      setForm((prev) => ({ ...prev, status: value }))
      return
    }
    if (value === '리콜대기') {
      setForm((prev) => {
        if (prev.recallAt) {
          const parts = splitDateTimeValue(prev.recallAt)
          return { ...prev, status: value, recallDate: parts.date, recallTime: parts.time }
        }
        const base = new Date()
        base.setHours(base.getHours() + 1, 0, 0, 0)
        const baseValue = toDateTimeValue(base)
        const parts = splitDateTimeValue(baseValue)
        return {
          ...prev,
          status: value,
          recallHours: prev.recallHours || '1',
          recallDate: parts.date,
          recallTime: parts.time,
          recallAt: baseValue,
        }
      })
      return
    }
    setForm((prev) => ({ ...prev, status: value }))
  }

  const applyRecallAfterHours = (hours) => {
    const now = new Date()
    const offset = Number(hours)
    const target = new Date(now)
    if (!Number.isNaN(offset) && offset > 0) {
      target.setHours(target.getHours() + offset)
    }
    target.setSeconds(0, 0)
    const nextRecallAt = toDateTimeValue(target)
    const parts = splitDateTimeValue(nextRecallAt)
    setForm((prev) => ({
      ...prev,
      status: '리콜대기',
      recallHours: String(hours),
      recallDate: parts.date,
      recallTime: parts.time,
      recallAt: nextRecallAt,
    }))
  }

  const applyRecallDateTime = (dateValue, timeValue) => {
    if (!dateValue || !timeValue) {
      setForm((prev) => ({
        ...prev,
        recallDate: dateValue || '',
        recallTime: timeValue || '',
        recallAt: null,
      }))
      return
    }
    const nextRecallAt = `${dateValue} ${timeValue}:00`
    setForm((prev) => ({
      ...prev,
      status: '리콜대기',
      recallDate: dateValue,
      recallTime: timeValue,
      recallAt: nextRecallAt,
    }))
  }

  const clearRecallSchedule = () => {
    setForm((prev) => ({
      ...prev,
      status: '리콜대기',
      recallDate: '',
      recallTime: '',
      recallAt: null,
    }))
  }

  const handleSave = async () => {
    if (!activeLead || !user?.id) return
    const hasStatusChange = Boolean(form.status)
    if (hasStatusChange && form.status === '예약' && (!form.date || !form.time)) return

    const leadId = activeLead.id
    const leadPhone = activeLead['연락처'] || ''
    const reservationAt =
      hasStatusChange
        ? (form.status === '예약' ? `${form.date} ${form.time}:00` : null)
        : undefined
    const recallAt =
      hasStatusChange
        ? (form.status === '리콜대기' ? form.recallAt : undefined)
        : undefined

    try {
      setSaving(true)
      const finalMemo = String(form.memo || '').trim()
      const memoToSave = finalMemo
      await api.post(`/tm/leads/${leadId}/update`, {
        status: hasStatusChange ? form.status : undefined,
        name: form.name,
        region: form.region,
        memo: memoToSave,
        tmId: user.id,
        reservationAt,
        recallAt,
        phone: leadPhone,
      })
      const nowIso = toLocalDateTimeString(new Date())
      const nextStatus = hasStatusChange ? form.status : activeLead['상태']
      const nextReservationAt = hasStatusChange
        ? (reservationAt || activeLead['예약_내원일시'])
        : activeLead['예약_내원일시']
      const nextLead = {
        ...activeLead,
        이름: form.name,
        상태: nextStatus,
        거주지: form.region,
        예약_내원일시: nextReservationAt,
        리콜_예정일시: hasStatusChange && form.status === '리콜대기'
          ? recallAt
          : activeLead['리콜_예정일시'],
        콜횟수: (Number(activeLead['콜횟수'] || 0) + (hasStatusChange && ['부재중', '리콜대기', '예약', '실패'].includes(form.status) ? 1 : 0)),
        부재중_횟수: hasStatusChange && form.status === '부재중' ? Number(activeLead['부재중_횟수'] || 0) + 1 : activeLead['부재중_횟수'],
        예약부도_횟수: hasStatusChange && form.status === '예약부도' ? Number(activeLead['예약부도_횟수'] || 0) + 1 : activeLead['예약부도_횟수'],
        최근메모내용: memoToSave || activeLead['최근메모내용'],
        최근메모시간: memoToSave ? nowIso : activeLead['최근메모시간'],
      }
      setRows((prev) => {
        const next = prev.map((row) =>
          String(row.id) === String(leadId)
            ? {
                ...row,
                ...nextLead,
              }
            : row
        )
        dispatch(
          setTmDbCache({
            key: cacheKey,
            rows: next,
            fetchedAt: Date.now(),
          })
        )
        return next
      })
      dispatch(
        patchTmDbLead({
          tmId: user.id,
          leadId,
          patch: nextLead,
        })
      )
      setActiveLead(nextLead)
      const phoneKey = normalizePhoneDigits(leadPhone)
      if (memoToSave) {
        const memoStatusTag = String(nextStatus || '').trim() || null
        const memoStatusReservationAt = ['예약', '예약부도', '내원완료'].includes(memoStatusTag)
          ? (nextReservationAt || null)
          : null
        const nextMemoRows = [
          {
            memo_time: nowIso,
            memo_content: memoToSave,
            status_tag: memoStatusTag,
            status_reservation_at: memoStatusReservationAt,
            tm_id: user.id,
            tm_name: user?.username || '',
          },
          ...memos,
        ].slice(0, 20)
        setMemos(nextMemoRows)
        setMemoCacheByPhone((prev) => ({ ...prev, [phoneKey]: nextMemoRows }))
      }
      setForm((prev) => ({
        ...prev,
        status: '',
        memo: '',
        date: '',
        time: '',
        recallHours: prev.recallHours,
        recallDate: prev.recallDate,
        recallTime: prev.recallTime,
        recallAt: prev.recallAt,
      }))

      // keep optimistic memo cache to avoid extra loading calls
    } catch (err) {
      setError('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleShareLead = () => {
    if (!activeLead?.id) return
    window.dispatchEvent(
      new CustomEvent('crm:share-lead', {
        detail: {
          lead: {
            id: activeLead.id,
            이름: activeLead['이름'] || '',
            연락처: activeLead['연락처'] || '',
            이벤트: activeLead['이벤트'] || '',
          },
        },
      })
    )
  }

  const startEditMemo = (memo) => {
    setEditingMemoId(memo.id)
    setEditingMemoContent(memo.memo_content || '')
  }

  const cancelEditMemo = () => {
    setEditingMemoId(null)
    setEditingMemoContent('')
  }

  const submitEditMemo = async () => {
    if (!editingMemoId || !user?.id) return
    const nextContent = String(editingMemoContent || '').trim()
    if (!nextContent) return
    try {
      setEditingMemoSaving(true)
      await api.patch(`/tm/memos/${editingMemoId}`, {
        memoContent: nextContent,
        tmId: user.id,
      })
      setMemos((prev) =>
        prev.map((memo) =>
          String(memo.id) === String(editingMemoId)
            ? { ...memo, memo_content: nextContent }
            : memo
        )
      )
      if (activeLead?.['연락처']) {
        const phoneKey = normalizePhoneDigits(activeLead['연락처'])
        setMemoCacheByPhone((prev) => ({
          ...prev,
          [phoneKey]: (prev[phoneKey] || []).map((memo) =>
            String(memo.id) === String(editingMemoId)
              ? { ...memo, memo_content: nextContent }
              : memo
          ),
        }))
      }
      cancelEditMemo()
    } catch {
      setError('메모 수정에 실패했습니다.')
    } finally {
      setEditingMemoSaving(false)
    }
  }

  const handleDeleteMemo = async (memoId) => {
    if (!memoId || !user?.id) return
    try {
      await api.delete(`/tm/memos/${memoId}`, { params: { tmId: user.id } })
      setMemos((prev) => prev.filter((memo) => String(memo.id) !== String(memoId)))
      if (activeLead?.['연락처']) {
        const phoneKey = normalizePhoneDigits(activeLead['연락처'])
        setMemoCacheByPhone((prev) => ({
          ...prev,
          [phoneKey]: (prev[phoneKey] || []).filter((memo) => String(memo.id) !== String(memoId)),
        }))
      }
    } catch {
      setError('메모 삭제에 실패했습니다.')
    }
  }

  const filteredRows = useMemo(() => {
    const isRecallPage = statusFilter === '리콜대기'
    return [...rows].sort((a, b) => {
      if (isRecallPage) {
        const aRecall = parseDateTimeLocal(a?.['리콜_예정일시'])?.getTime() ?? Number.MAX_SAFE_INTEGER
        const bRecall = parseDateTimeLocal(b?.['리콜_예정일시'])?.getTime() ?? Number.MAX_SAFE_INTEGER
        if (aRecall !== bRecall) return aRecall - bRecall
      }
      const aBase = assignedTodayOnly
        ? getAssignedDateValue(a)
        : a?.['인입날짜']
      const bBase = assignedTodayOnly
        ? getAssignedDateValue(b)
        : b?.['인입날짜']
      const aTime = parseDateTimeLocal(aBase)?.getTime() ?? Number.NaN
      const bTime = parseDateTimeLocal(bBase)?.getTime() ?? Number.NaN
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0
      if (Number.isNaN(aTime)) return 1
      if (Number.isNaN(bTime)) return -1
      return inboundSort === 'asc' ? aTime - bTime : bTime - aTime
    })
  }, [rows, inboundSort, assignedTodayOnly, statusFilter])

  const filterOptions = useMemo(() => {
    const events = new Set()
    const regions = new Set()
    rows.forEach((row) => {
      if (row['이벤트']) events.add(row['이벤트'])
      if (row['거주지']) regions.add(row['거주지'])
    })
    return {
      events: Array.from(events),
      regions: Array.from(regions),
    }
  }, [rows])

  const filteredList = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    const termDigits = normalizePhoneDigits(term)
    const callMinNum = callMin === '' ? null : Number(callMin)
    const missMinNum = missMin === '' ? null : Number(missMin)
    const noShowMinNum = noShowMin === '' ? null : Number(noShowMin)
    return filteredRows.filter((row) => {
      const statusValue = row['상태'] || '대기'
      const passRouteStatus = !statusFilter || statusValue === statusFilter
      const passStatus = statusFilterLocal === 'all' || statusFilterLocal === statusValue
      const passEvent = eventFilter === 'all' || eventFilter === row['이벤트']
      const passRegion = regionFilter === 'all' || regionFilter === row['거주지']
      const callCount = Number(row['콜횟수'] || 0)
      const missCount = Number(row['부재중_횟수'] || 0)
      const noShowCount = Number(row['예약부도_횟수'] || 0)
      const passCall = callMinNum === null || callCount >= callMinNum
      const passMiss = missMinNum === null || missCount >= missMinNum
      const passNoShow = noShowMinNum === null || noShowCount >= noShowMinNum
      const emptyStatus = !row['상태'] || String(row['상태']).trim().length === 0
      const passEmptyStatus = !onlyEmptyStatus || emptyStatus
      const passAvailable = !onlyAvailable || isAvailableNow(row)
      const passAssignedToday = !assignedTodayOnly || isAssignedToday(row)
      if (!passRouteStatus || !passStatus || !passEvent || !passRegion || !passCall || !passMiss || !passNoShow) {
        return false
      }
      if (!passEmptyStatus || !passAvailable || !passAssignedToday) {
        return false
      }
      if (!term) return true
      const name = String(row['이름'] || '').toLowerCase()
      const phone = normalizePhoneDigits(row['연락처'])
      const event = String(row['이벤트'] || '').toLowerCase()
      const memo = String(row['최근메모내용'] || '').toLowerCase()
      return (
        name.includes(term) ||
        (termDigits ? phone.includes(termDigits) : false) ||
        event.includes(term) ||
        memo.includes(term)
      )
    })
  }, [filteredRows, searchTerm, statusFilter, statusFilterLocal, eventFilter, regionFilter, callMin, missMin, noShowMin, onlyEmptyStatus, onlyAvailable, assignedTodayOnly])

  const getRecallUrgency = (row) => {
    if ((row?.['상태'] || '') !== '리콜대기') return ''
    const dueAt = parseDateTimeLocal(row?.['리콜_예정일시'])
    if (!dueAt) return ''
    const now = new Date()
    const isSameHour =
      dueAt.getFullYear() === now.getFullYear() &&
      dueAt.getMonth() === now.getMonth() &&
      dueAt.getDate() === now.getDate() &&
      dueAt.getHours() === now.getHours()
    if (isSameHour) return 'hour'
    const diff = dueAt.getTime() - Date.now()
    if (diff <= 0) return 'due'
    if (diff <= 1000 * 60 * 60) return 'soon'
    return ''
  }

  const handleExport = () => {
    if (filteredList.length === 0) return
    const headers = visibleColumns.map((col) => col)
    const lines = [headers.join(',')]
    filteredList.forEach((row) => {
        const values = visibleColumns.map((col) => {
          const raw =
            col === '연락처'
              ? formatPhone(row[col])
            : col === '배정날짜'
              ? formatUtcAsKstDateTime(getAssignedDateValue(row))
            : col === '인입날짜' || col === '배정날짜' || col === '예약_내원일시'
              ? formatDateTime(row[col])
              : row[col] ?? ''
        const safe = String(raw ?? '').replace(/"/g, '""')
        return `"${safe}"`
      })
      lines.push(values.join(','))
    })
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'tm-db-list.csv'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  if (!user?.id) return <div className="db-list">TM 정보가 없습니다.</div>
  if (loading) return <div className="db-list">불러오는 중...</div>

  const renderLeadActionButtons = (extraClass = '') => (
    <div className={`tm-lead-actions ${extraClass}`.trim()}>
      <button
        type="button"
        onClick={() => setForm((prev) => ({
          ...prev,
          memo: prev.memo ? `${prev.memo}\n${toLocalDateTimeString(new Date())}` : toLocalDateTimeString(new Date()),
        }))}
      >
        현재시간기입
      </button>
      <button
        type="button"
        onClick={() => setForm((prev) => ({
          ...prev,
          memo: prev.memo ? `${prev.memo}/예약ok` : '/예약ok',
        }))}
      >
        예약ok
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
      <button
        type="button"
        onClick={() => {
          const myTmName = user?.username || user?.name || ''
          if (!myTmName) return
          setForm((prev) => ({
            ...prev,
            memo: prev.memo ? `${prev.memo}/${myTmName}` : `/${myTmName}`,
          }))
        }}
      >
        /본인TM이름
      </button>
      <button type="button" onClick={handleShareLead}>
        공유
      </button>
      <button type="button" onClick={() => setModalOpen(false)}>취소</button>
      <button type="button" onClick={handleSave} disabled={saving}>
        {saving ? '저장 중...' : '저장'}
      </button>
    </div>
  )

  return (
    <div className="db-list">
        <div className="db-list-header">
          <div>
            <h1>{statusFilter ? statusFilter : ''}</h1>
            <span className="db-list-count">{filteredList.length}건</span>
          </div>
          <div className="db-list-actions">
            <button
              type="button"
              className="db-list-reset mobile-filter-toggle"
              onClick={() => setMobileFiltersOpen((prev) => !prev)}
            >
              {mobileFiltersOpen ? '필터 닫기' : '필터 열기'}
            </button>
            <div className="tm-db-search">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="이름, 연락처, 이벤트, 메모 검색"
              />
            </div>
          </div>
        </div>

      <div className={`tm-db-filters${mobileFiltersOpen ? ' open' : ''}`}>
        <label>
          상태
          <select value={statusFilterLocal} onChange={(e) => setStatusFilterLocal(e.target.value)}>
            <option value="all">전체</option>
            <option value="대기">대기</option>
            <option value="예약">예약</option>
            <option value="부재중">부재중</option>
            <option value="리콜대기">리콜대기</option>
            <option value="무효">무효</option>
            <option value="실패">실패</option>
            <option value="예약부도">예약부도</option>
            <option value="내원완료">내원완료</option>
          </select>
        </label>
        <label>
          이벤트
          <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
            <option value="all">전체</option>
            {filterOptions.events.map((event) => (
              <option key={event} value={event}>{event}</option>
            ))}
          </select>
        </label>
        <label>
          거주지
          <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
            <option value="all">전체</option>
            {filterOptions.regions.map((region) => (
              <option key={region} value={region}>{region}</option>
            ))}
          </select>
        </label>
        {assignedTodayOnly ? (
          <label>
            배정날짜 정렬
            <select value={inboundSort} onChange={(e) => setInboundSort(e.target.value)}>
              <option value="desc">내림차순</option>
              <option value="asc">오름차순</option>
            </select>
          </label>
        ) : null}
        <label>
          콜횟수 이상
          <input
            type="number"
            min="0"
            value={callMin}
            onChange={(e) => setCallMin(e.target.value)}
            placeholder="예: 2"
          />
        </label>
        <label>
          부재중 이상
          <input
            type="number"
            min="0"
            value={missMin}
            onChange={(e) => setMissMin(e.target.value)}
            placeholder="예: 1"
          />
        </label>
          <label>
            예약부도 이상
            <input
              type="number"
              min="0"
              value={noShowMin}
              onChange={(e) => setNoShowMin(e.target.value)}
              placeholder="예: 1"
            />
          </label>
          <button
            type="button"
            className="db-list-export"
            onClick={handleExport}
            disabled={filteredList.length === 0}
          >
            엑셀 다운로드
          </button>
        </div>

      {error ? <div className="db-list-error">{error}</div> : null}

        {filteredList.length === 0 ? (
          <div className="db-list-empty">표시할 데이터가 없습니다.</div>
        ) : (
        <>
        <div className="db-list-table tm-db-table desktop-table">
          <div className={`db-list-row db-list-head tm-db-row${hasRecallColumn ? ' tm-db-row-recall' : ''}`}>
            <div></div>
            {visibleColumns.map((key) => (
              <div key={key}>{key}</div>
            ))}
          </div>
          {filteredList.map((row, index) => (
               <div
                 className={`db-list-row db-list-click tm-db-row${hasRecallColumn ? ' tm-db-row-recall' : ''}${isAvailableNow(row) ? ' tm-available-row' : ''}${getRecallUrgency(row) === 'hour' ? ' tm-recall-hour' : ''}${getRecallUrgency(row) === 'due' ? ' tm-recall-due' : ''}${getRecallUrgency(row) === 'soon' ? ' tm-recall-soon' : ''}`}
                 key={index}
                 onClick={() => openModal(row)}
               >
              <div className="tm-available-cell">
                {isAvailableNow(row) ? (
                  <span className="tm-available-badge">상담가능</span>
                ) : (
                  <span>{row['상담가능시간'] || '-'}</span>
                )}
              </div>
              {visibleColumns.map((key) => {
                const cell =
                  key === '연락처'
                    ? formatPhone(row[key])
                    : key === '배정날짜'
                      ? formatUtcAsKstDateTime(getAssignedDateValue(row))
                    : key === '리콜_예정일시'
                      ? formatDateTime(row[key])
                    : key === '인입날짜' || key === '배정날짜' || key === '예약_내원일시'
                      ? formatDateTime(row[key])
                      : row[key] ?? '-'
                return (
                  <div
                    key={key}
                    className={[
                      key === '최근메모내용' ? 'db-list-cell-memo' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {cell}
                  </div>
                )
              })}
            </div>
            ))}
          </div>
          <div className="db-list-mobile-cards">
            {filteredList.map((row, index) => (
              <button
                type="button"
                key={`m-${index}`}
                className={`db-mobile-card${isAvailableNow(row) ? ' is-available' : ''}`}
                onClick={() => openModal(row)}
              >
                <div className="db-mobile-card-head">
                  <strong>{row['이름'] || '-'}</strong>
                  <span>{row['상태'] || '-'}</span>
                </div>
                <div className="db-mobile-card-line">연락처: {formatPhone(row['연락처'])}</div>
                <div className="db-mobile-card-line">이벤트: {row['이벤트'] || '-'}</div>
                <div className="db-mobile-card-line">상담가능: {row['상담가능시간'] || '-'}</div>
                {assignedTodayOnly ? (
                  <div className="db-mobile-card-line">배정: {formatUtcAsKstDateTime(getAssignedDateValue(row))}</div>
                ) : (
                  <div className="db-mobile-card-line">인입: {formatDateTime(row['인입날짜'])}</div>
                )}
                <div className="db-mobile-card-line db-mobile-card-memo">
                  메모: {row['최근메모내용'] || '-'}
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
              {phoneEvents.length > 0 ? (
                <div className="tm-lead-summary-card">
                  <div className="tm-lead-summary-label">이전 신청 이벤트</div>
                  <div className="tm-lead-summary-value">{phoneEvents.join(', ')}</div>
                </div>
              ) : null}
            </div>

            <div className="tm-lead-body">
              <div className="tm-lead-left">
                <div className="tm-lead-memos">
                  <div className="tm-lead-memos-title">최근 메모</div>
                  {memoLoading ? (
                    <div className="tm-lead-memos-empty">메모 불러오는 중...</div>
                  ) : memos.length === 0 ? (
                    <div className="tm-lead-memos-empty">메모가 없습니다.</div>
                  ) : (
                    <div className="tm-lead-memos-list">
                      {memos.map((memo, idx) => (
                        <div key={idx} className="tm-lead-memo">
                          <div className="tm-lead-memo-time">{formatMemoDateTime(memo.memo_time)}</div>
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
                          {String(editingMemoId) === String(memo.id) ? (
                            <div className="tm-lead-memo-edit">
                              <textarea
                                value={editingMemoContent}
                                onChange={(e) => setEditingMemoContent(e.target.value)}
                                rows="3"
                              />
                              <div className="tm-lead-memo-edit-actions">
                                <button type="button" onClick={cancelEditMemo} disabled={editingMemoSaving}>
                                  취소
                                </button>
                                <button type="button" onClick={submitEditMemo} disabled={editingMemoSaving}>
                                  {editingMemoSaving ? '저장 중...' : '저장'}
                                </button>
                              </div>
                            </div>
                          ) : (
                          <div className="tm-lead-memo-content">{parseMemoStatusMeta(memo).body || memo.memo_content}</div>
                          )}
                          {memo.tm_id ? (
                            <div className="tm-lead-memo-time">
                              작성 TM: {memo.tm_name || memo.tm_id}
                            </div>
                          ) : null}
                          {memo.id && memo.tm_id && String(memo.tm_id) === String(user?.id) && String(editingMemoId) !== String(memo.id) ? (
                            <div className="tm-lead-memo-row-actions">
                              <button
                                type="button"
                                className="tm-lead-memo-edit-trigger"
                                onClick={() => startEditMemo(memo)}
                              >
                                메모수정
                              </button>
                              <button
                                type="button"
                                className="tm-lead-memo-edit-trigger is-danger"
                                onClick={() => handleDeleteMemo(memo.id)}
                              >
                                메모삭제
                              </button>
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
                  <div className="tm-lead-counts">
                    <div className="tm-lead-count-card">
                      <div className="tm-lead-count-label">콜횟수</div>
                      <div className="tm-lead-count-value">{activeLead['콜횟수'] ?? 0}</div>
                    </div>
                    <div className="tm-lead-count-card">
                      <div className="tm-lead-count-label">부재중</div>
                      <div className="tm-lead-count-value">{activeLead['부재중_횟수'] ?? 0}</div>
                    </div>
                    <div className="tm-lead-count-card">
                      <div className="tm-lead-count-label">예약부도</div>
                      <div className="tm-lead-count-value">{activeLead['예약부도_횟수'] ?? 0}</div>
                    </div>
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

                  {form.status === '리콜대기' ? (
                    <div className="tm-lead-recall">
                      <div className="tm-lead-reservation">
                        <label>
                          리콜 날짜
                          <input
                            type="date"
                            value={form.recallDate}
                            onChange={(e) => {
                              const nextDate = e.target.value
                              applyRecallDateTime(nextDate, form.recallTime)
                            }}
                          />
                        </label>
                        <label>
                          리콜 시간
                          <select
                            value={form.recallTime}
                            onChange={(e) => {
                              const nextTime = e.target.value
                              applyRecallDateTime(form.recallDate, nextTime)
                            }}
                          >
                            <option value="">시간 선택</option>
                            {timeOptions.map((time) => (
                              <option key={time} value={time}>{time}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="tm-lead-recall-quick">
                        <label className="tm-lead-recall-after">
                          <select
                            value={form.recallHours}
                            onChange={(e) => {
                              const selected = e.target.value
                              applyRecallAfterHours(selected)
                            }}
                          >
                            {recallHourOptions.map((hour) => (
                              <option key={hour} value={hour}>{hour}</option>
                            ))}
                          </select>
                          <span>시간 후</span>
                        </label>
                        <button type="button" onClick={clearRecallSchedule}>일정 미설정</button>
                      </div>
                      <div className="tm-lead-recall-preview">
                        설정된 리콜시간: {form.recallAt ? formatDateTime(form.recallAt) : '-'}
                      </div>
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

                {renderLeadActionButtons('tm-lead-actions-mobile')}
              </div>
            </div>
            {renderLeadActionButtons('tm-lead-actions-desktop')}
          </div>
        </div>
      ) : null}
    </div>
  )
}
