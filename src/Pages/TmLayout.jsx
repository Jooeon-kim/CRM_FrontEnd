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

  useEffect(() => {
    const loadToday = async () => {
      if (!user?.id) return
      try {
        const res = await api.get('/dbdata', { params: { tm: user.id, status: '?ˆì•½' } })
        const list = res.data || []
        const today = new Date()
        const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        const countByDate = new Map()
        list.forEach((item) => {
          const reservationValue = item['?ˆì•½_?´ì›?¼ì‹œ'] || item.reservation_at || item.reservationAt
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

  const pageTitle = location.pathname.includes('/main/waiting')
    ? '?€ê¸?
    : location.pathname.includes('/main/available')
      ? '?ë‹´ê°€??
      : location.pathname.includes('/main/missed')
        ? 'ë¶€?¬ì¤‘'
        : location.pathname.includes('/main/recall')
          ? 'ë¦¬ì½œ?€ê¸?
          : location.pathname.includes('/main/reserved')
            ? '?ˆì•½'
            : location.pathname.includes('/main/calendar')
              ? 'ìº˜ë¦°??
              : 'ë°°ì • ?„ë£Œ DB'

  const calendarLabel = useMemo(() => 'ìº˜ë¦°??, [])

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-left">
          <div className="admin-logo">Client Manager</div>
          <div className="admin-team">?¤ì¸? ì˜??ê³ ê°ê´€ë¦¬í?</div>
          <div className="admin-page-title">{pageTitle}</div>
        </div>
        <div className="admin-header-right">
          <span className="admin-welcome">
            {user?.username ? `${user.username}?? : '?´ë‹¹?ë‹˜'} ?˜ì˜?©ë‹ˆ??
          </span>
          <button
            className="admin-logout"
            onClick={() => dispatch(logout())}
            disabled={status === 'loading'}
          >
            ë¡œê·¸?„ì›ƒ
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
              ë°°ì • ?„ë£Œ DB
            </NavLink>
            <NavLink
              to="/main/waiting"
              className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
            >
              ?€ê¸?
            </NavLink>
            <NavLink
              to="/main/available"
              className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
            >
              ?ë‹´ê°€??
            </NavLink>
            <NavLink
              to="/main/missed"
              className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
            >
              ë¶€?¬ì¤‘
            </NavLink>
            <NavLink
              to="/main/recall"
              className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
            >
              ë¦¬ì½œ?€ê¸?
            </NavLink>
            <NavLink
              to="/main/reserved"
              className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
            >
              ?ˆì•½
            </NavLink>
            <NavLink
              to="/main/calendar"
              className={({ isActive }) =>
                `admin-nav-item${isActive ? ' active' : ''}${todayCount ? ' calendar-alert' : ''}`
              }
            >
              <span>{calendarLabel}</span>
              {todayCount ? <span className="calendar-badge">?¤ëŠ˜ ?ˆì•½ {todayCount}ëª?/span> : null}
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


