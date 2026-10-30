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
  // Promotion applied to this line (price × qty minus `saving` is what's charged)
  promo?: string
  saving?: number
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
  // Bill-level promotion, e.g. spend ฿1,000 get ฿50 off
  billPromo?: { name: string; saving: number }
  // Member's balance before this bill, and points used on it.
  pointsBalance?: number
  pointsRedeemed?: number
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
    // Member's balance after this bill (members only).
    pointsBalance?: number
    // When the sale finished, so the display can time out the thank-you
    // screen itself even if the POS tab was asleep and never cleared it.
    at?: number
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
  // Bumping `attempt` tears the channel down and joins a fresh one.
  const [attempt, setAttempt] = useState(0)
  const retryCountRef = useRef(0)
  const subscribedRef = useRef(false)

  useEffect(() => { bindRef.current = bind })

  // A sleeping iPad or a dropped Wi-Fi can leave the socket dead without a
  // useful status event. Rejoin as soon as the page is visible / online again.
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === 'visible' && !subscribedRef.current) {
        setAttempt(a => a + 1)
      }
    }
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)
    return () => {
      window.removeEventListener('online', wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [])

  useEffect(() => {
    if (!pairCode) return
    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
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
      // Ignore events from a channel we've already replaced or removed
      // (removeChannel itself reports CLOSED).
      if (disposed) return
      if (status === 'SUBSCRIBED') {
        retryCountRef.current = 0
        subscribedRef.current = true
        setSubscribed(true)
        await channel.track({ role, at: Date.now() })
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        subscribedRef.current = false
        setSubscribed(false)
        setPeerOnline(false)
        if (!retryTimer) {
          // Exponential backoff: 1s, 2s, 4s ... capped at 15s.
          const delay = Math.min(1000 * 2 ** retryCountRef.current, 15000)
          retryCountRef.current += 1
          retryTimer = setTimeout(() => setAttempt(a => a + 1), delay)
        }
      }
    })

    return () => {
      disposed = true
      if (retryTimer) clearTimeout(retryTimer)
      subscribedRef.current = false
      setSubscribed(false)
      setPeerOnline(false)
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [pairCode, role, attempt])

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
  // False from the moment the link drops until the POS sends a new
  // snapshot, so a reconnecting display never shows a stale cart.
  const [fresh, setFresh] = useState(false)
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
      setFresh(true)
    })
  })

  // Ask the POS for the current snapshot once we're in (and again if the
  // POS comes back online).
  useEffect(() => {
    if (!subscribed) return
    channelRef.current?.send({ type: 'broadcast', event: 'hello', payload: {} })
  }, [subscribed, peerOnline, channelRef])

  // Link lost: whatever we have is no longer trustworthy.
  useEffect(() => {
    if (subscribed && peerOnline) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFresh(false)
  }, [subscribed, peerOnline])

  return { state, connected: subscribed, posOnline: peerOnline, ready: fresh }
}