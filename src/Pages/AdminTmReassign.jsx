import { useEffect, useMemo, useState } from 'react'
import api from '../apiClient'

const normalizePhoneDigits = (value) => {
  if (!value) return ''
  let digits = String(value).replace(/\D/g, '')
  if (digits.startsWith('82')) digits = `0${digits.slice(2)}`
  return digits
}

const formatPhone = (value) => {
  if (!value) return '-'
  const digits = normalizePhoneDigits(value)
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return value
}

const formatDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

export default function AdminTmReassign() {
  const [rows, setRows] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fromTm, setFromTm] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [nameQuery, setNameQuery] = useState('')
  const [phoneQuery, setPhoneQuery] = useState('')
  const [eventQuery, setEventQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [targetTmId, setTargetTmId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const [dbRes, tmRes] = await Promise.all([
          api.get('/dbdata'),
          api.get('/tm/agents'),
        ])
        setRows(dbRes.data || [])
        setAgents((tmRes.data || []).filter((agent) => !agent.isAdmin))
        setError('')
      } catch (e) {
        setError('TM 변경 데이터를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const tmNameMap = useMemo(() => {
    const map = new Map()
    agents.forEach((a) => map.set(String(a.id), a.name))
    map.set('0', '보류')
    return map
  }, [agents])

  const assignedRows = useMemo(
    () => rows.filter((row) => row.tm !== null && row.tm !== undefined && String(row.tm) !== ''),
    [rows]
  )

  const normalizedName = nameQuery.trim().toLowerCase()
  const normalizedEvent = eventQuery.trim().toLowerCase()
  const normalizedPhone = normalizePhoneDigits(phoneQuery)

  const filteredRows = useMemo(() => {
    return assignedRows.filter((row) => {
      if (fromTm !== 'all' && String(row.tm) !== String(fromTm)) return false
      if (statusFilter !== 'all' && String(row['상태'] || '').trim() !== statusFilter) return false
      if (normalizedName && !String(row['이름'] || '').toLowerCase().includes(normalizedName)) return false
      if (normalizedEvent && !String(row['이벤트'] || '').toLowerCase().includes(normalizedEvent)) return false
      if (normalizedPhone && !normalizePhoneDigits(row['연락처']).includes(normalizedPhone)) return false
      return true
    })
  }, [assignedRows, fromTm, statusFilter, normalizedName, normalizedEvent, normalizedPhone])

  const filteredIdSet = useMemo(
    () => new Set(filteredRows.map((row) => String(row.id))),
    [filteredRows]
  )

  const selectedCountInFilter = selectedIds.filter((id) => filteredIdSet.has(String(id))).length
  const allFilteredSelected = filteredRows.length > 0 && selectedCountInFilter === filteredRows.length

  const toggleOne = (leadId) => {
    const key = String(leadId)
    setSelectedIds((prev) => (prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key]))
  }

  const toggleAllFiltered = () => {
    setSelectedIds((prev) => {
      if (allFilteredSelected) {
        return prev.filter((id) => !filteredIdSet.has(String(id)))
      }
      const next = new Set(prev.map(String))
      filteredRows.forEach((row) => next.add(String(row.id)))
      return Array.from(next)
    })
  }

  const clearSelection = () => setSelectedIds([])

  const handleBulkChange = async () => {
    if (!targetTmId || selectedIds.length === 0) return
    try {
      setSaving(true)
      await api.post('/admin/leads/reassign-bulk', {
        leadIds: selectedIds.map((id) => Number(id)),
        tmId: Number(targetTmId),
      })
      const nowIso = new Date().toISOString()
      setRows((prev) =>
        prev.map((row) =>
          selectedIds.includes(String(row.id))
            ? { ...row, tm: Number(targetTmId), 배정날짜: nowIso }
            : row
        )
      )
      setSelectedIds([])
      setError('')
    } catch (e) {
      setError('일괄 TM 변경에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const tmOptions = Array.from(
    new Set(assignedRows.map((row) => String(row.tm)).filter((v) => v !== ''))
  ).sort((a, b) => {
    if (a === '0') return -1
    if (b === '0') return 1
    return a.localeCompare(b, 'ko')
  })

  if (loading) return <div className="db-list">불러오는 중...</div>

  return (
    <div className="db-list">
      <div className="db-list-header">
        <h1>TM변경</h1>
        <div className="db-list-actions">
          <div className="db-list-count">필터 {filteredRows.length}건 / 선택 {selectedIds.length}건</div>
        </div>
      </div>

      {error ? <div className="db-list-error">{error}</div> : null}

      <div className="db-list-filters">
        <label>
          현재 TM
          <select value={fromTm} onChange={(e) => setFromTm(e.target.value)}>
            <option value="all">전체</option>
            {tmOptions.map((tmId) => (
              <option key={tmId} value={tmId}>{tmNameMap.get(tmId) || tmId}</option>
            ))}
          </select>
        </label>
        <label>
          상태
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">전체</option>
            {['대기', '부재중', '리콜대기', '예약', '실패', '무효', '예약부도', '내원완료'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          이름 검색
          <input value={nameQuery} onChange={(e) => setNameQuery(e.target.value)} placeholder="고객 이름" />
        </label>
        <label>
          연락처 검색
          <input value={phoneQuery} onChange={(e) => setPhoneQuery(e.target.value)} placeholder="숫자만 입력" />
        </label>
        <label>
          이벤트 검색
          <input value={eventQuery} onChange={(e) => setEventQuery(e.target.value)} placeholder="이벤트명" />
        </label>
      </div>

      <div className="db-list-actions" style={{ marginBottom: 12 }}>
        <button type="button" className="db-list-reset" onClick={toggleAllFiltered}>
          {allFilteredSelected ? '필터 전체 해제' : '필터 전체 선택'}
        </button>
        <button type="button" className="db-list-reset" onClick={clearSelection} disabled={selectedIds.length === 0}>
          선택 해제
        </button>
        <select value={targetTmId} onChange={(e) => setTargetTmId(e.target.value)}>
          <option value="">변경할 TM 선택</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>{agent.name}</option>
          ))}
        </select>
        <button
          type="button"
          className="db-list-export"
          disabled={!targetTmId || selectedIds.length === 0 || saving}
          onClick={handleBulkChange}
        >
          {saving ? '변경 중...' : `선택 ${selectedIds.length}건 TM변경`}
        </button>
      </div>

      <div className="db-list-table">
        <div className="db-list-row db-list-head">
          <div>선택</div>
          <div>배정날짜</div>
          <div>이름</div>
          <div>연락처</div>
          <div>이벤트</div>
          <div>현재 TM</div>
          <div>상태</div>
        </div>
        {filteredRows.length === 0 ? (
          <div className="db-list-empty">조건에 맞는 데이터가 없습니다.</div>
        ) : (
          filteredRows.map((row) => {
            const checked = selectedIds.includes(String(row.id))
            return (
              <div key={row.id} className="db-list-row">
                <div>
                  <input type="checkbox" checked={checked} onChange={() => toggleOne(row.id)} />
                </div>
                <div>{formatDateTime(row['배정날짜'])}</div>
                <div>{row['이름'] || '-'}</div>
                <div>{formatPhone(row['연락처'])}</div>
                <div>{row['이벤트'] || '-'}</div>
                <div>{tmNameMap.get(String(row.tm)) || row.tm || '-'}</div>
                <div>{row['상태'] || '대기'}</div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

