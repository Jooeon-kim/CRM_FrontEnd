import { configureStore } from '@reduxjs/toolkit'
import mainReducer from './mainSlice'
import authReducer from './authSlice'

export const store = configureStore({
  reducer: {
    main: mainReducer,
    auth: authReducer,
  },
})
