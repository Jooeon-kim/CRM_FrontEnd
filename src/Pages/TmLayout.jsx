import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import api from '../apiClient'
import { logout } from '../store/authSlice'

const parseLocalDateTime = (value) => {
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

export default function TmLayout() {
  const dispatch = useDispatch()
  const { status, user } = useSelector((state) => state.auth)
  const location = useLocation()
  const [todayCount, setTodayCount] = useState(0)
  const [assignedTodayCount, setAssignedTodayCount] = useState(0)
  const [recallDueCount, setRecallDueCount] = useState(0)

  useEffect(() => {
    const loadToday = async () => {
      if (!user?.id) return
      try {
        const res = await api.get('/dbdata', { params: { tm: user.id, status: '예약' } })
        const list = res.data || []
        const today = new Date()
        const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        const countByDate = new Map()
        list.forEach((item) => {
          const reservationValue = item['예약_내원일시'] || item.reservation_at || item.reservationAt
          if (!reservationValue) return
          const date = new Date(reservationValue)
          if (Number.isNaN(date.getTime())) return
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
          const current = countByDate.get(key) || 0
          countByDate.set(key, current + 1)
        })
        const count = countByDate.get(todayKey) || 0
        setTodayCount(count)
      } catch {
        setTodayCount(0)
      }
    }

    loadToday()
  }, [user?.id])

  useEffect(() => {
    const loadAssignedToday = async () => {
      if (!user?.id) return
      try {
        const res = await api.get('/dbdata', { params: { tm: user.id, assignedToday: 1 } })
        const list = res.data || []
        setAssignedTodayCount(list.length || 0)
      } catch {
        setAssignedTodayCount(0)
      }
    }

    loadAssignedToday()
  }, [user?.id])

  useEffect(() => {
    let timer = null
    const loadRecallDue = async () => {
      if (!user?.id) return
      try {
        const res = await api.get('/tm/recalls', { params: { mode: 'all', tmId: user.id } })
        const list = res.data || []
        const now = new Date()
        const count = list.filter((row) => {
          const dueAt = parseLocalDateTime(row?.['리콜_예정일시'])
          if (!dueAt) return false
          return (
            dueAt.getFullYear() === now.getFullYear() &&
            dueAt.getMonth() === now.getMonth() &&
            dueAt.getDate() === now.getDate() &&
            dueAt.getHours() === now.getHours()
          )
        }).length
        setRecallDueCount(count || 0)
      } catch {
        setRecallDueCount(0)
      }
    }

    loadRecallDue()
    timer = setInterval(loadRecallDue, 60 * 1000)
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [user?.id])

  const pageTitle = location.pathname.includes('/main/waiting')
    ? '대기'
    : location.pathname.includes('/main/available')
      ? '상담가능'
      : location.pathname.includes('/main/missed')
        ? '부재중'
        : location.pathname.includes('/main/recall')
          ? '리콜대기'
          : location.pathname.includes('/main/reserved')
            ? '예약'
            : location.pathname.includes('/main/assigned-today')
              ? '당일배정DB'
              : location.pathname.includes('/main/daily-report')
                ? '마감보고'
            : location.pathname.includes('/main/calendar')
              ? '캘린더'
              : '배정 완료 DB'

  const calendarLabel = useMemo(() => '캘린더', [])

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-left">
          <div className="admin-logo">Client Manager</div>
          <div className="admin-team">샤인유의원 고객관리팀</div>
          <div className="admin-page-title">{pageTitle}</div>
        </div>
        <div className="admin-header-right">
          <span className="admin-welcome">
            {user?.username ? `${user.username}님` : '담당자님'} 환영합니다
          </span>
          <button
            className="admin-logout"
            onClick={() => dispatch(logout())}
            disabled={status === 'loading'}
          >
            로그아웃
          </button>
        </div>
      </header>

      <div className="admin-body">
        <aside className="admin-sidebar">
          <nav className="admin-nav">
            <NavLink
              to="/main"
              end
              className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
            >
              배정 완료 DB
            </NavLink>
            <NavLink
              to="/main/waiting"
              className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
            >
              대기
            </NavLink>
            <NavLink
              to="/main/available"
              className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
            >
              상담가능
            </NavLink>
            <NavLink
              to="/main/missed"
              className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
            >
              부재중
            </NavLink>
            <NavLink
              to="/main/recall"
              className={({ isActive }) =>
                `admin-nav-item${isActive ? ' active' : ''}${recallDueCount ? ' calendar-alert' : ''}`
              }
            >
              <span>리콜대기</span>
              {recallDueCount ? <span className="calendar-badge">하이라이트 {recallDueCount}건</span> : null}
            </NavLink>
            <NavLink
              to="/main/reserved"
              className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
            >
              예약
            </NavLink>
            <NavLink
              to="/main/assigned-today"
              className={({ isActive }) =>
                `admin-nav-item${isActive ? ' active' : ''}${assignedTodayCount ? ' calendar-alert' : ''}`
              }
            >
              <span>당일배정DB</span>
              {assignedTodayCount ? (
                <span className="calendar-badge">오늘 배정 {assignedTodayCount}건</span>
              ) : null}
            </NavLink>
            <NavLink
              to="/main/calendar"
              className={({ isActive }) =>
                `admin-nav-item${isActive ? ' active' : ''}${todayCount ? ' calendar-alert' : ''}`
              }
            >
              <span>{calendarLabel}</span>
              {todayCount ? <span className="calendar-badge">오늘 예약 {todayCount}명</span> : null}
            </NavLink>
            <NavLink
              to="/main/daily-report"
              className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
            >
              마감보고
            </NavLink>
          </nav>
        </aside>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
