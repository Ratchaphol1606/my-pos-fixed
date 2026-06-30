"use client"
import { createContext, useContext } from 'react'

export type Role = 'admin' | 'cashier' | null

export const RoleContext = createContext<Role>(null)

export const useRole = () => useContext(RoleContext)
