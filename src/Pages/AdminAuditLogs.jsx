import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import api from '../apiClient'

const parseDateTimeLocal = (value) => {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const raw = String(value).trim()
  const plain = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (plain) {
    const d = new Date(
      Number(plain[1]),
      Number(plain[2]) - 1,
      Number(plain[3]),
      Number(plain[4]),
      Number(plain[5]),
      Number(plain[6] || '0')
    )
    return Number.isNaN(d.getTime()) ? null : d
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const formatDateTime = (value) => {
  const d = parseDateTimeLocal(value)
  if (!d) return '-'
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

const safeParse = (value) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch (_) {
    return value
  }
}

const ROLE_OPTIONS = ['all', 'ADMIN', 'TM', 'SYSTEM']

export default function AdminAuditLogs() {
  const agentsCache = useSelector((state) => state.main.adminDatasets?.agents?.rows || [])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [action, setAction] = useState('all')
  const [targetType, setTargetType] = useState('all')
  const [adminTmId, setAdminTmId] = useState('all')
  const [actorRole, setActorRole] = useState('all')
  const [limit, setLimit] = useState(100)
  const [detail, setDetail] = useState(null)

  const load = async () => {
    try {
      setLoading(true)
      const params = { limit }
      if (action !== 'all') params.action = action
      if (targetType !== 'all') params.targetType = targetType
      if (adminTmId !== 'all') params.adminTmId = adminTmId
      if (actorRole !== 'all') params.actorRole = actorRole
      const res = await api.get('/admin/audit-logs', { params })
      setRows(Array.isArray(res.data) ? res.data : [])
      setError('')
    } catch (err) {
      setError('감사로그를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [action, targetType, adminTmId, actorRole, limit])

  const actionOptions = useMemo(() => {
    const set = new Set(rows.map((row) => String(row?.action || '').trim()).filter(Boolean))
    return Array.from(set)
  }, [rows])

  const targetOptions = useMemo(() => {
    const set = new Set(rows.map((row) => String(row?.target_type || '').trim()).filter(Boolean))
    return Array.from(set)
  }, [rows])

  const tmOptions = useMemo(
    () =>
      (agentsCache || [])
        .filter((agent) => Number(agent?.isAdmin) !== 1)
        .map((agent) => ({ id: agent.id, name: agent.name })),
    [agentsCache]
  )

  return (
    <section className="audit-log-page">
      <div className="audit-log-controls">
        <label>
          역할
          <select value={actorRole} onChange={(e) => setActorRole(e.target.value)}>
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {role === 'all' ? '전체' : role}
              </option>
            ))}
          </select>
        </label>
        <label>
          액션
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="all">전체</option>
            {actionOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          대상
          <select value={targetType} onChange={(e) => setTargetType(e.target.value)}>
            <option value="all">전체</option>
            {targetOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          사용자
          <select value={adminTmId} onChange={(e) => setAdminTmId(e.target.value)}>
            <option value="all">전체</option>
            {tmOptions.map((agent) => (
              <option key={agent.id} value={String(agent.id)}>
                {agent.name} ({agent.id})
              </option>
            ))}
          </select>
        </label>
        <label>
          조회건수
          <select value={String(limit)} onChange={(e) => setLimit(Number(e.target.value) || 100)}>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="500">500</option>
          </select>
        </label>
        <button type="button" onClick={load}>새로고침</button>
      </div>

      {loading ? <div className="db-list">불러오는 중...</div> : null}
      {error ? <div className="db-error">{error}</div> : null}

      {!loading && !error ? (
        <div className="audit-log-table-wrap">
          <table className="audit-log-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>시간</th>
                <th>역할</th>
                <th>사용자</th>
                <th>액션</th>
                <th>대상</th>
                <th>대상ID</th>
                <th>IP</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{formatDateTime(row.created_at)}</td>
                  <td>{row.actor_role || '-'}</td>
                  <td>{row.admin_name || row.admin_tm_id || '-'}</td>
                  <td>{row.action || '-'}</td>
                  <td>{row.target_type || '-'}</td>
                  <td>{row.target_id || '-'}</td>
                  <td>{row.ip_address || '-'}</td>
                  <td>
                    <button
                      type="button"
                      className="audit-log-detail-btn"
                      onClick={() => setDetail(row)}
                    >
                      보기
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="audit-log-empty">조회 결과가 없습니다.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {detail ? (
        <div className="audit-log-modal">
          <div className="audit-log-modal-backdrop" onClick={() => setDetail(null)} />
          <div className="audit-log-modal-card">
            <div className="audit-log-modal-header">
              <h3>감사로그 상세 #{detail.id}</h3>
              <button type="button" onClick={() => setDetail(null)}>닫기</button>
            </div>
            <div className="audit-log-modal-meta">
              <div>시간: {formatDateTime(detail.created_at)}</div>
              <div>역할: {detail.actor_role || '-'}</div>
              <div>사용자: {detail.admin_name || detail.admin_tm_id || '-'}</div>
              <div>액션: {detail.action || '-'}</div>
              <div>대상: {detail.target_type || '-'} / {detail.target_id || '-'}</div>
            </div>
            <div className="audit-log-modal-body">
              <div>
                <h4>Before</h4>
                <pre>{JSON.stringify(safeParse(detail.before_json), null, 2)}</pre>
              </div>
              <div>
                <h4>After</h4>
                <pre>{JSON.stringify(safeParse(detail.after_json), null, 2)}</pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

