import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import api from '../apiClient'
import { logout } from '../store/authSlice'

export default function TmLayout() {
  const dispatch = useDispatch()
  const { status, user } = useSelector((state) => state.auth)
  const location = useLocation()
  const [todayCount, setTodayCount] = useState(0)
  const [assignedTodayCount, setAssignedTodayCount] = useState(0)

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
              ? '당일 배정 DB'
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
              className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
            >
              리콜대기
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
          </nav>
        </aside>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
