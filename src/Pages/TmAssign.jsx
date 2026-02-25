import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import api from '../apiClient'
import { setAdminDataset } from '../store/mainSlice'

export default function TmAssign() {
  const dispatch = useDispatch()
  const tmLeadsCache = useSelector((state) => state.main.adminDatasets?.tmLeads)
  const agentsCache = useSelector((state) => state.main.adminDatasets?.agents)

  const [leads, setLeads] = useState([])
  const [agents, setAgents] = useState([])
  const [summaryRows, setSummaryRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortMode, setSortMode] = useState('event')
  const [selectedLeadIds, setSelectedLeadIds] = useState([])
  const [batchAssigning, setBatchAssigning] = useState(false)

  const [showAutoAssign, setShowAutoAssign] = useState(false)
  const [selectedTms, setSelectedTms] = useState([])
  const [autoAssigning, setAutoAssigning] = useState(false)
  const [autoPreviewOpen, setAutoPreviewOpen] = useState(false)
  const [activePreviewTm, setActivePreviewTm] = useState(null)

  const formatPhone = (value) => {
    if (!value) return ''
    const digits = String(value).replace(/\D/g, '')
    if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
    return value
  }

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

  const fetchSummary = async () => {
    const summaryRes = await api.get('/tm/assign/summary')
    setSummaryRows(summaryRes.data?.rows || [])
  }

  useEffect(() => {
    const CACHE_TTL_MS = 2 * 60 * 1000

    const load = async ({ force = false } = {}) => {
      const now = Date.now()
      const cachedLeads = Array.isArray(tmLeadsCache?.rows) ? tmLeadsCache.rows : []
      const cachedAgents = Array.isArray(agentsCache?.rows) ? agentsCache.rows : []
      const leadsFresh = now - Number(tmLeadsCache?.fetchedAt || 0) < CACHE_TTL_MS
      const agentsFresh = now - Number(agentsCache?.fetchedAt || 0) < CACHE_TTL_MS
      const hasCache = cachedLeads.length > 0 && cachedAgents.length > 0

      if (!force && hasCache) {
        setLeads(cachedLeads)
        setAgents(cachedAgents)
        setLoading(false)
        await fetchSummary()
        if (leadsFresh && agentsFresh) return
      }

      try {
        if (!hasCache || force) setLoading(true)
        try {
          await api.post('/admin/sync-meta-leads')
        } catch (e) {
          // sync 실패해도 목록 조회는 진행
        }

        const [leadsRes, agentsRes] = await Promise.all([
          api.get('/tm/leads'),
          api.get('/tm/agents'),
        ])

        const nextLeads = leadsRes.data?.leads || []
        const nextAgents = (agentsRes.data || []).filter((row) => !Number(row?.isAdmin))
        setLeads(nextLeads)
        setAgents(nextAgents)
        dispatch(setAdminDataset({ key: 'tmLeads', rows: nextLeads, fetchedAt: Date.now() }))
        dispatch(setAdminDataset({ key: 'agents', rows: nextAgents, fetchedAt: Date.now() }))
        await fetchSummary()
        setError('')
      } catch (err) {
        setError('데이터를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const updateSummaryLocal = (tmId, delta) => {
    const now = new Date()
    const kstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    setSummaryRows((prev) =>
      prev.map((row) => {
        if (String(row.tmId) !== String(tmId)) return row
        return {
          ...row,
          totalCount: Math.max(0, Number(row.totalCount || 0) + delta),
          todayCount: Math.max(0, Number(row.todayCount || 0) + (kstDay ? delta : 0)),
        }
      })
    )
  }

  const handleAssignSelectedToTm = async (tmId) => {
    if (selectedLeadIds.length === 0 || batchAssigning || autoAssigning) return
    try {
      setBatchAssigning(true)
      const targetTmId = Number(tmId)
      const leadIds = selectedLeadIds.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0)
      if (leadIds.length === 0) return

      const res = await api.post('/admin/leads/reassign-bulk', {
        leadIds,
        tmId: targetTmId,
      })
      const updated = Number(res.data?.updated || leadIds.length)

      setLeads((prev) => {
        const next = prev.filter((lead) => !leadIds.includes(Number(lead.id)))
        dispatch(setAdminDataset({ key: 'tmLeads', rows: next, fetchedAt: Date.now() }))
        return next
      })
      setSelectedLeadIds([])
      updateSummaryLocal(targetTmId, updated)
      setError('')
    } catch (err) {
      setError('일괄 TM 배정에 실패했습니다.')
    } finally {
      setBatchAssigning(false)
    }
  }

  const toggleTm = (tmId) => {
    const normalized = String(tmId)
    setSelectedTms((prev) =>
      prev.includes(normalized)
        ? prev.filter((id) => id !== normalized)
        : [...prev, normalized]
    )
  }

  const toggleLead = (leadId) => {
    const key = String(leadId)
    setSelectedLeadIds((prev) =>
      prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key]
    )
  }

  const toggleAllVisible = () => {
    const visibleIds = sortedLeads.map((lead) => String(lead.id))
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedLeadIds.includes(id))
    if (allSelected) {
      setSelectedLeadIds((prev) => prev.filter((id) => !visibleIds.includes(id)))
    } else {
      setSelectedLeadIds((prev) => Array.from(new Set([...prev, ...visibleIds])))
    }
  }

  const buildAutoPlan = () => {
    if (selectedTms.length === 0) return []
    if (sortedLeads.length === 0) return []
    const plan = selectedTms.map((tmId) => ({ tmId, leads: [] }))
    let index = 0
    for (const lead of sortedLeads) {
      const slot = plan[index % plan.length]
      slot.leads.push(lead)
      index += 1
    }
    return plan
  }

  const plan = buildAutoPlan()
  const totalPlanned = plan.reduce((sum, item) => sum + item.leads.length, 0)

  const handleAutoAssign = async () => {
    if (plan.length === 0) return
    try {
      setAutoAssigning(true)
      const assignedIds = []
      const summaryDelta = new Map()

      for (const item of plan) {
        const ids = item.leads.map((lead) => Number(lead.id)).filter((v) => Number.isInteger(v) && v > 0)
        if (ids.length === 0) continue
        const res = await api.post('/admin/leads/reassign-bulk', {
          leadIds: ids,
          tmId: Number(item.tmId),
        })
        const updated = Number(res.data?.updated || ids.length)
        ids.forEach((id) => assignedIds.push(id))
        summaryDelta.set(String(item.tmId), (summaryDelta.get(String(item.tmId)) || 0) + updated)
      }

      setLeads((prev) => {
        const next = prev.filter((lead) => !assignedIds.includes(Number(lead.id)))
        dispatch(setAdminDataset({ key: 'tmLeads', rows: next, fetchedAt: Date.now() }))
        return next
      })
      summaryDelta.forEach((delta, tmId) => updateSummaryLocal(tmId, delta))
      setSelectedLeadIds([])
      setAutoPreviewOpen(false)
      setActivePreviewTm(null)
      setError('')
    } catch (err) {
      setError('자동 배정에 실패했습니다.')
    } finally {
      setAutoAssigning(false)
    }
  }

  const sortedLeads = useMemo(() => {
    const rows = [...leads]
    if (sortMode === 'inbound') {
      rows.sort((a, b) => {
        const aTime = new Date(a.inboundDate || 0).getTime()
        const bTime = new Date(b.inboundDate || 0).getTime()
        if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0
        return bTime - aTime
      })
      return rows
    }
    rows.sort((a, b) => {
      const aEvent = String(a.event || '').trim()
      const bEvent = String(b.event || '').trim()
      if (aEvent !== bEvent) return aEvent.localeCompare(bEvent, 'ko')
      const aTime = new Date(a.inboundDate || 0).getTime()
      const bTime = new Date(b.inboundDate || 0).getTime()
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0
      return bTime - aTime
    })
    return rows
  }, [leads, sortMode])

  const allVisibleSelected =
    sortedLeads.length > 0 && sortedLeads.every((lead) => selectedLeadIds.includes(String(lead.id)))

  if (loading) {
    return <div className="tm-assign">불러오는 중...</div>
  }

  return (
    <div className="tm-assign">
      <div className="tm-assign-controls tm-assign-controls-topline">
        <div className="tm-assign-filter">
          <label htmlFor="tm-sort">정렬 방식</label>
          <select
            id="tm-sort"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value)}
          >
            <option value="event">이벤트</option>
            <option value="inbound">인입시간</option>
          </select>
        </div>
        <button
          className="tm-assign-auto-button"
          type="button"
          onClick={() => setShowAutoAssign((prev) => !prev)}
        >
          자동 TM배정
        </button>
        <div className="tm-assign-count">
          대기 {sortedLeads.length}건 / 선택 {selectedLeadIds.length}건
        </div>
      </div>

      {showAutoAssign ? (
        <div className="tm-assign-auto">
          <div className="tm-assign-auto-title">자동 TM 배정</div>
          <div className="tm-assign-auto-body">
            <div className="tm-assign-auto-list">
              {agents.map((agent) => (
                <label key={agent.id} className="tm-assign-auto-item">
                  <input
                    type="checkbox"
                    checked={selectedTms.includes(String(agent.id))}
                    onChange={() => toggleTm(agent.id)}
                  />
                  <span>{agent.name}</span>
                </label>
              ))}
            </div>
            <button
              className="tm-assign-auto-button"
              type="button"
              onClick={() => {
                if (plan.length === 0) return
                setAutoPreviewOpen(true)
              }}
              disabled={autoAssigning || selectedTms.length === 0}
            >
              {autoAssigning ? '배정 중...' : '균등 자동 배정'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="tm-assign-summary-grid">
        {summaryRows.map((row) => (
          <button
            key={String(row.tmId)}
            type="button"
            className={`tm-assign-summary-card${selectedLeadIds.length > 0 ? ' assignable' : ''}`}
            onClick={() => handleAssignSelectedToTm(row.tmId)}
            disabled={batchAssigning || autoAssigning || selectedLeadIds.length === 0}
            title={selectedLeadIds.length > 0 ? `${row.name}에게 선택건 배정` : '먼저 DB를 선택하세요'}
          >
            <div className="tm-assign-summary-name">{row.name}</div>
            <div className="tm-assign-summary-meta">전체: {Number(row.totalCount || 0)}건</div>
            <div className="tm-assign-summary-meta">오늘: {Number(row.todayCount || 0)}건</div>
          </button>
        ))}
      </div>

      {error ? <div className="tm-assign-error">{error}</div> : null}

      <div className="tm-assign-table">
        <div className="tm-assign-row tm-assign-head">
          <div>
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              disabled={sortedLeads.length === 0}
            />
          </div>
          <div>인입시간</div>
          <div>이름</div>
          <div>연락처</div>
          <div>상담가능시간</div>
          <div>이벤트</div>
          <div>중복체크</div>
        </div>
        {sortedLeads.length === 0 ? (
          <div className="tm-assign-empty">배정할 인입이 없습니다.</div>
        ) : (
          sortedLeads.map((lead) => (
            <div className="tm-assign-row" key={lead.id}>
              <div>
                <input
                  type="checkbox"
                  checked={selectedLeadIds.includes(String(lead.id))}
                  onChange={() => toggleLead(lead.id)}
                />
              </div>
              <div>{lead.inboundDate ? formatDateTime(lead.inboundDate) : '-'}</div>
              <div>{lead.name || '-'}</div>
              <div>{lead.phone ? formatPhone(lead.phone) : '-'}</div>
              <div>{lead.availableTime || '-'}</div>
              <div>{lead.event || '-'}</div>
              <div className="tm-assign-dup-cell">
                {lead.duplicateMemoContent
                  ? `${lead.duplicateMemoTmName || 'TM'}: ${lead.duplicateMemoContent}`
                  : '-'}
              </div>
            </div>
          ))
        )}
      </div>

      {autoPreviewOpen ? (
        <div className="tm-assign-modal">
          <div className="tm-assign-modal-backdrop" onClick={() => setAutoPreviewOpen(false)} />
          <div className="tm-assign-modal-card">
            <div className="tm-assign-modal-header">
              <div>
                <h2>균등 자동 배정 확인</h2>
                <p>선택한 TM에게 {totalPlanned}건을 균등 배정합니다.</p>
              </div>
              <button
                className="tm-assign-modal-close"
                type="button"
                onClick={() => setAutoPreviewOpen(false)}
              >
                닫기
              </button>
            </div>

            <div className="tm-assign-modal-body">
              <div className="tm-assign-modal-summary">
                {plan.map((item) => {
                  const tmName =
                    agents.find((agent) => String(agent.id) === String(item.tmId))?.name || 'TM'
                  return (
                    <button
                      key={item.tmId}
                      className={`tm-assign-summary-item${activePreviewTm === item.tmId ? ' active' : ''}`}
                      type="button"
                      onClick={() =>
                        setActivePreviewTm(activePreviewTm === item.tmId ? null : item.tmId)
                      }
                    >
                      <span>{tmName}</span>
                      <strong>{item.leads.length}건</strong>
                    </button>
                  )
                })}
              </div>

              {activePreviewTm ? (
                <div className="tm-assign-modal-list">
                  {(plan.find((item) => item.tmId === activePreviewTm)?.leads || []).map((lead) => (
                    <div className="tm-assign-modal-row" key={lead.id}>
                      <span>{lead.inboundDate ? formatDateTime(lead.inboundDate) : '-'}</span>
                      <span>{lead.name || '-'}</span>
                      <span>{lead.phone ? formatPhone(lead.phone) : '-'}</span>
                      <span>{lead.event || '-'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="tm-assign-modal-empty">TM을 선택하면 배정될 DB가 표시됩니다.</div>
              )}
            </div>

            <div className="tm-assign-modal-actions">
              <button
                className="tm-assign-modal-cancel"
                type="button"
                onClick={() => setAutoPreviewOpen(false)}
              >
                취소
              </button>
              <button
                className="tm-assign-modal-confirm"
                type="button"
                onClick={handleAutoAssign}
                disabled={autoAssigning}
              >
                {autoAssigning ? '배정 중...' : '확인'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
