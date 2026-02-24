import { createSlice } from '@reduxjs/toolkit'

const mainSlice = createSlice({
  name: 'main',
  initialState: {
    tmDbCache: {},
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
  },
})

export const { setTmDbCache, patchTmDbLead } = mainSlice.actions
export default mainSlice.reducer
