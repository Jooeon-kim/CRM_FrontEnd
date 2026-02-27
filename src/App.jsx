import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import './App.css'
import MainLayout from './Layout/MainLayout'
import Login from './Pages/Login'
import Admin from './Pages/Admin'
import AdminHome from './Pages/AdminHome'
import TmAssign from './Pages/TmAssign'
import DbList from './Pages/DbList'
import TmCallStatus from './Pages/TmCallStatus'
import AdminCalendar from './Pages/AdminCalendar'
import AdminDailyReport from './Pages/AdminDailyReport'
import AdminTmReassign from './Pages/AdminTmReassign'
import AdminAuditLogs from './Pages/AdminAuditLogs'
import TmLayout from './Pages/TmLayout'
import TmHome from './Pages/TmHome'
import TmMissed from './Pages/TmMissed'
import TmRecall from './Pages/TmRecall'
import TmReserved from './Pages/TmReserved'
import TmCalendar from './Pages/TmCalendar'
import TmWaiting from './Pages/TmWaiting'
import TmAvailable from './Pages/TmAvailable'
import TmAssignedToday from './Pages/TmAssignedToday'
import TmDailyReport from './Pages/TmDailyReport'
import { logout } from './store/authSlice'

function RequireAdmin({ children }) {
  const { isAuthenticated, isAdmin } = useSelector((state) => state.auth)

  if (!isAuthenticated) return <Navigate to="/" replace />
  if (!isAdmin) return <Navigate to="/main" replace />
  return children
}

function RequireAuth({ children }) {
  const { isAuthenticated } = useSelector((state) => state.auth)

  if (!isAuthenticated) return <Navigate to="/" replace />
  return children
}

function App() {
  const dispatch = useDispatch()
  const { isAuthenticated } = useSelector((state) => state.auth)
  const [sessionExpiredOpen, setSessionExpiredOpen] = useState(false)
  const [sessionHandling, setSessionHandling] = useState(false)

  useEffect(() => {
    const handler = () => {
      if (!isAuthenticated) return
      setSessionExpiredOpen(true)
    }
    window.addEventListener('crm:session-expired', handler)
    return () => window.removeEventListener('crm:session-expired', handler)
  }, [isAuthenticated])

  const handleSessionExpiredConfirm = async () => {
    if (sessionHandling) return
    try {
      setSessionHandling(true)
      await dispatch(logout())
    } finally {
      setSessionHandling(false)
      setSessionExpiredOpen(false)
      window.location.href = '/'
    }
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<Login/>}/>
        <Route
          path="/main"
          element={
            <RequireAuth>
              <TmLayout />
            </RequireAuth>
          }
        >
          <Route index element={<TmHome />} />
          <Route path="waiting" element={<TmWaiting />} />
          <Route path="available" element={<TmAvailable />} />
          <Route path="missed" element={<TmMissed />} />
          <Route path="recall" element={<TmRecall />} />
          <Route path="reserved" element={<TmReserved />} />
          <Route path="calendar" element={<TmCalendar />} />
          <Route path="assigned-today" element={<TmAssignedToday />} />
          <Route path="daily-report" element={<TmDailyReport />} />
        </Route>
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <Admin />
            </RequireAdmin>
          }
        >
          <Route index element={<AdminHome />} />
          <Route path="tm-assign" element={<TmAssign />} />
          <Route path="tm-call" element={<TmCallStatus />} />
          <Route path="tm-reassign" element={<AdminTmReassign />} />
          <Route path="db-list" element={<DbList />} />
          <Route path="calendar" element={<AdminCalendar />} />
          <Route path="daily-report" element={<AdminDailyReport />} />
          <Route path="audit-logs" element={<AdminAuditLogs />} />
        </Route>
      </Routes>
      {sessionExpiredOpen ? (
        <div className="session-expired-modal">
          <div className="session-expired-backdrop" />
          <div className="session-expired-card">
            <h3>세션 만료</h3>
            <p>세션이 만료되었습니다. 다시 로그인해주세요.</p>
            <button type="button" onClick={handleSessionExpiredConfirm} disabled={sessionHandling}>
              {sessionHandling ? '처리 중...' : '확인'}
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}





export default App
