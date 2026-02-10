import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import api from '../apiClient'

const CLIENT_COOKIE = 'crm_auth'
const CLIENT_ROLE = 'crm_auth_role'
const CLIENT_USER = 'crm_auth_user'
const CLIENT_USER_ID = 'crm_auth_user_id'

const setClientCookie = (value) => {
  const maxAge = 60 * 60
  document.cookie = `${CLIENT_COOKIE}=${value}; path=/; max-age=${maxAge}; samesite=lax`
}

const setClientRole = (isAdmin) => {
  localStorage.setItem(CLIENT_ROLE, isAdmin ? 'admin' : 'user')
}

const clearClientRole = () => {
  localStorage.removeItem(CLIENT_ROLE)
}

const setClientUser = (username) => {
  if (username) {
    localStorage.setItem(CLIENT_USER, username)
  }
}

const setClientUserId = (id) => {
  if (id !== undefined && id !== null && id !== '') {
    localStorage.setItem(CLIENT_USER_ID, String(id))
  }
}

const clearClientUser = () => {
  localStorage.removeItem(CLIENT_USER)
}

const clearClientUserId = () => {
  localStorage.removeItem(CLIENT_USER_ID)
}

const clearClientCookie = () => {
  document.cookie = `${CLIENT_COOKIE}=; path=/; max-age=0; samesite=lax`
}

const readClientCookie = () => {
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CLIENT_COOKIE}=`))
    ?.split('=')[1]
}

const readClientRole = () => {
  return localStorage.getItem(CLIENT_ROLE)
}

const readClientUser = () => {
  return localStorage.getItem(CLIENT_USER)
}

const readClientUserId = () => {
  return localStorage.getItem(CLIENT_USER_ID)
}

export const login = createAsyncThunk(
  'auth/login',
  async ({ username, password }, { rejectWithValue }) => {
    try {
      const response = await api.post(
        '/auth/login',
        { username, password },
        { withCredentials: true }
      )
      setClientCookie('1')
      setClientRole(Boolean(response.data?.isAdmin))
      setClientUser(response.data?.username)
      setClientUserId(response.data?.id)
      return response.data
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data ||
        error?.message ||
        '로그인에 실패했습니다.'
      return rejectWithValue(message)
    }
  }
)

export const logout = createAsyncThunk(
  'auth/logout',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.post('/auth/logout', null, {
        withCredentials: true,
      })
      clearClientCookie()
      clearClientRole()
      clearClientUser()
      clearClientUserId()
      return response.data
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data ||
        error?.message ||
        '로그아웃에 실패했습니다.'
      return rejectWithValue(message)
    }
  }
)

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    status: 'idle',
    error: null,
    user: readClientUser()
      ? { id: readClientUserId(), username: readClientUser() }
      : null,
    isAdmin: readClientRole() === 'admin',
    isAuthenticated: readClientCookie() === '1',
  },
  reducers: {
    syncFromCookie(state) {
      state.isAuthenticated = readClientCookie() === '1'
    },
    setUser(state, action) {
      const nextUser = action.payload || null
      state.user = nextUser
      if (nextUser?.username) {
        setClientUser(nextUser.username)
      } else {
        clearClientUser()
      }
      if (nextUser?.id !== undefined && nextUser?.id !== null && nextUser?.id !== '') {
        setClientUserId(nextUser.id)
      } else {
        clearClientUserId()
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.error = null
        state.user = action.payload || null
        state.isAdmin = Boolean(action.payload?.isAdmin)
        state.isAuthenticated = true
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload || '로그인에 실패했습니다.'
        state.isAdmin = false
        state.isAuthenticated = false
      })
      .addCase(logout.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(logout.fulfilled, (state) => {
        state.status = 'idle'
        state.error = null
        state.user = null
        state.isAdmin = false
        state.isAuthenticated = false
      })
      .addCase(logout.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload || '로그아웃에 실패했습니다.'
      })
  },
})

export const { syncFromCookie, setUser } = authSlice.actions
export default authSlice.reducer
