import axios from 'axios'

const baseURL = '/api'
const SESSION_EXPIRED_EVENT = 'crm:session-expired'
let sessionExpiredNotified = false

export const api = axios.create({
  baseURL,
  withCredentials: true,
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status
    const requestUrl = String(error?.config?.url || '')
    const isAuthEndpoint =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/logout')

    if (status === 401 && !isAuthEndpoint && !sessionExpiredNotified) {
      sessionExpiredNotified = true
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
    }

    return Promise.reject(error)
  }
)

export default api
