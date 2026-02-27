import { useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { io } from 'socket.io-client'
import api from '../apiClient'

const GROUP_ROOM_KEY = 'group'
const PAGE_SIZE = 10

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

const parseMaybeJson = (raw) => {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const parseDateTimeLocal = (value) => {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const raw = String(value).trim()
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/)
  if (iso) {
    const local = new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3]),
      Number(iso[4]),
      Number(iso[5]),
      Number(iso[6] || '0')
    )
    return Number.isNaN(local.getTime()) ? null : local
  }
  const plain = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (plain) {
    const local = new Date(
      Number(plain[1]),
      Number(plain[2]) - 1,
      Number(plain[3]),
      Number(plain[4]),
      Number(plain[5]),
      Number(plain[6] || '0')
    )
    return Number.isNaN(local.getTime()) ? null : local
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const formatChatTime = (value) => {
  if (!value) return ''
  const d = parseDateTimeLocal(value)
  if (!d || Number.isNaN(d.getTime())) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

const formatDateTime = (value) => {
  if (!value) return '-'
  const d = parseDateTimeLocal(value)
  if (!d || Number.isNaN(d.getTime())) return String(value)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

const parseMemoStatusMeta = (memo) => {
  const text = String((typeof memo === 'object' && memo !== null ? memo.memo_content : memo) || '').trim()
  const columnTag = String(memo?.status_tag || '').trim()
  const columnReservationText = memo?.status_reservation_at ? formatDateTime(memo.status_reservation_at) : ''
  if (columnTag) {
    return {
      badge: columnTag,
      reservationText: columnReservationText,
      body: text,
    }
  }
  const re = /(예약부도|내원완료|예약)(?:\s+예약일시:([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2}))?/u
  const m = text.match(re)
  if (!m) return { badge: '', reservationText: '', body: text }
  const fullMatch = String(m[0] || '').trim()
  const body = text
    .replace(fullMatch, '')
    .replace(/^\s*\/\s*/, '')
    .trim()
  return {
    badge: m[1] || '',
    reservationText: m[2] || '',
    body,
  }
}

const getSocketUrl = () => {
  const base = import.meta.env.VITE_SOCKET_URL || ''
  if (/^https?:\/\//i.test(base)) {
    return base.replace(/\/+$/i, '')
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
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [sharePickerOpen, setSharePickerOpen] = useState(false)
  const [shareTargetKey, setShareTargetKey] = useState(GROUP_ROOM_KEY)
  const [pendingShareLead, setPendingShareLead] = useState(null)
  const [sharedLeadModal, setSharedLeadModal] = useState({
    open: false,
    loading: false,
    error: '',
    lead: null,
    memos: [],
  })

  const socketRef = useRef(null)
  const listRef = useRef(null)
  const openRef = useRef(open)
  const selectedKeyRef = useRef(GROUP_ROOM_KEY)
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

  useEffect(() => {
    selectedKeyRef.current = selectedKey
  }, [selectedKey])

  useEffect(() => {
    const onShare = (event) => {
      const lead = event?.detail?.lead || null
      if (!lead || !lead.id) return
      setPendingShareLead(lead)
      setShareTargetKey(selectedKey || GROUP_ROOM_KEY)
      setSharePickerOpen(true)
      setOpen(true)
    }

    window.addEventListener('crm:share-lead', onShare)
    return () => window.removeEventListener('crm:share-lead', onShare)
  }, [selectedKey])

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

  const fetchMessages = async ({
    targetRoom = selectedRoom,
    appendOlder = false,
    beforeId = null,
  } = {}) => {
    if (!isAuthenticated || !user?.id) return []
    const params = {
      limit: PAGE_SIZE,
      tmId: user.id,
    }
    if (targetRoom.type === 'direct' && targetRoom.tmId) {
      params.targetTmId = targetRoom.tmId
    }
    if (beforeId) {
      params.beforeId = beforeId
    }
    const res = await api.get('/chat/messages', { params })
    const rows = Array.isArray(res.data) ? res.data : []
    if (appendOlder) {
      setMessages((prev) => [...rows, ...prev])
    } else {
      setMessages(rows)
    }
    setHasMore(rows.length === PAGE_SIZE)
    return rows
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
      const sameRoomOpen = openRef.current && roomKey === selectedKeyRef.current

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
  }, [isAuthenticated, socketUrl, user?.id, user?.username, isAdmin])

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
    setHasMore(false)

    fetchMessages({ targetRoom: selectedRoom })
      .then((nextMessages) => {
        if (!mounted || roomFetchSeqRef.current !== fetchSeq) return
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
  }, [selectedKey, open])

  useEffect(() => {
    if (!open || !listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages.length, open])

  const handleChatScroll = async () => {
    const node = listRef.current
    if (!node || loadingMore || !hasMore || messages.length === 0) return
    if (node.scrollTop > 40) return

    const beforeId = Number(messages[0]?.id || 0)
    if (!beforeId) return
    const prevHeight = node.scrollHeight
    setLoadingMore(true)
    try {
      const olderRows = await fetchMessages({
        targetRoom: selectedRoom,
        appendOlder: true,
        beforeId,
      })
      if (olderRows.length > 0 && listRef.current) {
        const nextHeight = listRef.current.scrollHeight
        listRef.current.scrollTop = nextHeight - prevHeight + listRef.current.scrollTop
      }
    } catch {
      // ignore
    } finally {
      setLoadingMore(false)
    }
  }

  const sendMessage = () => {
    const message = text.trim()
    if (!message || !socketRef.current) return

    const payload = { message, messageType: 'text' }
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

  const closeSharePicker = () => {
    setSharePickerOpen(false)
    setPendingShareLead(null)
  }

  const handleShareSubmit = () => {
    if (!pendingShareLead?.id || !socketRef.current) return
    const isGroup = shareTargetKey === GROUP_ROOM_KEY
    const targetTmId = isGroup
      ? null
      : Number(String(shareTargetKey).replace('direct:', ''))
    if (!isGroup && !targetTmId) return

    const payload = {
      messageType: 'lead_share',
      message: `${pendingShareLead['이름'] || pendingShareLead.name || '-'} 고객 DB 공유`,
      sharedLeadId: Number(pendingShareLead.id),
      sharedPayload: {
        name: pendingShareLead['이름'] || pendingShareLead.name || '',
        phone: pendingShareLead['연락처'] || pendingShareLead.phone || '',
        event_name: pendingShareLead['이벤트'] || pendingShareLead.event_name || '',
      },
    }
    if (targetTmId) {
      payload.targetTmId = targetTmId
    }

    socketRef.current.emit('chat:send', payload, (result) => {
      if (!result?.ok) {
        setError(result?.error || '공유 전송 실패')
        return
      }
      closeSharePicker()
    })
  }

  const openSharedLead = async (leadId) => {
    if (!leadId || !user?.id) return
    setSharedLeadModal({
      open: true,
      loading: true,
      error: '',
      lead: null,
      memos: [],
    })
    try {
      const res = await api.get(`/chat/lead/${leadId}`, { params: { tmId: user.id } })
      setSharedLeadModal({
        open: true,
        loading: false,
        error: '',
        lead: res.data?.lead || null,
        memos: Array.isArray(res.data?.memos) ? res.data.memos : [],
      })
    } catch {
      setSharedLeadModal({
        open: true,
        loading: false,
        error: '공유된 DB를 불러오지 못했습니다.',
        lead: null,
        memos: [],
      })
    }
  }

  const renderMessageBody = (msg) => {
    if (String(msg?.message_type || 'text') !== 'lead_share') {
      return <div className="crm-chat-message">{msg.message}</div>
    }
    const snapshot = parseMaybeJson(msg?.shared_payload)
    const name = snapshot?.name || msg?.message || '공유 DB'
    const phone = snapshot?.phone || '-'
    const eventName = snapshot?.event_name || '-'
    return (
      <button
        type="button"
        className="crm-chat-share-card"
        onClick={() => openSharedLead(Number(msg?.shared_lead_id || 0))}
      >
        <div className="crm-chat-share-title">공유 DB</div>
        <div className="crm-chat-share-line">{name}</div>
        <div className="crm-chat-share-line">{phone}</div>
        <div className="crm-chat-share-line">{eventName}</div>
      </button>
    )
  }

  if (!isAuthenticated) return null

  return (
    <>
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
              <div className="crm-chat-list" ref={listRef} onScroll={handleChatScroll}>
                {loadingMore ? <div className="crm-chat-loading-more">이전 대화 불러오는 중..</div> : null}
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
                      {renderMessageBody(msg)}
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
            <span className="crm-chat-badge">새메시지 {unreadCount}</span>
          ) : null}
        </button>
      </div>

      {sharePickerOpen && pendingShareLead ? (
        <div className="tm-lead-modal">
          <div className="tm-lead-backdrop" onClick={closeSharePicker} />
          <div className="tm-lead-card crm-chat-share-picker">
            <div className="tm-lead-header">
              <h3>DB 공유</h3>
              <button type="button" onClick={closeSharePicker}>닫기</button>
            </div>
            <div className="tm-lead-form">
              <label>
                공유 대상 채팅방
                <select
                  value={shareTargetKey}
                  onChange={(e) => setShareTargetKey(e.target.value)}
                >
                  <option value={GROUP_ROOM_KEY}>단체 채팅방</option>
                  {users.map((tm) => (
                    <option key={tm.id} value={getDirectRoomKey(tm.id)}>
                      {tm.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="crm-chat-share-preview">
                <div>이름: {pendingShareLead['이름'] || pendingShareLead.name || '-'}</div>
                <div>연락처: {pendingShareLead['연락처'] || pendingShareLead.phone || '-'}</div>
                <div>이벤트: {pendingShareLead['이벤트'] || pendingShareLead.event_name || '-'}</div>
              </div>
            </div>
            <div className="tm-lead-actions">
              <button type="button" onClick={closeSharePicker}>취소</button>
              <button type="button" onClick={handleShareSubmit}>공유 전송</button>
            </div>
          </div>
        </div>
      ) : null}

      {sharedLeadModal.open ? (
        <div className="tm-lead-modal">
          <div
            className="tm-lead-backdrop"
            onClick={() =>
              setSharedLeadModal({
                open: false,
                loading: false,
                error: '',
                lead: null,
                memos: [],
              })
            }
          />
          <div className="tm-lead-card crm-chat-readonly-modal">
            <div className="tm-lead-header">
              <h3>공유 DB 상세</h3>
              <button
                type="button"
                onClick={() =>
                  setSharedLeadModal({
                    open: false,
                    loading: false,
                    error: '',
                    lead: null,
                    memos: [],
                  })
                }
              >
                닫기
              </button>
            </div>
            {sharedLeadModal.loading ? (
              <div className="tm-lead-memos-empty">불러오는 중..</div>
            ) : sharedLeadModal.error ? (
              <div className="db-list-error">{sharedLeadModal.error}</div>
            ) : (
              <div className="tm-lead-body">
                <div className="tm-lead-left">
                  <div className="tm-lead-memos">
                    <div className="tm-lead-memos-title">메모 히스토리</div>
                    {sharedLeadModal.memos.length === 0 ? (
                      <div className="tm-lead-memos-empty">메모가 없습니다.</div>
                    ) : (
                      <div className="tm-lead-memos-list">
                        {sharedLeadModal.memos.map((memo) => (
                          <div key={memo.id} className="tm-lead-memo">
                            <div className="tm-lead-memo-time">{formatDateTime(memo.memo_time)}</div>
                            {(() => {
                              const parsed = parseMemoStatusMeta(memo)
                              const reservationText = String(parsed.reservationText || '').trim()
                              const badgeClassMap = {
                                예약: 'tm-lead-memo-badge is-reserved',
                                예약부도: 'tm-lead-memo-badge is-noshow',
                                내원완료: 'tm-lead-memo-badge is-visited',
                                부재중: 'tm-lead-memo-badge is-missed',
                                리콜대기: 'tm-lead-memo-badge is-recall',
                                무효: 'tm-lead-memo-badge is-invalid',
                                실패: 'tm-lead-memo-badge is-failed',
                              }
                              const badgeClass = badgeClassMap[parsed.badge] || 'tm-lead-memo-badge'
                              return parsed.badge ? (
                                <div className="tm-lead-memo-status">
                                  <span className={badgeClass}>{parsed.badge}</span>
                                  {reservationText ? (
                                    <span className="tm-lead-memo-status-time">예약일시: {reservationText}</span>
                                  ) : null}
                                </div>
                              ) : null
                            })()}
                            <div className="tm-lead-memo-content">{parseMemoStatusMeta(memo).body || memo.memo_content}</div>
                            <div className="tm-lead-memo-time">
                              작성 TM: {memo.tm_name || memo.tm_id || '-'}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="tm-lead-right">
                  <div className="tm-lead-summary-card">
                    <div className="tm-lead-summary-label">인입날짜</div>
                    <div className="tm-lead-summary-value">{formatDateTime(sharedLeadModal.lead?.inbound_at)}</div>
                  </div>
                  <div className="tm-lead-summary-card">
                    <div className="tm-lead-summary-label">이름</div>
                    <div className="tm-lead-summary-value">{sharedLeadModal.lead?.name || '-'}</div>
                  </div>
                  <div className="tm-lead-summary-card">
                    <div className="tm-lead-summary-label">연락처</div>
                    <div className="tm-lead-summary-value">{sharedLeadModal.lead?.phone || '-'}</div>
                  </div>
                  <div className="tm-lead-summary-card">
                    <div className="tm-lead-summary-label">이벤트</div>
                    <div className="tm-lead-summary-value">{sharedLeadModal.lead?.event_name || '-'}</div>
                  </div>
                  <div className="tm-lead-summary-card">
                    <div className="tm-lead-summary-label">상태</div>
                    <div className="tm-lead-summary-value">{sharedLeadModal.lead?.status_name || '-'}</div>
                  </div>
                  <div className="tm-lead-summary-card">
                    <div className="tm-lead-summary-label">예약/내원일시</div>
                    <div className="tm-lead-summary-value">{formatDateTime(sharedLeadModal.lead?.reservation_at)}</div>
                  </div>
                  <div className="tm-lead-summary-card">
                    <div className="tm-lead-summary-label">리콜 예정일시</div>
                    <div className="tm-lead-summary-value">{formatDateTime(sharedLeadModal.lead?.recall_at)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}

