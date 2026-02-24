import { useDispatch, useSelector } from 'react-redux'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import api from '../apiClient'
import { logout, setUser } from '../store/authSlice'
import { setAdminDataset } from '../store/mainSlice'
import ChatWidget from '../Components/ChatWidget'

export default function Admin() {
  const dispatch = useDispatch()
  const { status, user } = useSelector((state) => state.auth)
  const adminDatasets = useSelector((state) => state.main.adminDatasets)
  const location = useLocation()
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    password: '',
  })

  const pageTitle = location.pathname.includes('/admin/tm-assign')
    ? 'TM배정'
    : location.pathname.includes('/admin/tm-reassign')
      ? 'TM변경'
    : location.pathname.includes('/admin/tm-call')
      ? 'TM콜현황'
      : location.pathname.includes('/admin/db-list')
        ? 'DB목록'
        : location.pathname.includes('/admin/daily-report')
          ? '마감보고'
          : location.pathname.includes('/admin/calendar')
            ? '캘린더'
            : '관리자'

  const openProfile = async () => {
    try {
      setProfileError('')
      setProfileLoading(true)
      const response = await api.get('/auth/admin/profile')
      setProfileForm({
        name: response.data?.username || user?.username || '',
        phone: response.data?.phone || '',
        password: '',
      })
      setProfileOpen(true)
    } catch (err) {
      setProfileError('관리자 정보를 불러오지 못했습니다.')
      setProfileOpen(true)
    } finally {
      setProfileLoading(false)
    }
  }

  const closeProfile = () => {
    setProfileOpen(false)
    setProfileError('')
  }

  const handleProfileSubmit = async (event) => {
    event.preventDefault()
    try {
      setProfileError('')
      setProfileLoading(true)
      const payload = {
        name: profileForm.name,
        phone: profileForm.phone,
      }
      if (profileForm.password) {
        payload.password = profileForm.password
      }
      const response = await api.post('/auth/admin/profile', payload)
      const nextUser = {
        id: response.data?.id || user?.id,
        username: response.data?.username || profileForm.name || user?.username,
      }
      dispatch(setUser(nextUser))
      setProfileOpen(false)
    } catch (err) {
      setProfileError('정보 수정에 실패했습니다.')
    } finally {
      setProfileLoading(false)
    }
  }

  useEffect(() => {
    const CACHE_TTL_MS = 2 * 60 * 1000
    const now = Date.now()
    const dbFresh = now - Number(adminDatasets?.dbRows?.fetchedAt || 0) < CACHE_TTL_MS
    const agentsFresh = now - Number(adminDatasets?.agents?.fetchedAt || 0) < CACHE_TTL_MS
    const tmLeadsFresh = now - Number(adminDatasets?.tmLeads?.fetchedAt || 0) < CACHE_TTL_MS

    if (dbFresh && agentsFresh && tmLeadsFresh) return

    let cancelled = false
    ;(async () => {
      try {
        const [dbRes, agentsRes, tmLeadsRes] = await Promise.all([
          api.get('/dbdata'),
          api.get('/tm/agents'),
          api.get('/tm/leads'),
        ])
        if (cancelled) return
        dispatch(
          setAdminDataset({
            key: 'dbRows',
            rows: Array.isArray(dbRes.data) ? dbRes.data : [],
            fetchedAt: Date.now(),
          })
        )
        dispatch(
          setAdminDataset({
            key: 'agents',
            rows: Array.isArray(agentsRes.data) ? agentsRes.data : [],
            fetchedAt: Date.now(),
          })
        )
        dispatch(
          setAdminDataset({
            key: 'tmLeads',
            rows: Array.isArray(tmLeadsRes.data?.leads) ? tmLeadsRes.data.leads : [],
            fetchedAt: Date.now(),
          })
        )
      } catch (err) {
        // prefetch failure is non-blocking
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    adminDatasets?.agents?.fetchedAt,
    adminDatasets?.dbRows?.fetchedAt,
    adminDatasets?.tmLeads?.fetchedAt,
    dispatch,
  ])

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
            {user?.username ? `${user.username}님` : '관리자님'} 환영합니다
          </span>
          <button
            className="admin-profile-button"
            type="button"
            onClick={openProfile}
            disabled={profileLoading}
          >
            정보수정
          </button>
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
              to="/admin"
              end
              className={({ isActive }) =>
                `admin-nav-item${isActive ? ' active' : ''}`
              }
            >
              메인페이지
            </NavLink>
            <NavLink
              to="/admin/tm-assign"
              className={({ isActive }) =>
                `admin-nav-item${isActive ? ' active' : ''}`
              }
            >
              TM배정
            </NavLink>
            <NavLink
              to="/admin/tm-call"
              className={({ isActive }) =>
                `admin-nav-item${isActive ? ' active' : ''}`
              }
            >
              TM콜현황
            </NavLink>
            <NavLink
              to="/admin/tm-reassign"
              className={({ isActive }) =>
                `admin-nav-item${isActive ? ' active' : ''}`
              }
            >
              TM변경
            </NavLink>
            <NavLink
              to="/admin/db-list"
              className={({ isActive }) =>
                `admin-nav-item${isActive ? ' active' : ''}`
              }
            >
              DB목록
            </NavLink>
            <NavLink
              to="/admin/daily-report"
              className={({ isActive }) =>
                `admin-nav-item${isActive ? ' active' : ''}`
              }
            >
              마감보고
            </NavLink>
            <NavLink
              to="/admin/calendar"
              className={({ isActive }) =>
                `admin-nav-item${isActive ? ' active' : ''}`
              }
            >
              캘린더
            </NavLink>
            <button
              type="button"
              className="admin-sidebar-mascot"
              onClick={() => window.alert('뚝딱뚝딱')}
            >
              <img src="/admin-bot.png" alt="관리자 페이지 마스코트" />
            </button>
          </nav>
        </aside>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>

      {profileOpen ? (
        <div className="admin-profile-modal">
          <div className="admin-profile-modal-backdrop" onClick={closeProfile} />
          <div className="admin-profile-modal-card">
            <div className="admin-profile-modal-header">
              <h3>관리자 정보수정</h3>
              <button type="button" onClick={closeProfile}>닫기</button>
            </div>

            <form className="admin-profile-modal-form" onSubmit={handleProfileSubmit}>
              <label>
                이름
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </label>
              <label>
                전화번호
                <input
                  type="text"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))}
                  required
                />
              </label>
              <label>
                비밀번호
                <input
                  type="password"
                  placeholder="변경 시에만 입력"
                  value={profileForm.password}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, password: e.target.value }))}
                />
              </label>

              {profileError ? <div className="admin-profile-error">{profileError}</div> : null}

              <div className="admin-profile-modal-actions">
                <button type="button" onClick={closeProfile} disabled={profileLoading}>
                  취소
                </button>
                <button type="submit" disabled={profileLoading}>
                  {profileLoading ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      <ChatWidget />
    </div>
  )
}
