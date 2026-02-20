import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import api from '../apiClient'

const DAY_LABELS = ['\uC77C', '\uC6D4', '\uD654', '\uC218', '\uBAA9', '\uAE08', '\uD1A0']

const metricLabels = {
  MISSED: '\uBD80\uC7AC\uC911',
  RECALL_WAIT: '\uB9AC\uCF5C\uB300\uAE30',
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

const parseDateTimeLocal = (value) => {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const raw = String(value).trim()
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
  const local = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (local) {
    const date = new Date(
      Number(local[1]),
      Number(local[2]) - 1,
      Number(local[3]),
      Number(local[4]),
      Number(local[5]),
      Number(local[6] || '0')
    )
    return Number.isNaN(date.getTime()) ? null : date
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const parseNumber = (value) => {
  const n = Number(value)
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.floor(n))
}

const formatReportTitle = (dateKey, tmName) => {
  const date = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return `<${date.getMonth() + 1}\uC6D4 ${date.getDate()}\uC77C (${DAY_LABELS[date.getDay()]}\uC694\uC77C) ${tmName || ''} \uB9C8\uAC10\uBCF4\uACE0>`
}

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

const formatShortDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return `${date.getMonth() + 1}월 ${date.getDate()}일`
}

export default function TmDailyReport() {
  const { user } = useSelector((state) => state.auth)
  const [date, setDate] = useState(toDateKey())
  const [report, setReport] = useState(null)
  const [reports, setReports] = useState([])
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [modalData, setModalData] = useState(null)

  const [form, setForm] = useState({
    reservedCount: 0,
    visitTodayCount: 0,
    visitNextdayCount: 0,
    callCount: 0,
    checkDbCrm: false,
    checkInhouseCrm: false,
    checkSheet: false,
  })

  const checklistDone = form.checkDbCrm && form.checkInhouseCrm && form.checkSheet

  const loadList = async () => {
    const res = await api.get('/tm/reports/mine', { params: { tmId: user?.id } })
    setReports(res.data || [])
  }

  const loadDraftForDate = async (targetDate, options = {}) => {
    const { preferLiveCounts = false } = options
    const draftRes = await api.post('/tm/reports/draft', { reportDate: targetDate, tmId: user?.id })
    const row = draftRes.data?.report
    setReport(row || null)
    if (row) {
      const reservedCount = preferLiveCounts
        ? (row.reserved_count ?? row.manual_reserved_count ?? 0)
        : (row.manual_reserved_count ?? row.reserved_count ?? 0)
      const visitTodayCount = preferLiveCounts
        ? (row.visit_today_count ?? row.manual_visit_today_count ?? 0)
        : (row.manual_visit_today_count ?? row.visit_today_count ?? 0)
      const visitNextdayCount = preferLiveCounts
        ? (row.visit_nextday_count ?? row.manual_visit_nextday_count ?? 0)
        : (row.manual_visit_nextday_count ?? row.visit_nextday_count ?? 0)
      const callCount = preferLiveCounts
        ? (row.total_call_count ?? row.manual_call_count ?? 0)
        : (row.manual_call_count ?? row.total_call_count ?? 0)

      setForm({
        reservedCount,
        visitTodayCount,
        visitNextdayCount,
        callCount,
        checkDbCrm: Boolean(row.check_db_crm),
        checkInhouseCrm: Boolean(row.check_inhouse_crm),
        checkSheet: Boolean(row.check_sheet),
      })
    }
  }

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        await Promise.all([loadDraftForDate(date, { preferLiveCounts: true }), loadList()])
      } catch (err) {
        setError('\uB9C8\uAC10\uBCF4\uACE0 \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [date])

  const saveDraft = async () => {
    try {
      setSaving(true)
      setMessage('')
      setError('')
      await api.post('/tm/reports/draft', {
        reportDate: date,
        tmId: user?.id,
        manualReservedCount: parseNumber(form.reservedCount),
        manualVisitTodayCount: parseNumber(form.visitTodayCount),
        manualVisitNextdayCount: parseNumber(form.visitNextdayCount),
        manualCallCount: parseNumber(form.callCount),
        checkDbCrm: form.checkDbCrm,
        checkInhouseCrm: form.checkInhouseCrm,
        checkSheet: form.checkSheet,
      })
      await Promise.all([loadDraftForDate(date), loadList()])
      setMessage('\uC784\uC2DC\uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.')
    } catch (err) {
      setError('\uC784\uC2DC\uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.')
    } finally {
      setSaving(false)
    }
  }

  const submitReport = async () => {
    try {
      setSubmitting(true)
      setMessage('')
      setError('')
      await api.post('/tm/reports/submit', {
        reportDate: date,
        tmId: user?.id,
        manualReservedCount: parseNumber(form.reservedCount),
        manualVisitTodayCount: parseNumber(form.visitTodayCount),
        manualVisitNextdayCount: parseNumber(form.visitNextdayCount),
        manualCallCount: parseNumber(form.callCount),
        checkDbCrm: form.checkDbCrm,
        checkInhouseCrm: form.checkInhouseCrm,
        checkSheet: form.checkSheet,
      })
      await Promise.all([loadDraftForDate(date), loadList()])
      setMessage('\uB9C8\uAC10\uBCF4\uACE0\uAC00 \uC644\uB8CC \uC81C\uCD9C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.')
    } catch (err) {
      setError(err?.response?.data?.error || '\uB9C8\uAC10\uBCF4\uACE0 \uC81C\uCD9C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.')
    } finally {
      setSubmitting(false)
    }
  }

  const openModal = async (row) => {
    try {
      const res = await api.get(`/tm/reports/${row.id}/full`, { params: { tmId: user?.id } })
      setModalData(res.data || null)
    } catch (err) {
      try {
        const metrics = ['MISSED', 'RECALL_WAIT', 'FAILED', 'RESERVED', 'VISIT_TODAY', 'VISIT_NEXTDAY']
        const results = await Promise.all(
          metrics.map((metric) =>
            api
              .get(`/admin/reports/${row.id}/leads`, { params: { metric } })
              .then((res) => [metric, res.data?.leads || []])
          )
        )
        const leads = results.reduce(
          (acc, [metric, rows]) => {
            acc[metric] = rows
            return acc
          },
          { MISSED: [], RECALL_WAIT: [], FAILED: [], RESERVED: [], VISIT_TODAY: [], VISIT_NEXTDAY: [] }
        )
        setModalData({ report: row, leads })
      } catch {
        setError('\uB9C8\uAC10\uBCF4\uACE0 \uC694\uC57D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.')
      }
    }
  }

  const templateText = useMemo(() => {
    return [
      formatReportTitle(date, user?.username || ''),
      `1. \uB2F9\uC77C \uC608\uC57D: ${parseNumber(form.reservedCount)}\uBA85`,
      `2. \uB2F9\uC77C \uB0B4\uC6D0: ${parseNumber(form.visitTodayCount)}\uBA85`,
      `3. \uC775\uC77C \uB0B4\uC6D0: ${parseNumber(form.visitNextdayCount)}\uBA85`,
      `4. \uB2F9\uC77C \uCF5C \uAC2F\uC218: ${parseNumber(form.callCount)}\uAC1C`,
      '',
      '5. \uB2F9\uC77C \uAE30\uC785',
      `- DB CRM \uAE30\uC785: ${form.checkDbCrm ? '(\uC644\uB8CC)' : '(\uC9C4\uD589\uC911)'}`,
      `- \uC6D0\uB0B4 CRM \uAE30\uC785: ${form.checkInhouseCrm ? '(\uC644\uB8CC)' : '(\uC9C4\uD589\uC911)'}`,
      `- \uC2E4\uC801\uC2DC\uD2B8\uAE30\uC785: ${form.checkSheet ? '(\uC644\uB8CC)' : '(\uC9C4\uD589\uC911)'}`,
    ].join('\n')
  }, [date, user?.username, form])

  if (loading) return <div className="db-list-empty">{'\uBD88\uB7EC\uC624\uB294 \uC911...'}</div>

  return (
    <div className="db-list daily-report-page">
      <div className="db-list-header">
        <div>
          <h1>{'\uB9C8\uAC10\uBCF4\uACE0 \uD398\uC774\uC9C0'}</h1>
          <span className="db-list-count">{report?.is_submitted ? '\uC81C\uCD9C \uC644\uB8CC' : '\uC791\uC131 \uC911'}</span>
        </div>
        <div className="db-list-actions">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      {error ? <div className="db-list-error">{error}</div> : null}
      {message ? <div className="admin-home-message">{message}</div> : null}

      <div className="daily-report-layout">
        <div className="daily-report-form">
          <label>
            {'1. \uB2F9\uC77C \uC608\uC57D'}
            <input type="number" min="0" value={form.reservedCount} onChange={(e) => setForm((prev) => ({ ...prev, reservedCount: e.target.value }))} />
          </label>
          <label>
            {'2. \uB2F9\uC77C \uB0B4\uC6D0'}
            <input type="number" min="0" value={form.visitTodayCount} onChange={(e) => setForm((prev) => ({ ...prev, visitTodayCount: e.target.value }))} />
          </label>
          <label>
            {'3. \uC775\uC77C \uB0B4\uC6D0'}
            <input type="number" min="0" value={form.visitNextdayCount} onChange={(e) => setForm((prev) => ({ ...prev, visitNextdayCount: e.target.value }))} />
          </label>
          <label>
            {'4. \uB2F9\uC77C \uCF5C \uAC2F\uC218'}
            <input type="number" min="0" value={form.callCount} onChange={(e) => setForm((prev) => ({ ...prev, callCount: e.target.value }))} />
          </label>

          <div className="daily-report-checks">
            <label>
              <input type="checkbox" checked={form.checkDbCrm} onChange={(e) => setForm((prev) => ({ ...prev, checkDbCrm: e.target.checked }))} />
              {'DB CRM \uAE30\uC785'} {form.checkDbCrm ? '(\uC644\uB8CC)' : '(\uC9C4\uD589\uC911)'}
            </label>
            <label>
              <input type="checkbox" checked={form.checkInhouseCrm} onChange={(e) => setForm((prev) => ({ ...prev, checkInhouseCrm: e.target.checked }))} />
              {'\uC6D0\uB0B4 CRM \uAE30\uC785'} {form.checkInhouseCrm ? '(\uC644\uB8CC)' : '(\uC9C4\uD589\uC911)'}
            </label>
            <label>
              <input type="checkbox" checked={form.checkSheet} onChange={(e) => setForm((prev) => ({ ...prev, checkSheet: e.target.checked }))} />
              {'\uC2E4\uC801\uC2DC\uD2B8\uAE30\uC785'} {form.checkSheet ? '(\uC644\uB8CC)' : '(\uC9C4\uD589\uC911)'}
            </label>
          </div>

          <div className="daily-report-actions">
            <button type="button" className="db-list-reset" onClick={saveDraft} disabled={saving || submitting}>
              {saving ? '\uC800\uC7A5 \uC911...' : '\uC784\uC2DC\uC800\uC7A5'}
            </button>
            <button type="button" className="db-list-export" onClick={submitReport} disabled={submitting || saving || !checklistDone}>
              {submitting ? '\uC644\uB8CC \uCC98\uB9AC \uC911...' : '\uC644\uB8CC'}
            </button>
          </div>
        </div>

        <pre className="daily-report-preview">{templateText}</pre>
      </div>

      <div className="daily-report-list">
        <div className="db-list-header">
          <div>
            <h1>{'\uB9C8\uAC10\uBCF4\uACE0 \uBAA9\uB85D'}</h1>
            <span className="db-list-count">{`${reports.length}\uAC74`}</span>
          </div>
        </div>
        {reports.length === 0 ? (
          <div className="db-list-empty">{'\uB4F1\uB85D\uB41C \uB9C8\uAC10\uBCF4\uACE0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.'}</div>
        ) : (
          <div className="db-list-table">
            <div className="db-list-row db-list-head daily-report-row">
              <div>{'\uB0A0\uC9DC'}</div>
              <div>{'\uC0C1\uD0DC'}</div>
              <div>{'\uC81C\uCD9C\uC2DC\uAC04'}</div>
              <div>{'\uBCF4\uAE30'}</div>
            </div>
            {reports.map((row) => (
              <div key={row.id} className="db-list-row daily-report-row">
                <div>{formatShortDate(row.report_date)}</div>
                <div>{row.is_submitted ? '\uC644\uB8CC' : '\uC9C4\uD589\uC911'}</div>
                <div>{formatDateTime(row.submitted_at)}</div>
                <div>
                  <button type="button" className="admin-home-tm-edit" onClick={() => openModal(row)}>
                    {'\uC694\uC57D \uBCF4\uAE30'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalData ? (
        <div className="tm-lead-modal">
          <div className="tm-lead-backdrop" onClick={() => setModalData(null)} />
          <div className="tm-lead-card daily-report-modal">
            <div className="tm-lead-header">
              <h3>{formatReportTitle(modalData.report?.report_date, modalData.report?.tm_name || user?.username || '')}</h3>
              <button type="button" onClick={() => setModalData(null)}>{'\uB2EB\uAE30'}</button>
            </div>
            <pre className="daily-report-preview">
{[
  `1. \uB2F9\uC77C \uC608\uC57D: ${modalData.report?.manual_reserved_count ?? modalData.report?.reserved_count ?? 0}\uBA85`,
  `2. \uB2F9\uC77C \uB0B4\uC6D0: ${modalData.report?.manual_visit_today_count ?? modalData.report?.visit_today_count ?? 0}\uBA85`,
  `3. \uC775\uC77C \uB0B4\uC6D0: ${modalData.report?.manual_visit_nextday_count ?? modalData.report?.visit_nextday_count ?? 0}\uBA85`,
  `4. \uB2F9\uC77C \uCF5C \uAC2F\uC218: ${modalData.report?.manual_call_count ?? modalData.report?.total_call_count ?? 0}\uAC1C`,
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
                    {(modalData.leads?.[metricKey] || []).map((lead) => (
                      <div key={`${metricKey}-${lead.lead_id}`} className="daily-report-metric-item">
                        {metricKey === 'RECALL_WAIT'
                          ? `${lead.name_snapshot || '-'} / ${lead.phone_snapshot || '-'} / ${formatDateTime(lead.recall_at_snapshot)}`
                          : `${lead.name_snapshot || '-'} / ${lead.phone_snapshot || '-'} / ${lead.status_snapshot || '-'}`
                        }
                      </div>
                    ))}
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
