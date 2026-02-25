import { Navigate, Route, Routes } from 'react-router-dom'
import { useSelector } from 'react-redux'
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
  return (
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
  )
}





export default App
