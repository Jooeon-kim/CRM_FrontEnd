import { useEffect, useMemo, useState } from 'react'
import api from '../apiClient'

const METRIC_META = {
  MISSED: { key: 'missed_count', label: '\uBD80\uC7AC\uC911' },
  RESERVED: { key: 'reserved_count', label: '\uC608\uC57D\uC644\uB8CC' },
  VISIT_TODAY: { key: 'visit_today_count', label: '\uB2F9\uC77C\uB0B4\uC6D0' },
  VISIT_NEXTDAY: { key: 'visit_nextday_count', label: '\uC775\uC77C\uB0B4\uC6D0' },
}

const toDateKey = (value) => {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
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
  if (digits.startsWith('82')) digits = `0${digits.slice(2)}`
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return String(value)
}

export default function AdminDailyReport() {
  const [date, setDate] = useState(toDateKey())
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)
  const [detailRows, setDetailRows] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const res = await api.get('/admin/reports/daily', { params: { date } })
        setReports(res.data?.reports || [])
      } catch (err) {
        setError('\uB9C8\uAC10\uBCF4\uACE0\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')
        setReports([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [date])

  const totalSummary = useMemo(() => {
    return reports.reduce(
      (acc, row) => ({
        total_call_count: acc.total_call_count + Number(row.total_call_count || 0),
        missed_count: acc.missed_count + Number(row.missed_count || 0),
        reserved_count: acc.reserved_count + Number(row.reserved_count || 0),
        visit_today_count: acc.visit_today_count + Number(row.visit_today_count || 0),
        visit_nextday_count: acc.visit_nextday_count + Number(row.visit_nextday_count || 0),
      }),
      {
        total_call_count: 0,
        missed_count: 0,
        reserved_count: 0,
        visit_today_count: 0,
        visit_nextday_count: 0,
      }
    )
  }, [reports])

  const openDetail = async (report, metricType) => {
    try {
      setDetailLoading(true)
      setDetailRows([])
      setDetail({
        reportId: report.id,
        metricType,
        label: METRIC_META[metricType]?.label || metricType,
        tmName: report.tm_name || '-',
      })
      const res = await api.get(`/admin/reports/${report.id}/leads`, {
        params: { metric: metricType },
      })
      setDetailRows(res.data?.leads || [])
    } catch (err) {
      setDetailRows([])
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div className="db-list">
      <div className="db-list-header">
        <div>
          <h1>{'TM \uB9C8\uAC10\uBCF4\uACE0'}</h1>
          <span className="db-list-count">{`${reports.length}\uBA85 \uC81C\uCD9C`}</span>
        </div>
        <div className="db-list-actions">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="admin-home-grid">
        <div className="admin-home-card">
          <div className="admin-home-card-title">{'\uC804\uCCB4 \uCF5C \uD69F\uC218'}</div>
          <div className="admin-home-card-value">{totalSummary.total_call_count}</div>
        </div>
        <div className="admin-home-card">
          <div className="admin-home-card-title">{'\uBD80\uC7AC\uC911'}</div>
          <div className="admin-home-card-value">{totalSummary.missed_count}</div>
        </div>
        <div className="admin-home-card">
          <div className="admin-home-card-title">{'\uC608\uC57D\uC644\uB8CC'}</div>
          <div className="admin-home-card-value">{totalSummary.reserved_count}</div>
        </div>
        <div className="admin-home-card">
          <div className="admin-home-card-title">{'\uB2F9\uC77C\uB0B4\uC6D0'}</div>
          <div className="admin-home-card-value">{totalSummary.visit_today_count}</div>
        </div>
        <div className="admin-home-card">
          <div className="admin-home-card-title">{'\uC775\uC77C\uB0B4\uC6D0'}</div>
          <div className="admin-home-card-value">{totalSummary.visit_nextday_count}</div>
        </div>
      </div>

      {error ? <div className="db-list-error">{error}</div> : null}
      {loading ? <div className="db-list-empty">{'\uBD88\uB7EC\uC624\uB294 \uC911...'}</div> : null}

      {!loading && reports.length === 0 ? (
        <div className="db-list-empty">{'\uC120\uD0DD\uD55C \uB0A0\uC9DC\uC758 \uB9C8\uAC10\uBCF4\uACE0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.'}</div>
      ) : null}

      {!loading && reports.length > 0 ? (
        <div className="db-list-table">
          <div className="db-list-row db-list-head">
            <div>TM</div>
            <div>{'\uC804\uCCB4 \uCF5C'}</div>
            <div>{'\uBD80\uC7AC\uC911'}</div>
            <div>{'\uC608\uC57D\uC644\uB8CC'}</div>
            <div>{'\uB2F9\uC77C\uB0B4\uC6D0'}</div>
            <div>{'\uC775\uC77C\uB0B4\uC6D0'}</div>
            <div>{'\uC81C\uCD9C\uC2DC\uAC04'}</div>
          </div>
          {reports.map((row) => (
            <div className="db-list-row" key={row.id}>
              <div>{row.tm_name || '-'}</div>
              <div>{row.total_call_count || 0}</div>
              <div>
                <button
                  type="button"
                  className="admin-home-tm-edit"
                  disabled={!row.missed_count}
                  onClick={() => openDetail(row, 'MISSED')}
                >
                  {row.missed_count || 0}
                </button>
              </div>
              <div>
                <button
                  type="button"
                  className="admin-home-tm-edit"
                  disabled={!row.reserved_count}
                  onClick={() => openDetail(row, 'RESERVED')}
                >
                  {row.reserved_count || 0}
                </button>
              </div>
              <div>
                <button
                  type="button"
                  className="admin-home-tm-edit"
                  disabled={!row.visit_today_count}
                  onClick={() => openDetail(row, 'VISIT_TODAY')}
                >
                  {row.visit_today_count || 0}
                </button>
              </div>
              <div>
                <button
                  type="button"
                  className="admin-home-tm-edit"
                  disabled={!row.visit_nextday_count}
                  onClick={() => openDetail(row, 'VISIT_NEXTDAY')}
                >
                  {row.visit_nextday_count || 0}
                </button>
              </div>
              <div>{formatDateTime(row.submitted_at)}</div>
            </div>
          ))}
        </div>
      ) : null}

      {detail ? (
        <div className="db-list">
          <div className="db-list-header">
            <div>
              <h1>
                {detail.tmName} - {detail.label}
              </h1>
              <span className="db-list-count">{`${detailRows.length}\uAC74`}</span>
            </div>
            <div className="db-list-actions">
              <button type="button" className="db-list-export" onClick={() => setDetail(null)}>
                {'\uB2EB\uAE30'}
              </button>
            </div>
          </div>

          {detailLoading ? <div className="db-list-empty">{'\uC0C1\uC138 \uBD88\uB7EC\uC624\uB294 \uC911...'}</div> : null}
          {!detailLoading && detailRows.length === 0 ? (
            <div className="db-list-empty">{'\uD45C\uC2DC\uD560 \uACE0\uAC1D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.'}</div>
          ) : null}

          {!detailLoading && detailRows.length > 0 ? (
            <div className="db-list-table">
              <div className="db-list-row db-list-head">
                <div>{'\uACE0\uAC1D\uBA85'}</div>
                <div>{'\uC5F0\uB77D\uCC98'}</div>
                <div>{'\uC0C1\uD0DC'}</div>
                <div>{'\uC608\uC57D\uC77C\uC2DC'}</div>
                <div>{'\uCD5C\uADFC\uBA54\uBAA8'}</div>
              </div>
              {detailRows.map((row) => (
                <div className="db-list-row" key={row.id}>
                  <div>{row.name_snapshot || '-'}</div>
                  <div>{formatPhone(row.phone_snapshot)}</div>
                  <div>{row.status_snapshot || '-'}</div>
                  <div>{formatDateTime(row.reservation_at_snapshot)}</div>
                  <div>{row.memo_snapshot || '-'}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
