"use client"
import { createContext, useContext } from 'react'

export type Role = 'admin' | 'cashier' | null

// Unchanged: every page that calls useRole() keeps working as before.
export const RoleContext = createContext<Role>(null)

export const useRole = () => useContext(RoleContext)

// Who is logged in, plus the two ways to leave:
//   lock()    back to the PIN screen (same person, quick)
//   logout()  back to the username/password screen (change user)
export type AuthUser = {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'cashier'
}

export type AuthApi = {
  user: AuthUser | null
  lock: () => void
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthApi>({
  user: null,
  lock: () => {},
  logout: async () => {},
})

export const useAuth = () => useContext(AuthContext)
