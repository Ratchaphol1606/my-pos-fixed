"use client"
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/src/lib/supabase'

// Realtime scan relay built on Supabase Broadcast.
//
//   scanner device  --(broadcast "scan")-->  POS screen (iPad)
//   scanner device  <--(broadcast "result")--  POS screen (iPad)
//
// Both sides join the channel `scan-relay:<pairCode>`. The pair code is
// the only thing separating one station from another, so it is random
// and not guessable. Broadcast is fire-and-forget (nothing is stored),
// so the POS screen reports "found / notfound" back and the scanner
// can show whether each scan actually landed.

const PAIR_KEY = 'pos_pair_code'
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

// The POS screen keeps one stable code per device so the scanner
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

export interface ScanResult {
  code: string
  status: 'found' | 'notfound'
  name?: string
}

type Role = 'pos' | 'scanner'

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
    const channel = supabase.channel(`scan-relay:${pairCode}`, {
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

// POS screen side: receives scans, sends back a result for each one.
export function useScanReceiver(pairCode: string | null, onScan: (code: string) => void) {
  const onScanRef = useRef(onScan)
  useEffect(() => { onScanRef.current = onScan })

  // Broadcast delivers each message once, but a flaky connection can
  // replay; drop an id we've just seen.
  const seenRef = useRef<string[]>([])

  const { channelRef, subscribed, peerOnline } = useRelayChannel(pairCode, 'pos', (channel) => {
    channel.on('broadcast', { event: 'scan' }, ({ payload }) => {
      const code = typeof payload?.code === 'string' ? payload.code : ''
      const id = typeof payload?.id === 'string' ? payload.id : ''
      if (!code) return
      if (id) {
        if (seenRef.current.includes(id)) return
        seenRef.current = [...seenRef.current.slice(-49), id]
      }
      onScanRef.current(code)
    })
  })

  const sendResult = useCallback((result: ScanResult) => {
    channelRef.current?.send({ type: 'broadcast', event: 'result', payload: result })
  }, [channelRef])

  return { connected: subscribed, scannerOnline: peerOnline, sendResult }
}

// Scanner device side: sends scans, receives results.
export function useScanSender(pairCode: string | null, onResult?: (r: ScanResult) => void) {
  const onResultRef = useRef(onResult)
  useEffect(() => { onResultRef.current = onResult })

  const { channelRef, subscribed, peerOnline } = useRelayChannel(pairCode, 'scanner', (channel) => {
    channel.on('broadcast', { event: 'result' }, ({ payload }) => {
      if (payload && typeof payload.code === 'string') onResultRef.current?.(payload as ScanResult)
    })
  })

  const sendScan = useCallback(async (code: string): Promise<boolean> => {
    const trimmed = code.trim()
    const channel = channelRef.current
    if (!trimmed || !channel) return false
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const res = await channel.send({ type: 'broadcast', event: 'scan', payload: { id, code: trimmed } })
    return res === 'ok'
  }, [channelRef])

  return { connected: subscribed, posOnline: peerOnline, sendScan }
}
