import { useEffect, useState } from 'react'
import api from '../apiClient'

export default function DbList() {
  const [rows, setRows] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [tmFilter, setTmFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [callMin, setCallMin] = useState('')
  const [missMin, setMissMin] = useState('')
  const [regionQuery, setRegionQuery] = useState('')
  const [memoQuery, setMemoQuery] = useState('')

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

  const tmOptions = Array.from(
    new Set(rows.map((row) => row.tm).filter(Boolean))
  )

  const statusOptions = ['대기', '예약', '부재중', '리콜대기', '무효', '예약부도', '내원완료']

  const normalizedRegion = regionQuery.trim().toLowerCase()
  const normalizedMemo = memoQuery.trim().toLowerCase()
  const callMinNum = Number(callMin)
  const missMinNum = Number(missMin)

  const filteredRows = rows.filter((row) => {
    const tmOk = tmFilter === 'all' || String(row.tm) === String(tmFilter)
    const statusOk =
      statusFilter === 'all' || String(row['상태'] || '').includes(statusFilter)
    const callCount = Number(row['콜횟수'] || 0)
    const missCount = Number(row['부재중_횟수'] || 0)
    const callOk = Number.isNaN(callMinNum) || callMin === '' || callCount >= callMinNum
    const missOk = Number.isNaN(missMinNum) || missMin === '' || missCount >= missMinNum
    const regionOk =
      !normalizedRegion ||
      String(row['거주지'] || '').toLowerCase().includes(normalizedRegion)
    const memoOk =
      !normalizedMemo ||
      String(row['최근메모내용'] || '').toLowerCase().includes(normalizedMemo)

    return tmOk && statusOk && callOk && missOk && regionOk && memoOk
  })

  const handleReset = () => {
    setTmFilter('all')
    setStatusFilter('all')
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
                {tm}
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
            <div className="db-list-row" key={index}>
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
    </div>
  )
}
