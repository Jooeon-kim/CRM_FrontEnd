import { useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { io } from 'socket.io-client'
import api from '../apiClient'

const GROUP_ROOM_KEY = 'group'
const getDirectRoomKey = (tmId) => `direct:${tmId}`
const getLastReadStorageKey = (tmId) => `crm_chat_last_read_${tmId}`

const parseLastReadMap = (raw) => {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

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

const getMessageRoomKey = (msg, myTmId) => {
  const isGroup = Number(msg?.is_group || 0) === 1 || !msg?.target_tm_id
  if (isGroup) return GROUP_ROOM_KEY
  const senderId = Number(msg?.sender_tm_id || 0)
  const targetId = Number(msg?.target_tm_id || 0)
  const otherId = senderId === Number(myTmId) ? targetId : senderId
  return getDirectRoomKey(otherId)
}

const calculateUnreadMap = (allMessages, myTmId, lastReadMap) => {
  const next = {}
  ;(allMessages || []).forEach((msg) => {
    if (Number(msg?.sender_tm_id || 0) === Number(myTmId)) return
    const roomKey = getMessageRoomKey(msg, myTmId)
    const lastReadId = Number(lastReadMap?.[roomKey] || 0)
    if (Number(msg?.id || 0) > lastReadId) {
      next[roomKey] = Number(next[roomKey] || 0) + 1
    }
  })
  return next
}

export default function ChatWidget() {
  const { isAuthenticated, user, isAdmin } = useSelector((state) => state.auth)
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState([])
  const [messages, setMessages] = useState([])
  const [selectedRoom, setSelectedRoom] = useState({
    type: 'group',
    tmId: null,
    label: '단체 채팅방',
  })
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [unreadMap, setUnreadMap] = useState({})
  const socketRef = useRef(null)
  const listRef = useRef(null)
  const openRef = useRef(open)
  const roomFetchSeqRef = useRef(0)

  const socketUrl = useMemo(() => getSocketUrl(), [])
  const selectedKey =
    selectedRoom.type === 'group'
      ? GROUP_ROOM_KEY
      : getDirectRoomKey(selectedRoom.tmId)
  const unreadCount = Object.values(unreadMap).reduce(
    (sum, v) => sum + Number(v || 0),
    0
  )

  useEffect(() => {
    openRef.current = open
  }, [open])

  const markRoomAsRead = (roomKey, roomMessages = []) => {
    if (!user?.id || !roomKey) return
    const maxId = (roomMessages || []).reduce(
      (max, msg) => Math.max(max, Number(msg?.id || 0)),
      0
    )
    if (!maxId) return
    const storageKey = getLastReadStorageKey(user.id)
    const current = parseLastReadMap(localStorage.getItem(storageKey))
    const prevRead = Number(current?.[roomKey] || 0)
    if (maxId > prevRead) {
      current[roomKey] = maxId
      localStorage.setItem(storageKey, JSON.stringify(current))
    }
    setUnreadMap((prev) => ({ ...prev, [roomKey]: 0 }))
  }

  const markRoomAsReadById = (roomKey, messageId) => {
    if (!user?.id || !roomKey) return
    const maxId = Number(messageId || 0)
    const storageKey = getLastReadStorageKey(user.id)
    const current = parseLastReadMap(localStorage.getItem(storageKey))
    const prevRead = Number(current?.[roomKey] || 0)
    if (maxId > prevRead) {
      current[roomKey] = maxId
      localStorage.setItem(storageKey, JSON.stringify(current))
    }
    setUnreadMap((prev) => ({ ...prev, [roomKey]: 0 }))
  }

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return undefined
    const socket = io(socketUrl, {
      withCredentials: true,
      auth: {
        tmId: user.id,
        username: user.username,
        isAdmin,
      },
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket

    socket.on('chat:new', (msg) => {
      const roomKey = getMessageRoomKey(msg, user.id)
      const sameRoomOpen = openRef.current && roomKey === selectedKey

      if (sameRoomOpen) {
        setMessages((prev) => [...prev, msg])
        markRoomAsReadById(roomKey, msg?.id)
        return
      }

      setUnreadMap((prev) => ({
        ...prev,
        [roomKey]: Number(prev[roomKey] || 0) + 1,
      }))
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [isAuthenticated, socketUrl, user?.id, user?.username, isAdmin, selectedKey])

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return
    let mounted = true

    Promise.all([
      api.get('/chat/users', { params: { tmId: user.id } }),
      api.get('/chat/messages', {
        params: { limit: 300, tmId: user.id, scope: 'all' },
      }),
    ])
      .then(([usersRes, allMessagesRes]) => {
        if (!mounted) return
        const usersList = Array.isArray(usersRes.data) ? usersRes.data : []
        const allMessages = Array.isArray(allMessagesRes.data)
          ? allMessagesRes.data
          : []
        setUsers(usersList)

        const storageKey = getLastReadStorageKey(user.id)
        const storedMap = parseLastReadMap(localStorage.getItem(storageKey))
        const hasStored = Object.keys(storedMap).length > 0

        if (!hasStored) {
          const baseline = {}
          allMessages.forEach((msg) => {
            const key = getMessageRoomKey(msg, user.id)
            baseline[key] = Math.max(
              Number(baseline[key] || 0),
              Number(msg?.id || 0)
            )
          })
          localStorage.setItem(storageKey, JSON.stringify(baseline))
          setUnreadMap({})
        } else {
          setUnreadMap(calculateUnreadMap(allMessages, user.id, storedMap))
        }
      })
      .catch(() => {
        if (!mounted) return
        setError('채팅 내역을 불러오지 못했습니다.')
      })

    return () => {
      mounted = false
    }
  }, [isAuthenticated, user?.id])

  useEffect(() => {
    if (!open || !isAuthenticated || !user?.id) return
    let mounted = true
    const fetchSeq = roomFetchSeqRef.current + 1
    roomFetchSeqRef.current = fetchSeq
    setError('')
    setMessages([])

    const params = {
      limit: 150,
      tmId: user.id,
    }
    if (selectedRoom.type === 'direct' && selectedRoom.tmId) {
      params.targetTmId = selectedRoom.tmId
    }

    api
      .get('/chat/messages', { params })
      .then((res) => {
        if (!mounted || roomFetchSeqRef.current !== fetchSeq) return
        const nextMessages = Array.isArray(res.data) ? res.data : []
        setMessages(nextMessages)
        markRoomAsRead(selectedKey, nextMessages)
      })
      .catch(() => {
        if (!mounted || roomFetchSeqRef.current !== fetchSeq) return
        setError('채팅 내역을 불러오지 못했습니다.')
      })

    return () => {
      mounted = false
    }
  }, [
    open,
    isAuthenticated,
    user?.id,
    selectedRoom.type,
    selectedRoom.tmId,
    selectedKey,
  ])

  useEffect(() => {
    if (!open || !listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, open])

  const sendMessage = () => {
    const message = text.trim()
    if (!message || !socketRef.current) return

    const payload = { message }
    if (selectedRoom.type === 'direct' && selectedRoom.tmId) {
      payload.targetTmId = selectedRoom.tmId
    }

    setSending(true)
    setError('')
    socketRef.current.emit('chat:send', payload, (result) => {
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
        <div className="crm-chat-panel crm-chat-panel-with-rooms">
          <div className="crm-chat-rooms">
            <div className="crm-chat-rooms-title">개인 채팅</div>
            <div className="crm-chat-room-list">
              {users.map((tm) => {
                const key = getDirectRoomKey(tm.id)
                const unread = Number(unreadMap[key] || 0)
                return (
                  <button
                    key={tm.id}
                    type="button"
                    className={`crm-chat-room-item${
                      selectedRoom.type === 'direct' &&
                      Number(selectedRoom.tmId) === Number(tm.id)
                        ? ' active'
                        : ''
                    }`}
                    onClick={() =>
                      setSelectedRoom({
                        type: 'direct',
                        tmId: tm.id,
                        label: tm.name,
                      })
                    }
                  >
                    <span className="crm-chat-room-label">
                      {tm.name}
                      {Number(tm.isAdmin) === 1 ? (
                        <span className="crm-chat-room-role">관리자</span>
                      ) : null}
                    </span>
                    {unread > 0 ? (
                      <span className="crm-chat-room-unread">{unread}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              className={`crm-chat-room-item crm-chat-room-group${
                selectedRoom.type === 'group' ? ' active' : ''
              }`}
              onClick={() =>
                setSelectedRoom({
                  type: 'group',
                  tmId: null,
                  label: '단체 채팅방',
                })
              }
            >
              <span>단체 채팅방</span>
              {Number(unreadMap[GROUP_ROOM_KEY] || 0) > 0 ? (
                <span className="crm-chat-room-unread">
                  {Number(unreadMap[GROUP_ROOM_KEY] || 0)}
                </span>
              ) : null}
            </button>
          </div>
          <div className="crm-chat-main">
            <div className="crm-chat-header">
              <strong>{selectedRoom.label}</strong>
              <button type="button" onClick={() => setOpen(false)}>
                닫기
              </button>
            </div>
            <div className="crm-chat-list" ref={listRef}>
              {messages.map((msg) => {
                const mine = Number(msg.sender_tm_id) === Number(user?.id)
                return (
                  <div
                    key={msg.id}
                    className={`crm-chat-item${mine ? ' mine' : ''}`}
                  >
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
        </div>
      ) : null}
      <button
        type="button"
        className="crm-chat-toggle"
        onClick={() => setOpen((prev) => !prev)}
      >
        채팅
        {unreadCount > 0 ? (
          <span className="crm-chat-badge">새 메시지 {unreadCount}</span>
        ) : null}
      </button>
    </div>
  )
}
