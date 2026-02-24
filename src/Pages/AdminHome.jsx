import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import api from '../apiClient'
import { setAdminDataset } from '../store/mainSlice'

export default function AdminHome() {
  const dispatch = useDispatch()
  const dbCache = useSelector((state) => state.main.adminDatasets?.dbRows)
  const agentsCache = useSelector((state) => state.main.adminDatasets?.agents)
  const tmLeadsCache = useSelector((state) => state.main.adminDatasets?.tmLeads)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const [ruleMessage, setRuleMessage] = useState('')
  const [stats, setStats] = useState({
    total: 0,
    unassigned: 0,
    tmCount: 0,
  })
  const [rows, setRows] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [rulesLoading, setRulesLoading] = useState(true)
  const [rules, setRules] = useState([])
  const [ruleForm, setRuleForm] = useState({ name: '', keywords: '' })
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('add')
  const [formData, setFormData] = useState({ id: '', name: '', phone: '', password: '' })

  useEffect(() => {
    const CACHE_TTL_MS = 2 * 60 * 1000
    const loadRules = async () => {
      try {
        setRulesLoading(true)
        const res = await api.get('/admin/event-rules')
        setRules(res.data || [])
      } catch (err) {
        setRuleMessage('이벤트 규칙을 불러오지 못했습니다.')
      } finally {
        setRulesLoading(false)
      }
    }

    const load = async ({ force = false } = {}) => {
      const now = Date.now()
      const cachedRows = Array.isArray(dbCache?.rows) ? dbCache.rows : []
      const cachedAgents = Array.isArray(agentsCache?.rows) ? agentsCache.rows : []
      const cachedTmLeads = Array.isArray(tmLeadsCache?.rows) ? tmLeadsCache.rows : []
      const hasCache = cachedRows.length > 0 && cachedAgents.length > 0 && cachedTmLeads.length > 0
      const dbFresh = now - Number(dbCache?.fetchedAt || 0) < CACHE_TTL_MS
      const agentsFresh = now - Number(agentsCache?.fetchedAt || 0) < CACHE_TTL_MS
      const tmLeadsFresh = now - Number(tmLeadsCache?.fetchedAt || 0) < CACHE_TTL_MS

      if (!force && hasCache) {
        setRows(cachedRows)
        setAgents(cachedAgents)
        setStats({
          total: cachedRows.length || 0,
          unassigned: cachedTmLeads.length || 0,
          tmCount: cachedAgents.length || 0,
        })
        setLoading(false)
        if (dbFresh && agentsFresh && tmLeadsFresh) return
      }

      try {
        if (!hasCache || force) setLoading(true)
        try {
          await api.post('/admin/sync-meta-leads')
        } catch (syncErr) {
          // 자동 동기화 실패 시에도 화면 데이터 로드는 계속 진행
        }
        const [dbRes, unassignedRes, tmRes] = await Promise.all([
          api.get('/dbdata'),
          api.get('/tm/leads'),
          api.get('/tm/agents'),
        ])
        const dbRows = dbRes.data || []
        setStats({
          total: dbRows.length || 0,
          unassigned: unassignedRes.data?.leads?.length || 0,
          tmCount: tmRes.data?.length || 0,
        })
        setRows(dbRows)
        setAgents(tmRes.data || [])
        dispatch(setAdminDataset({ key: 'dbRows', rows: dbRows, fetchedAt: Date.now() }))
        dispatch(setAdminDataset({ key: 'tmLeads', rows: unassignedRes.data?.leads || [], fetchedAt: Date.now() }))
        dispatch(setAdminDataset({ key: 'agents', rows: tmRes.data || [], fetchedAt: Date.now() }))
      } finally {
        setLoading(false)
      }
    }

    load()
    loadRules()
  }, [])

  const handleSync = async () => {
    try {
      setSyncing(true)
      const res = await api.post('/admin/sync-meta-leads')
      setMessage(`신규 ${res.data?.inserted ?? 0}건이 추가되었습니다.`)
    } catch (err) {
      setMessage('동기화에 실패했습니다.')
    } finally {
      setSyncing(false)
    }
  }

  const openAdd = () => {
    setModalMode('add')
    setFormData({ id: '', name: '', phone: '', password: '' })
    setModalOpen(true)
  }

  const openEdit = (agent) => {
    setModalMode('edit')
    setFormData({ id: agent.id, name: agent.name || '', phone: agent.phone || '', password: '' })
    setModalOpen(true)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!formData.name || !formData.phone || (modalMode === 'add' && !formData.password)) return
    try {
      if (modalMode === 'add') {
        const res = await api.post('/tm/agents', {
          name: formData.name,
          phone: formData.phone.replace(/\D/g, ''),
          password: formData.password,
        })
        setAgents((prev) => {
          const next = [
            ...prev,
            { id: res.data?.id, name: formData.name, phone: formData.phone.replace(/\D/g, ''), isAdmin: 0 },
          ]
          dispatch(setAdminDataset({ key: 'agents', rows: next, fetchedAt: Date.now() }))
          return next
        })
      } else {
        await api.patch(`/tm/agents/${formData.id}`, {
          name: formData.name,
          phone: formData.phone.replace(/\D/g, ''),
          password: formData.password || undefined,
        })
        setAgents((prev) =>
          {
            const next = prev.map((agent) =>
              agent.id === formData.id
                ? { ...agent, name: formData.name, phone: formData.phone.replace(/\D/g, '') }
                : agent
            )
            dispatch(setAdminDataset({ key: 'agents', rows: next, fetchedAt: Date.now() }))
            return next
          }
        )
      }
      setModalOpen(false)
    } catch (err) {
      setMessage('TM 정보 저장에 실패했습니다.')
    }
  }

  const handleRuleSubmit = async (event) => {
    event.preventDefault()
    if (!ruleForm.name.trim() || !ruleForm.keywords.trim()) return
    try {
      setRuleMessage('')
      await api.post('/admin/event-rules', {
        name: ruleForm.name.trim(),
        keywords: ruleForm.keywords.trim(),
      })
      setRuleForm({ name: '', keywords: '' })
      const res = await api.get('/admin/event-rules')
      setRules(res.data || [])
    } catch (err) {
      setRuleMessage('이벤트 규칙 저장에 실패했습니다.')
    }
  }

  const handleRuleDelete = async (ruleId) => {
    if (!ruleId) return
    try {
      setRuleMessage('')
      await api.delete(`/admin/event-rules/${ruleId}`)
      setRules((prev) => prev.filter((rule) => rule.id !== ruleId))
    } catch (err) {
      setRuleMessage('이벤트 규칙 삭제에 실패했습니다.')
    }
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

  const maskPhoneInput = (value) => {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11)
    if (digits.length <= 3) return digits
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  }

  return (
    <div className="admin-home">
      <div className="admin-home-header">
        <div>
          <h1>관리자 메인</h1>
          <p>오늘 해야 할 업무와 주요 지표를 한눈에 확인하세요.</p>
        </div>
        <button
          className="admin-home-sync"
          type="button"
          onClick={handleSync}
          disabled={syncing}
        >
          {syncing ? '동기화 중...' : 'Meta → TM 동기화'}
        </button>
      </div>

      {message ? <div className="admin-home-message">{message}</div> : null}

      <div className="admin-home-grid">
        <div className="admin-home-card">
          <div className="admin-home-card-title">전체 DB</div>
          <div className="admin-home-card-value">
            {loading ? '...' : stats.total}
          </div>
          <div className="admin-home-card-sub">등록된 전체 리드</div>
        </div>
        <div className="admin-home-card">
          <div className="admin-home-card-title">미배정</div>
          <div className="admin-home-card-value">
            {loading ? '...' : stats.unassigned}
          </div>
          <div className="admin-home-card-sub">TM 배정 대기</div>
        </div>
        <div className="admin-home-card">
          <div className="admin-home-card-title">TM 인원</div>
          <div className="admin-home-card-value">
            {loading ? '...' : stats.tmCount}
          </div>
          <div className="admin-home-card-sub">현재 등록된 TM</div>
        </div>
      </div>

      <div className="admin-home-tm">
        <div className="admin-home-tm-header">
          <div className="admin-home-tm-title">TM 인원 상세</div>
          <button className="admin-home-tm-add" type="button" onClick={openAdd}>
            TM 추가
          </button>
        </div>
        {agents.length === 0 ? (
          <div className="admin-home-tm-empty">등록된 TM이 없습니다.</div>
        ) : (
          <div className="admin-home-tm-list">
            {agents
              .filter((agent) => !agent.isAdmin)
              .map((agent) => (
              <div key={agent.id} className="admin-home-tm-item">
                <div className="admin-home-tm-name">{agent.name}</div>
                <div className="admin-home-tm-phone">{formatPhone(agent.phone)}</div>
                <div className="admin-home-tm-login">
                  최근 로그인 {formatDateTime(agent.last_login_at)}
                </div>
                <button
                  className="admin-home-tm-edit"
                  type="button"
                  onClick={() => openEdit(agent)}
                >
                  정보 수정
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen ? (
        <div className="admin-home-modal">
          <div className="admin-home-modal-backdrop" onClick={() => setModalOpen(false)} />
          <div className="admin-home-modal-card">
            <h3>{modalMode === 'add' ? 'TM 추가' : 'TM 정보 수정'}</h3>
            <form className="admin-home-modal-form" onSubmit={handleSubmit}>
              <label>
                이름
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </label>
              <label>
                전화번호
                <input
                  type="text"
                  value={maskPhoneInput(formData.phone)}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                />
              </label>
              <label>
                {modalMode === 'add' ? '초기 비밀번호' : '비밀번호 변경'}
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required={modalMode === 'add'}
                  placeholder={modalMode === 'add' ? '' : '변경 시에만 입력'}
                />
              </label>
              <div className="admin-home-modal-actions">
                <button type="button" onClick={() => setModalOpen(false)}>
                  취소
                </button>
                <button type="submit">
                  저장
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="admin-home-rules">
        <div className="admin-home-rules-header">
          <div>
            <div className="admin-home-rules-title">이벤트 규칙</div>
            <p className="admin-home-rules-sub">
              키워드는 쉼표로 구분합니다. 공백은 무시되고, 모든 키워드를 포함해야 매칭됩니다.
            </p>
          </div>
          <span className="admin-home-rules-count">
            {rulesLoading ? '...' : `${rules.length}개`}
          </span>
        </div>

        {ruleMessage ? <div className="admin-home-rules-message">{ruleMessage}</div> : null}

        <form className="admin-home-rules-form" onSubmit={handleRuleSubmit}>
          <input
            type="text"
            placeholder="이벤트 이름 (예: 강남 올타이트)"
            value={ruleForm.name}
            onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
          />
          <input
            type="text"
            placeholder="키워드 (예: 강남,올타이트)"
            value={ruleForm.keywords}
            onChange={(e) => setRuleForm({ ...ruleForm, keywords: e.target.value })}
          />
          <button type="submit">규칙 추가</button>
        </form>

        {rules.length === 0 ? (
          <div className="admin-home-rules-empty">등록된 규칙이 없습니다.</div>
        ) : (
          <div className="admin-home-rules-list">
            {rules.map((rule) => (
              <div key={rule.id} className="admin-home-rules-item">
                <div>
                  <div className="admin-home-rules-name">{rule.name}</div>
                  <div className="admin-home-rules-keywords">{rule.keywords}</div>
                </div>
                <button
                  type="button"
                  className="admin-home-rules-delete"
                  onClick={() => handleRuleDelete(rule.id)}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="admin-home-charts">
        <div className="admin-home-chart">
          <div className="admin-home-chart-title">상태 분포</div>
          <div className="admin-home-bar">
            {['대기', '예약', '부재중', '리콜대기', '실패', '무효', '예약부도', '내원완료'].map((status) => {
              const count = rows.filter((row) => {
                const state = String(row['상태'] || '').trim()
                if (!state) return status === '대기'
                return state.includes(status)
              }).length
              const percent = stats.total ? Math.round((count / stats.total) * 100) : 0
              return (
                <div className="admin-home-bar-row" key={status}>
                  <span className="admin-home-bar-label">{status}</span>
                  <div className="admin-home-bar-track">
                    <div className="admin-home-bar-fill" style={{ width: `${percent}%` }} />
                  </div>
                  <span className="admin-home-bar-value">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="admin-home-chart">
          <div className="admin-home-chart-title">최근 7일 인입</div>
          <div className="admin-home-line">
            {(() => {
              const toLocalKey = (value) => {
                if (!value) return ''
                const date = new Date(value)
                if (Number.isNaN(date.getTime())) return ''
                const yyyy = date.getFullYear()
                const mm = String(date.getMonth() + 1).padStart(2, '0')
                const dd = String(date.getDate()).padStart(2, '0')
                return `${yyyy}-${mm}-${dd}`
              }
              const base = new Date()
              base.setHours(0, 0, 0, 0)
              const days = Array.from({ length: 7 }).map((_, idx) => {
                const date = new Date(base)
                date.setDate(date.getDate() - (6 - idx))
                const key = toLocalKey(date)
                const label = `${date.getMonth() + 1}/${date.getDate()}`
                return { key, label }
              })
              const counts = days.map(({ key }) =>
                rows.filter((row) => toLocalKey(row['인입날짜']) === key).length
              )
              const max = Math.max(1, ...counts)
              return (
                <>
                  <div className="admin-home-bars">
                    {counts.map((value, idx) => (
                      <div key={idx} className="admin-home-bar-col">
                        <div
                          className="admin-home-bar-col-fill"
                          style={{ height: `${(value / max) * 100}%` }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="admin-home-line-labels">
                    {days.map((day) => (
                      <span key={day.key}>{day.label}</span>
                    ))}
                  </div>
                  <div className="admin-home-line-values">
                    {counts.map((value, idx) => (
                      <span key={`count-${days[idx]?.key || idx}`}>{value}건</span>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      </div>

      <div className="admin-home-actions">
        <Link className="admin-home-action" to="/admin/tm-assign">
          TM 배정 바로가기
        </Link>
        <Link className="admin-home-action" to="/admin/tm-call">
          TM 콜 현황 보기
        </Link>
        <Link className="admin-home-action" to="/admin/daily-report">
          TM 마감보고 보기
        </Link>
        <Link className="admin-home-action" to="/admin/db-list">
          DB 목록 열기
        </Link>
      </div>
    </div>
  )
}

