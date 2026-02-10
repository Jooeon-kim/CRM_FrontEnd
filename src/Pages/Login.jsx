import { useDispatch, useSelector } from 'react-redux'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, logout } from '../store/authSlice'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { status, error, isAuthenticated, isAdmin } = useSelector((state) => state.auth)
  const wasAuthenticated = useRef(isAuthenticated)

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!username || !password) return
    dispatch(login({ username, password }))
  }

  const handleLogout = () => {
    dispatch(logout())
  }

  const loading = status === 'loading'
  const statusMessage = error
    ? { type: 'error', message: typeof error === 'string' ? error : JSON.stringify(error) }
    : isAuthenticated
      ? { type: 'success', message: '로그인 성공' }
      : null

  useEffect(() => {
    if (!isAuthenticated) return
    navigate(isAdmin ? '/admin' : '/main', { replace: true })
  }, [isAuthenticated, isAdmin, navigate])

  useEffect(() => {
    if (wasAuthenticated.current && !isAuthenticated && status !== 'loading') {
      navigate('/', { replace: true })
    }
    wasAuthenticated.current = isAuthenticated
  }, [isAuthenticated, status, navigate])

  return (
    <div className="login-shell">
      <div className="login-panel">
        <div className="login-brand">
          <div className="login-title">샤인유의원 고객관리팀</div>
          <div className="login-subtitle">로그인</div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span>이름</span>
            <input
              type="text"
              name="username"
              autoComplete="username"
              placeholder="이름을 입력하세요."
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>

          <label className="login-field">
            <span>비밀번호</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="비밀번호를 입력하세요."
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <button className="login-button" type="submit" disabled={loading}>
            {loading ? '로그인 중...' : '로그인'}
          </button>

          {isAuthenticated ? (
            <button
              className="login-button"
              type="button"
              onClick={handleLogout}
              disabled={loading}
            >
              로그아웃
            </button>
          ) : null}

          {statusMessage ? (
            <div className={`login-status ${statusMessage.type}`}>
              {statusMessage.message}
            </div>
          ) : null}
        </form>
      </div>
    </div>
  )
}
