import { useEffect, useMemo, useState } from 'react'
import api from '../apiClient'

const DAY_LABELS = ['\uC77C', '\uC6D4', '\uD654', '\uC218', '\uBAA9', '\uAE08', '\uD1A0']

const metricLabels = {
  MISSED: '\uBD80\uC7AC\uC911',
  FAILED: '\uC2E4\uD328',
  RESERVED: '\uB2F9\uC77C \uC608\uC57D',
  VISIT_TODAY: '\uB2F9\uC77C \uB0B4\uC6D0',
  VISIT_NEXTDAY: '\uC775\uC77C \uB0B4\uC6D0',
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

const formatReportTitle = (dateKey, tmName) => {
  const raw = String(dateKey || '').trim()
  const datePartMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (datePartMatch) {
    const year = Number(datePartMatch[1])
    const month = Number(datePartMatch[2]) - 1
    const day = Number(datePartMatch[3])
    const date = new Date(year, month, day)
    return `${date.getMonth() + 1}\uC6D4 ${date.getDate()}\uC77C (${DAY_LABELS[date.getDay()]}\uC694\uC77C) (${tmName || '-'}) \uB9C8\uAC10\uBCF4\uACE0`
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return `(${tmName || '-'}) \uB9C8\uAC10\uBCF4\uACE0`
  return `${parsed.getMonth() + 1}\uC6D4 ${parsed.getDate()}\uC77C (${DAY_LABELS[parsed.getDay()]}\uC694\uC77C) (${tmName || '-'}) \uB9C8\uAC10\uBCF4\uACE0`
}

const countOf = (row, manualKey, autoKey) => row?.[manualKey] ?? row?.[autoKey] ?? 0

export default function AdminDailyReport() {
  const [date, setDate] = useState(toDateKey())
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalData, setModalData] = useState(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const res = await api.get('/admin/reports/daily', { params: { date } })
        setReports(res.data?.reports || [])
      } catch (err) {
        setError('\uB9C8\uAC10\uBCF4\uACE0\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [date])

  const summary = useMemo(() => {
    return reports.reduce(
      (acc, row) => ({
        total: acc.total + Number(countOf(row, 'manual_call_count', 'total_call_count') || 0),
        failed: acc.failed + Number(countOf(row, 'manual_failed_count', 'failed_count') || 0),
        reserved: acc.reserved + Number(countOf(row, 'manual_reserved_count', 'reserved_count') || 0),
        visitToday: acc.visitToday + Number(countOf(row, 'manual_visit_today_count', 'visit_today_count') || 0),
        visitNextday: acc.visitNextday + Number(countOf(row, 'manual_visit_nextday_count', 'visit_nextday_count') || 0),
        done: acc.done + (row.is_submitted ? 1 : 0),
      }),
      { total: 0, failed: 0, reserved: 0, visitToday: 0, visitNextday: 0, done: 0 }
    )
  }, [reports])

  const fetchLeadsFallback = async (reportId) => {
    const metrics = ['MISSED', 'FAILED', 'RESERVED', 'VISIT_TODAY', 'VISIT_NEXTDAY']
    const results = await Promise.all(
      metrics.map((metric) =>
        api
          .get(`/admin/reports/${reportId}/leads`, { params: { metric } })
          .then((res) => [metric, res.data?.leads || []])
      )
    )
    return results.reduce(
      (acc, [metric, rows]) => {
        acc[metric] = rows
        return acc
      },
      { MISSED: [], FAILED: [], RESERVED: [], VISIT_TODAY: [], VISIT_NEXTDAY: [] }
    )
  }

  const openModal = async (row) => {
    try {
      const res = await api.get(`/admin/reports/${row.id}/full`)
      setModalData(res.data || null)
    } catch (err) {
      try {
        const leads = await fetchLeadsFallback(row.id)
        setModalData({ report: row, leads })
      } catch {
        setError('\uB9C8\uAC10\uBCF4\uACE0 \uC0C1\uC138\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')
      }
    }
  }

  return (
    <div className="db-list daily-report-page">
      <div className="db-list-header">
        <div>
          <h1>{'TM \uB9C8\uAC10\uBCF4\uACE0'}</h1>
          <span className="db-list-count">{`${reports.length}\uAC74`}</span>
        </div>
        <div className="db-list-actions">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="admin-home-grid">
        <div className="admin-home-card">
          <div className="admin-home-card-title">{'\uCD1D \uC81C\uCD9C'}</div>
          <div className="admin-home-card-value">{summary.done}</div>
        </div>
        <div className="admin-home-card">
          <div className="admin-home-card-title">{'\uC2E4\uD328'}</div>
          <div className="admin-home-card-value">{summary.failed}</div>
        </div>
        <div className="admin-home-card">
          <div className="admin-home-card-title">{'\uB2F9\uC77C \uC608\uC57D'}</div>
          <div className="admin-home-card-value">{summary.reserved}</div>
        </div>
        <div className="admin-home-card">
          <div className="admin-home-card-title">{'\uB2F9\uC77C \uB0B4\uC6D0'}</div>
          <div className="admin-home-card-value">{summary.visitToday}</div>
        </div>
        <div className="admin-home-card">
          <div className="admin-home-card-title">{'\uC775\uC77C \uB0B4\uC6D0'}</div>
          <div className="admin-home-card-value">{summary.visitNextday}</div>
        </div>
        <div className="admin-home-card">
          <div className="admin-home-card-title">{'\uB2F9\uC77C \uCF5C'}</div>
          <div className="admin-home-card-value">{summary.total}</div>
        </div>
      </div>

      {error ? <div className="db-list-error">{error}</div> : null}
      {loading ? <div className="db-list-empty">{'\uBD88\uB7EC\uC624\uB294 \uC911...'}</div> : null}

      {!loading && reports.length === 0 ? (
        <div className="db-list-empty">{'\uC120\uD0DD\uD55C \uB0A0\uC9DC\uC758 \uB9C8\uAC10\uBCF4\uACE0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.'}</div>
      ) : null}

      {!loading && reports.length > 0 ? (
        <div className="db-list-table">
          <div className="db-list-row db-list-head daily-report-row-admin">
            <div>TM</div>
            <div>{'\uC0C1\uD0DC'}</div>
            <div>{'\uC2E4\uD328'}</div>
            <div>{'\uB2F9\uC77C \uC608\uC57D'}</div>
            <div>{'\uB2F9\uC77C \uB0B4\uC6D0'}</div>
            <div>{'\uC775\uC77C \uB0B4\uC6D0'}</div>
            <div>{'\uB2F9\uC77C \uCF5C'}</div>
            <div>{'\uC81C\uCD9C\uC2DC\uAC04'}</div>
            <div>{'\uC0C1\uC138'}</div>
          </div>
          {reports.map((row) => (
            <div key={row.id} className="db-list-row daily-report-row-admin">
              <div>{row.tm_name || '-'}</div>
              <div>{row.is_submitted ? '\uC644\uB8CC' : '\uC9C4\uD589\uC911'}</div>
              <div>{countOf(row, 'manual_failed_count', 'failed_count')}</div>
              <div>{countOf(row, 'manual_reserved_count', 'reserved_count')}</div>
              <div>{countOf(row, 'manual_visit_today_count', 'visit_today_count')}</div>
              <div>{countOf(row, 'manual_visit_nextday_count', 'visit_nextday_count')}</div>
              <div>{countOf(row, 'manual_call_count', 'total_call_count')}</div>
              <div>{formatDateTime(row.submitted_at)}</div>
              <div>
                <button type="button" className="admin-home-tm-edit" onClick={() => openModal(row)}>
                  {'\uBAA8\uB2EC \uBCF4\uAE30'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {modalData ? (
        <div className="tm-lead-modal">
          <div className="tm-lead-backdrop" onClick={() => setModalData(null)} />
          <div className="tm-lead-card daily-report-modal">
            <div className="tm-lead-header">
              <h3>{formatReportTitle(modalData.report?.report_date, modalData.report?.tm_name)}</h3>
              <button type="button" onClick={() => setModalData(null)}>{'\uB2EB\uAE30'}</button>
            </div>

            <pre className="daily-report-preview">
{[
  `${formatReportTitle(modalData.report?.report_date, modalData.report?.tm_name)}`,
  '',
  `1. \uB2F9\uC77C \uC608\uC57D: ${countOf(modalData.report, 'manual_reserved_count', 'reserved_count')}\uBA85`,
  `2. \uB2F9\uC77C \uB0B4\uC6D0: ${countOf(modalData.report, 'manual_visit_today_count', 'visit_today_count')}\uBA85`,
  `3. \uC775\uC77C \uB0B4\uC6D0: ${countOf(modalData.report, 'manual_visit_nextday_count', 'visit_nextday_count')}\uBA85`,
  `4. \uB2F9\uC77C \uCF5C \uAC2F\uC218: ${countOf(modalData.report, 'manual_call_count', 'total_call_count')}\uBA85`,
  '',
  `- DB CRM \uAE30\uC785: ${modalData.report?.check_db_crm ? '(\uC644\uB8CC)' : '(\uC9C4\uD589\uC911)'}`,
  `- \uC6D0\uB0B4 CRM \uAE30\uC785: ${modalData.report?.check_inhouse_crm ? '(\uC644\uB8CC)' : '(\uC9C4\uD589\uC911)'}`,
  `- \uC2E4\uC801\uC2DC\uD2B8\uAE30\uC785: ${modalData.report?.check_sheet ? '(\uC644\uB8CC)' : '(\uC9C4\uD589\uC911)'}`,
].join('\n')}
            </pre>

            <div className="daily-report-metrics">
              {Object.entries(metricLabels).map(([metricKey, label]) => (
                <div key={metricKey} className="daily-report-metric-box">
                  <div className="daily-report-metric-title">{`${label} (${(modalData.leads?.[metricKey] || []).length}\uAC74)`}</div>
                  <div className="daily-report-metric-list">
                    {(modalData.leads?.[metricKey] || []).slice(0, 10).map((lead) => (
                      <div key={`${metricKey}-${lead.lead_id}`} className="daily-report-metric-item">
                        {lead.name_snapshot || '-'} / {lead.phone_snapshot || '-'} / {lead.status_snapshot || '-'}
                      </div>
                    ))}
                    {(modalData.leads?.[metricKey] || []).length > 10 ? (
                      <div className="daily-report-metric-item">{`\uC678 ${(modalData.leads?.[metricKey] || []).length - 10}\uAC74`}</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
