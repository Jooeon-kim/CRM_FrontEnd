import { useEffect, useMemo, useState } from 'react'
import api from '../apiClient'

export default function TmCallStatus() {
  const [rows, setRows] = useState([])
  const [agents, setAgents] = useState([])
  const [activeTm, setActiveTm] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const [dbRes, tmRes] = await Promise.all([
          api.get('/dbdata'),
          api.get('/tm/agents'),
        ])
        setRows(dbRes.data || [])
        setAgents(tmRes.data || [])
        setError('')
      } catch (err) {
        setError('TM 콜 현황을 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

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
      const digits = String(value ?? '').replace(/\D/g, '')
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

  const filteredRows = useMemo(() => {
    if (activeTm === 'all') return rows
    return rows.filter((row) => String(row.tm) === String(activeTm))
  }, [rows, activeTm])

  const statusBuckets = ['대기', '부재중', '리콜대기', '예약', '무효', '예약부도', '내원완료']
  const statusCounts = statusBuckets.reduce((acc, status) => {
    acc[status] = filteredRows.filter((row) => {
      const state = String(row['상태'] || '').trim()
      if (!state) return status === '대기'
      return state.includes(status)
    }).length
    return acc
  }, {})
  const totalCount = statusBuckets.reduce((sum, key) => sum + statusCounts[key], 0)
  const statusColors = {
    대기: '#60a5fa',
    부재중: '#fbbf24',
    리콜대기: '#a78bfa',
    예약: '#34d399',
    무효: '#f87171',
    예약부도: '#f97316',
    내원완료: '#22c55e',
  }

  const eventCounts = filteredRows.reduce((acc, row) => {
    const event = String(row['이벤트'] || '미지정').trim() || '미지정'
    acc[event] = (acc[event] || 0) + 1
    return acc
  }, {})
  const eventEntries = Object.entries(eventCounts).sort((a, b) => b[1] - a[1])
  const eventTotal = eventEntries.reduce((sum, [, count]) => sum + count, 0)
  const eventPalette = [
    '#38bdf8',
    '#fb7185',
    '#a3e635',
    '#f59e0b',
    '#818cf8',
    '#34d399',
    '#f97316',
    '#22c55e',
    '#e879f9',
  ]

  const buildDonut = (entries, total, colors) => {
    if (total === 0) return 'conic-gradient(#e2e8f0 0deg, #e2e8f0 360deg)'
    let current = 0
    const parts = entries.map(([, value], idx) => {
      const angle = (value / total) * 360
      const start = current
      const end = current + angle
      current = end
      return `${colors[idx % colors.length]} ${start}deg ${end}deg`
    })
    return `conic-gradient(${parts.join(', ')})`
  }

  const regionCounts = filteredRows.reduce((acc, row) => {
    const region = String(row['거주지'] || '미지정').trim() || '미지정'
    acc[region] = (acc[region] || 0) + 1
    return acc
  }, {})
  const regionEntries = Object.entries(regionCounts).sort((a, b) => b[1] - a[1])
  const regionTotal = regionEntries.reduce((sum, [, count]) => sum + count, 0)

  const chartStops = () => {
    if (totalCount === 0) return 'conic-gradient(#e2e8f0 0deg, #e2e8f0 360deg)'
    let current = 0
    const parts = statusBuckets.map((status) => {
      const value = statusCounts[status] || 0
      const angle = (value / totalCount) * 360
      const start = current
      const end = current + angle
      current = end
      return `${statusColors[status]} ${start}deg ${end}deg`
    })
    return `conic-gradient(${parts.join(', ')})`
  }

  if (loading) return <div className="db-list">불러오는 중...</div>

  return (
    <div className="tm-call">
      <div className="tm-call-header">
        <h1>TM 콜 현황</h1>
        <span className="db-list-count">{filteredRows.length}건</span>
      </div>

      <div className="tm-call-charts">
        <div className="tm-call-box">
          <div className="tm-call-box-title">상태 비율</div>
          <div className="tm-call-box-body">
            <div className="tm-call-donut" style={{ background: chartStops() }}>
              <div className="tm-call-donut-center">
                <div className="tm-call-total">{totalCount}</div>
                <div className="tm-call-label">총 건수</div>
              </div>
            </div>
            <div className="tm-call-legend">
              {statusBuckets.map((status) => (
                <div className="tm-call-legend-row" key={status}>
                  <span
                    className="tm-call-legend-dot"
                    style={{ background: statusColors[status] }}
                  />
                  <span className="tm-call-legend-name">{status}</span>
                  <span className="tm-call-legend-count">{statusCounts[status] || 0}건</span>
                  <span className="tm-call-legend-percent">
                    {totalCount ? Math.round((statusCounts[status] / totalCount) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="tm-call-box">
          <div className="tm-call-box-title">이벤트 비율</div>
          <div className="tm-call-box-body">
            <div
              className="tm-call-donut"
              style={{ background: buildDonut(eventEntries, eventTotal, eventPalette) }}
            >
              <div className="tm-call-donut-center">
                <div className="tm-call-total">{eventTotal}</div>
                <div className="tm-call-label">이벤트</div>
              </div>
            </div>
            <div className="tm-call-legend">
              {eventEntries.map(([event, count], idx) => (
                <div className="tm-call-legend-row" key={event}>
                  <span
                    className="tm-call-legend-dot"
                    style={{ background: eventPalette[idx % eventPalette.length] }}
                  />
                  <span className="tm-call-legend-name">{event}</span>
                  <span className="tm-call-legend-count">{count}건</span>
                  <span className="tm-call-legend-percent">
                    {eventTotal ? Math.round((count / eventTotal) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="tm-call-box">
          <div className="tm-call-box-title">거주지 비율</div>
          <div className="tm-call-box-body">
            <div
              className="tm-call-donut"
              style={{ background: buildDonut(regionEntries, regionTotal, eventPalette) }}
            >
              <div className="tm-call-donut-center">
                <div className="tm-call-total">{regionTotal}</div>
                <div className="tm-call-label">거주지</div>
              </div>
            </div>
            <div className="tm-call-legend">
              {regionEntries.map(([region, count], idx) => (
                <div className="tm-call-legend-row" key={region}>
                  <span
                    className="tm-call-legend-dot"
                    style={{ background: eventPalette[idx % eventPalette.length] }}
                  />
                  <span className="tm-call-legend-name">{region}</span>
                  <span className="tm-call-legend-count">{count}건</span>
                  <span className="tm-call-legend-percent">
                    {regionTotal ? Math.round((count / regionTotal) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="tm-call-tabs">
        <button
          className={`tm-call-tab${activeTm === 'all' ? ' active' : ''}`}
          type="button"
          onClick={() => setActiveTm('all')}
        >
          전체
        </button>
        {agents.map((agent) => (
          <button
            key={agent.id}
            className={`tm-call-tab${String(activeTm) === String(agent.id) ? ' active' : ''}`}
            type="button"
            onClick={() => setActiveTm(agent.id)}
          >
            {agent.name}
          </button>
        ))}
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
                <div key={key}>{formatCell(key, row[key])}</div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
