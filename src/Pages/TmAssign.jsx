import { useEffect, useState } from 'react'
import api from '../apiClient'

export default function TmAssign() {
  const [leads, setLeads] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [assigningId, setAssigningId] = useState(null)
  const [query, setQuery] = useState('')
  const [timeFilter, setTimeFilter] = useState('all')
  const [selectedTms, setSelectedTms] = useState([])
  const [autoAssigning, setAutoAssigning] = useState(false)
  const [autoPreviewOpen, setAutoPreviewOpen] = useState(false)
  const [activePreviewTm, setActivePreviewTm] = useState(null)
  const [downloading, setDownloading] = useState(false)

  const formatPhone = (value) => {
    if (!value) return ''
    const digits = String(value).replace(/\D/g, '')
    if (digits.length === 11) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
    }
    if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
    }
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

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const [leadsRes, agentsRes] = await Promise.all([
          api.get('/tm/leads'),
          api.get('/tm/agents'),
        ])
        setLeads(leadsRes.data?.leads || [])
        setAgents(agentsRes.data || [])
        setError('')
      } catch (err) {
        setError('데이터를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const handleAssign = async (leadId, tmId) => {
    if (!tmId) return
    try {
      setAssigningId(leadId)
      await api.post('/tm/assign', { leadId, tmId })
      setLeads((prev) => prev.filter((lead) => lead.id !== leadId))
    } catch (err) {
      setError('TM 배정에 실패했습니다.')
    } finally {
      setAssigningId(null)
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

  const handleAutoAssign = async () => {
    if (plan.length === 0) return
    try {
      setAutoAssigning(true)
      const assignedIds = []

      for (const item of plan) {
        for (const lead of item.leads) {
          await api.post('/tm/assign', { leadId: lead.id, tmId: item.tmId })
          assignedIds.push(lead.id)
        }
      }

      setLeads((prev) => prev.filter((lead) => !assignedIds.includes(lead.id)))
      setError('')
      setAutoPreviewOpen(false)
      setActivePreviewTm(null)
    } catch (err) {
      setError('자동 배정에 실패했습니다.')
    } finally {
      setAutoAssigning(false)
    }
  }

  const handleExport = async () => {
    try {
      setDownloading(true)
      const response = await api.get('/tm/leads/export', { responseType: 'blob' })
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'tm_leads.xlsx'
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

  const normalizedQuery = query.trim().toLowerCase()
  const filteredLeads = leads.filter((lead) => {
    const matchesQuery =
      !normalizedQuery ||
      (lead.name || '').toLowerCase().includes(normalizedQuery) ||
      (lead.phone || '').toLowerCase().includes(normalizedQuery) ||
      (lead.event || '').toLowerCase().includes(normalizedQuery)

    const matchesTime =
      timeFilter === 'all' || (lead.availableTime || '') === timeFilter

    return matchesQuery && matchesTime
  })

  const timeOptions = Array.from(
    new Set(leads.map((lead) => lead.availableTime).filter(Boolean))
  )

  const buildAutoPlan = () => {
    if (selectedTms.length === 0) return []
    if (filteredLeads.length === 0) return []

    const plan = selectedTms.map((tmId) => ({
      tmId,
      leads: [],
    }))

    let index = 0
    for (const lead of filteredLeads) {
      const slot = plan[index % plan.length]
      slot.leads.push(lead)
      index += 1
    }

    return plan
  }

  const plan = buildAutoPlan()
  const totalPlanned = plan.reduce((sum, item) => sum + item.leads.length, 0)

  if (loading) {
    return <div className="tm-assign">불러오는 중...</div>
  }

  return (
    <div className="tm-assign">
      <div className="tm-assign-controls">
        <div className="tm-assign-search">
          <label htmlFor="tm-search">검색</label>
          <input
            id="tm-search"
            type="text"
            placeholder="이름, 연락처, 이벤트"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="tm-assign-filter">
          <label htmlFor="tm-time">상담가능시간</label>
          <select
            id="tm-time"
            value={timeFilter}
            onChange={(event) => setTimeFilter(event.target.value)}
          >
            <option value="all">전체</option>
            {timeOptions.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </select>
        </div>
        <div className="tm-assign-header-actions">
          <button
            className="tm-assign-export"
            type="button"
            onClick={handleExport}
            disabled={downloading}
          >
            {downloading ? '다운로드 중...' : '엑셀 다운로드'}
          </button>
          <div className="tm-assign-count">대기 {filteredLeads.length}건</div>
        </div>
      </div>

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

      {error ? <div className="tm-assign-error">{error}</div> : null}

      <div className="tm-assign-table">
        <div className="tm-assign-row tm-assign-head">
          <div>인입시간</div>
          <div>이름</div>
          <div>연락처</div>
          <div>상담가능시간</div>
          <div>이벤트</div>
          <div>TM 배정</div>
        </div>
        {filteredLeads.length === 0 ? (
          <div className="tm-assign-empty">배정할 인입이 없습니다.</div>
        ) : (
          filteredLeads.map((lead) => (
            <div className="tm-assign-row" key={lead.id}>
              <div>{lead.inboundDate ? formatDateTime(lead.inboundDate) : '-'}</div>
              <div>{lead.name || '-'}</div>
              <div>{lead.phone ? formatPhone(lead.phone) : '-'}</div>
              <div>{lead.availableTime || '-'}</div>
              <div>{lead.event || '-'}</div>
              <div>
                <select
                  className="tm-assign-select"
                  value=""
                  disabled={assigningId === lead.id || autoAssigning}
                  onChange={(event) => handleAssign(lead.id, event.target.value)}
                >
                  <option value="">TM 선택</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
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
                      <span>{lead.availableTime || '-'}</span>
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
