import { useEffect, useState } from 'react'
import api from '../apiClient'

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
  const [rows, setRows] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [tmFilter, setTmFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [nameQuery, setNameQuery] = useState('')
  const [phoneQuery, setPhoneQuery] = useState('')
  const [callMin, setCallMin] = useState('')
  const [missMin, setMissMin] = useState('')
  const [regionQuery, setRegionQuery] = useState('')
  const [memoQuery, setMemoQuery] = useState('')
  const [assignedTodayOnly, setAssignedTodayOnly] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [activeLead, setActiveLead] = useState(null)
  const [memos, setMemos] = useState([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    status: '',
    region: '',
    memo: '',
    date: '',
    time: '',
    tmId: '',
  })

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const [res, tmRes] = await Promise.all([
          api.get('/dbdata'),
          api.get('/tm/agents'),
        ])
        setRows(res.data || [])
        setAgents(tmRes.data || [])
        setError('')
      } catch (err) {
        setError('DB 목록을 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  if (loading) return <div className="db-list">불러오는 중...</div>

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
    if (key === '인입날짜' || key === '콜_날짜시간' || key === '예약_내원일시' || key === '최근메모시간') {
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
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return { date: '', time: '' }
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
                상태: form.status,
                거주지: form.region,
                예약_내원일시: reservationAt || row['예약_내원일시'],
                tm: form.tmId || row.tm,
                최근메모내용: form.memo || row['최근메모내용'],
                최근메모시간: form.memo ? new Date().toISOString() : row['최근메모시간'],
              }
            : row
        )
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

  const normalizedRegion = regionQuery.trim().toLowerCase()
  const normalizedMemo = memoQuery.trim().toLowerCase()
  const normalizedName = nameQuery.trim().toLowerCase()
  const normalizedPhone = normalizePhoneDigits(phoneQuery)
  const callMinNum = Number(callMin)
  const missMinNum = Number(missMin)

  const isAssignedToday = (value) => {
    if (!value) return false
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return false
    const today = new Date()
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    )
  }

  const filteredRows = rows.filter((row) => {
    const tmOk = tmFilter === 'all' || String(row.tm) === String(tmFilter)
    const statusOk =
      statusFilter === 'all' || String(row['상태'] || '').includes(statusFilter)
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
    const regionOk =
      !normalizedRegion ||
      String(row['거주지'] || '').toLowerCase().includes(normalizedRegion)
    const memoOk =
      !normalizedMemo ||
      String(row['최근메모내용'] || '').toLowerCase().includes(normalizedMemo)
    const assignedOk = !assignedTodayOnly || isAssignedToday(row['배정날짜'])

    return tmOk && statusOk && callOk && missOk && nameOk && phoneOk && regionOk && memoOk && assignedOk
  })

  const handleReset = () => {
    setTmFilter('all')
    setStatusFilter('all')
    setNameQuery('')
    setPhoneQuery('')
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
          callMin,
          missMin,
          region: regionQuery,
          memo: memoQuery,
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

  return (
    <div className="db-list">
      <div className="db-list-header">
        <h1>DB 목록</h1>
        <div className="db-list-actions">
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
          <button
            className="db-list-export"
            type="button"
            onClick={handleExport}
            disabled={downloading}
          >
            {downloading ? '다운로드 중...' : '엑셀 다운로드'}
          </button>
          <button className="db-list-reset" type="button" onClick={handleReset}>
            초기화
          </button>
          <span className="db-list-count">{filteredRows.length}건</span>
        </div>
      </div>

      <div className="db-list-filters">
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
      </div>

      {error ? <div className="db-list-error">{error}</div> : null}

      {filteredRows.length === 0 ? (
        <div className="db-list-empty">표시할 데이터가 없습니다.</div>
      ) : (
        <div className="db-list-table">
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
                          <div className="tm-lead-memo-time">{formatDateTime(memo.memo_time)}</div>
                          <div className="tm-lead-memo-content">{memo.memo_content}</div>
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
    </div>
  )
}

