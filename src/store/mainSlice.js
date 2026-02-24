import { createSlice } from '@reduxjs/toolkit'

const mainSlice = createSlice({
  name: 'main',
  initialState: {
    tmDbCache: {},
    calendarCache: {
      tmBase: {},
      tmMonth: {},
      adminBase: null,
      adminMonth: {},
    },
  },
  reducers: {
    setTmDbCache(state, action) {
      const { key, rows, fetchedAt } = action.payload || {}
      if (!key) return
      state.tmDbCache[key] = {
        rows: Array.isArray(rows) ? rows : [],
        fetchedAt: Number(fetchedAt || Date.now()),
      }
    },
    patchTmDbLead(state, action) {
      const { tmId, leadId, patch } = action.payload || {}
      const targetTmId = String(tmId || '')
      const targetLeadId = String(leadId || '')
      if (!targetTmId || !targetLeadId || !patch || typeof patch !== 'object') return

      Object.keys(state.tmDbCache || {}).forEach((key) => {
        // cache key format: tm:{tmId}:status:{status}:assigned:{0|1}
        if (!String(key).startsWith(`tm:${targetTmId}:`)) return
        const entry = state.tmDbCache[key]
        if (!entry || !Array.isArray(entry.rows)) return
        entry.rows = entry.rows.map((row) =>
          String(row?.id || '') === targetLeadId
            ? { ...row, ...patch }
            : row
        )
      })
    },
    setTmCalendarBase(state, action) {
      const { tmId, rows, fetchedAt } = action.payload || {}
      const key = String(tmId || '')
      if (!key) return
      state.calendarCache.tmBase[key] = {
        rows: Array.isArray(rows) ? rows : [],
        fetchedAt: Number(fetchedAt || Date.now()),
      }
    },
    setTmCalendarMonth(state, action) {
      const { tmId, monthKey, schedules, companySchedules, fetchedAt } = action.payload || {}
      const key = `${String(tmId || '')}:${String(monthKey || '')}`
      if (!key || key === ':') return
      state.calendarCache.tmMonth[key] = {
        schedules: Array.isArray(schedules) ? schedules : [],
        companySchedules: Array.isArray(companySchedules) ? companySchedules : [],
        fetchedAt: Number(fetchedAt || Date.now()),
      }
    },
    setAdminCalendarBase(state, action) {
      const { reservations, agents, fetchedAt } = action.payload || {}
      state.calendarCache.adminBase = {
        reservations: Array.isArray(reservations) ? reservations : [],
        agents: Array.isArray(agents) ? agents : [],
        fetchedAt: Number(fetchedAt || Date.now()),
      }
    },
    setAdminCalendarMonth(state, action) {
      const { monthKey, schedules, companySchedules, fetchedAt } = action.payload || {}
      const key = String(monthKey || '')
      if (!key) return
      state.calendarCache.adminMonth[key] = {
        schedules: Array.isArray(schedules) ? schedules : [],
        companySchedules: Array.isArray(companySchedules) ? companySchedules : [],
        fetchedAt: Number(fetchedAt || Date.now()),
      }
    },
  },
})

export const {
  setTmDbCache,
  patchTmDbLead,
  setTmCalendarBase,
  setTmCalendarMonth,
  setAdminCalendarBase,
  setAdminCalendarMonth,
} = mainSlice.actions
export default mainSlice.reducer
