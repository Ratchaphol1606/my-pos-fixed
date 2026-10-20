"use client"
import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/src/lib/supabase'

// Live customer display built on Supabase Broadcast.
//
//   POS screen (cashier device)  --(broadcast "state")-->  /display (iPad)
//   /display                     --(broadcast "hello")-->  POS screen
//
// The POS screen publishes a small snapshot of what the customer should
// see (cart, payment step, QR, "paid") every time it changes. The display
// page just renders the latest snapshot; it never touches the database.
// Both sides join the channel `display:<pairCode>`, and the random pair
// code is the only thing that separates one station from another.

const PAIR_KEY = 'pos_display_code'
// No 0/O/1/I/L — easy to read off a screen and type by hand.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generatePairCode(length = 6): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => CODE_CHARS[b % CODE_CHARS.length]).join('')
}

export function normalizePairCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// The POS screen keeps one stable code per device so the display
// doesn't need re-pairing after every reload.
export function getOrCreatePairCode(): string {
  try {
    const saved = localStorage.getItem(PAIR_KEY)
    if (saved) return saved
    const fresh = generatePairCode()
    localStorage.setItem(PAIR_KEY, fresh)
    return fresh
  } catch {
    return generatePairCode()
  }
}

export function resetPairCode(): string {
  const fresh = generatePairCode()
  try { localStorage.setItem(PAIR_KEY, fresh) } catch { /* ignore */ }
  return fresh
}

export type DisplayStage = 'idle' | 'cart' | 'paying' | 'paid'
export type DisplayPayMethod = 'cash' | 'transfer' | 'wallet'

export interface DisplayLine {
  name: string
  qty: number
  price: number
}

// Everything here is shown to the customer, so it deliberately leaves
// out cost prices, stock levels and phone numbers.
export interface DisplayState {
  stage: DisplayStage
  shopName: string
  lines: DisplayLine[]
  subtotal: number
  discount: number
  total: number
  customerName?: string
  pointsEarned?: number
  payment?: {
    method: DisplayPayMethod
    received?: number
    change?: number
    qrPayload?: string
    govShare?: number
    userShare?: number
  }
  paid?: {
    total: number
    change: number
    method: DisplayPayMethod
    pointsEarned?: number
  }
  // Changes every time an item is added, so the display can flash it.
  lastAdded?: { name: string; at: number }
}

function isDisplayState(v: unknown): v is DisplayState {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<DisplayState>
  return typeof s.stage === 'string' && Array.isArray(s.lines) && typeof s.total === 'number'
}

type Role = 'pos' | 'display'

// Joins the channel, tracks presence by role, and reports whether the
// *other* role is currently online.
function useRelayChannel(
  pairCode: string | null,
  role: Role,
  bind: (channel: RealtimeChannel) => void,
) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const bindRef = useRef(bind)
  const [subscribed, setSubscribed] = useState(false)
  const [peerOnline, setPeerOnline] = useState(false)

  useEffect(() => { bindRef.current = bind })

  useEffect(() => {
    if (!pairCode) return
    const channel = supabase.channel(`display:${pairCode}`, {
      config: { broadcast: { self: false }, presence: { key: `${role}-${Math.random().toString(36).slice(2, 8)}` } },
    })
    channelRef.current = channel

    bindRef.current(channel)

    channel.on('presence', { event: 'sync' }, () => {
      const peers = Object.keys(channel.presenceState()).filter(k => !k.startsWith(`${role}-`))
      setPeerOnline(peers.length > 0)
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setSubscribed(true)
        await channel.track({ role, at: Date.now() })
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setSubscribed(false)
        setPeerOnline(false)
      }
    })

    return () => {
      setSubscribed(false)
      setPeerOnline(false)
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [pairCode, role])

  return { channelRef, subscribed, peerOnline }
}

// POS screen side: publishes the snapshot whenever it changes, and again
// whenever a display joins or asks for it.
export function useDisplayBroadcaster(pairCode: string | null, state: DisplayState) {
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state })

  const { channelRef, subscribed, peerOnline } = useRelayChannel(pairCode, 'pos', (channel) => {
    channel.on('broadcast', { event: 'hello' }, () => {
      channel.send({ type: 'broadcast', event: 'state', payload: stateRef.current })
    })
  })

  const json = JSON.stringify(state)
  useEffect(() => {
    if (!subscribed) return
    channelRef.current?.send({ type: 'broadcast', event: 'state', payload: stateRef.current })
  }, [json, subscribed, peerOnline, channelRef])

  return { connected: subscribed, displayOnline: peerOnline }
}

// Display side: renders the latest snapshot. `onItemAdded` fires when the
// POS adds an item (not for the first snapshot after connecting).
export function useDisplayReceiver(pairCode: string | null, onItemAdded?: (name: string) => void) {
  const [state, setState] = useState<DisplayState | null>(null)
  const onAddedRef = useRef(onItemAdded)
  useEffect(() => { onAddedRef.current = onItemAdded })
  const lastAtRef = useRef<number | null | undefined>(undefined)

  const { channelRef, subscribed, peerOnline } = useRelayChannel(pairCode, 'display', (channel) => {
    channel.on('broadcast', { event: 'state' }, ({ payload }) => {
      if (!isDisplayState(payload)) return
      const at = payload.lastAdded?.at ?? null
      if (lastAtRef.current !== undefined && at !== null && at !== lastAtRef.current) {
        onAddedRef.current?.(payload.lastAdded!.name)
      }
      lastAtRef.current = at
      setState(payload)
    })
  })

  // Ask the POS for the current snapshot once we're in (and again if the
  // POS comes back online).
  useEffect(() => {
    if (!subscribed) return
    channelRef.current?.send({ type: 'broadcast', event: 'hello', payload: {} })
  }, [subscribed, peerOnline, channelRef])

  return { state, connected: subscribed, posOnline: peerOnline }
}
