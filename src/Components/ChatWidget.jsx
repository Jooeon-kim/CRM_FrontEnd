import { useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { io } from 'socket.io-client'
import api from '../apiClient'

const formatChatTime = (value) => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('ko-KR', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getSocketUrl = () => {
  const base = import.meta.env.VITE_API_BASE_URL || ''
  if (/^https?:\/\//i.test(base)) {
    return base.replace(/\/api\/?$/i, '')
  }
  return undefined
}

export default function ChatWidget() {
  const { isAuthenticated, user, isAdmin } = useSelector((state) => state.auth)
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const socketRef = useRef(null)
  const listRef = useRef(null)

  const socketUrl = useMemo(() => getSocketUrl(), [])

  useEffect(() => {
    if (!isAuthenticated) return undefined
    const socket = io(socketUrl, {
      withCredentials: true,
      auth: {
        tmId: user?.id,
        username: user?.username,
        isAdmin,
      },
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket
    socket.on('chat:new', (msg) => {
      setMessages((prev) => [...prev, msg])
      setUnreadCount((prev) => (open ? prev : prev + 1))
    })
    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [isAuthenticated, socketUrl, user?.id, user?.username, isAdmin, open])

  useEffect(() => {
    if (!open || !isAuthenticated) return
    let mounted = true
    api
      .get('/chat/messages', { params: { limit: 150, tmId: user?.id } })
      .then((res) => {
        if (!mounted) return
        setMessages(Array.isArray(res.data) ? res.data : [])
      })
      .catch(() => {
        if (!mounted) return
        setError('채팅 내역을 불러오지 못했습니다.')
      })
    return () => {
      mounted = false
    }
  }, [open, isAuthenticated, user?.id])

  useEffect(() => {
    if (!open) return
    setUnreadCount(0)
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, open])

  const sendMessage = () => {
    const message = text.trim()
    if (!message || !socketRef.current) return
    setSending(true)
    setError('')
    socketRef.current.emit('chat:send', { message }, (result) => {
      setSending(false)
      if (!result?.ok) {
        setError(result?.error || '메시지 전송 실패')
        return
      }
      setText('')
    })
  }

  if (!isAuthenticated) return null

  return (
    <div className={`crm-chat-widget${open ? ' open' : ''}`}>
      {open ? (
        <div className="crm-chat-panel">
          <div className="crm-chat-header">
            <strong>팀 채팅</strong>
            <button type="button" onClick={() => setOpen(false)}>닫기</button>
          </div>
          <div className="crm-chat-list" ref={listRef}>
            {messages.map((msg) => {
              const mine = Number(msg.sender_tm_id) === Number(user?.id)
              return (
                <div key={msg.id} className={`crm-chat-item${mine ? ' mine' : ''}`}>
                  <div className="crm-chat-meta">
                    <span>{msg.sender_name}</span>
                    <span>{formatChatTime(msg.created_at)}</span>
                  </div>
                  <div className="crm-chat-message">{msg.message}</div>
                </div>
              )
            })}
          </div>
          {error ? <div className="crm-chat-error">{error}</div> : null}
          <div className="crm-chat-input-row">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="메시지 입력"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
            />
            <button type="button" onClick={sendMessage} disabled={sending}>
              전송
            </button>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className="crm-chat-toggle"
        onClick={() => {
          setOpen((prev) => {
            const next = !prev
            if (next) setUnreadCount(0)
            return next
          })
        }}
      >
        채팅
        {unreadCount > 0 ? <span className="crm-chat-badge">새 메시지 {unreadCount}</span> : null}
      </button>
    </div>
  )
}
