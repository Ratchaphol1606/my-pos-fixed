import { Settings } from '@/src/types'

export type PrintMode = 'server' | 'browser'
export type PaperWidth = 58 | 80

export interface PrintConfig {
  mode: PrintMode
  serverUrl: string
  paperWidthMm: PaperWidth
  // Usable width of the receipt content (paper minus margins), in mm
  contentWidthMm: number
}

const ENV_URL = process.env.NEXT_PUBLIC_PRINT_SERVER_URL || ''

// Settings from the database win; the old env var is only a fallback so
// existing deployments keep working until the settings are filled in.
export function getPrintConfig(settings: Settings | null | undefined): PrintConfig {
  const serverUrl = (settings?.print_server_url || ENV_URL).trim().replace(/\/+$/, '')
  const paperWidthMm: PaperWidth = settings?.paper_width_mm === 80 ? 80 : 58

  let mode: PrintMode
  if (settings?.print_mode === 'browser' || settings?.print_mode === 'server') {
    mode = settings.print_mode
  } else {
    mode = serverUrl ? 'server' : 'browser'
  }
  // Server mode without a URL cannot work, so fall back to the browser
  if (mode === 'server' && !serverUrl) mode = 'browser'

  return {
    mode,
    serverUrl,
    paperWidthMm,
    contentWidthMm: paperWidthMm === 80 ? 72 : 48,
  }
}

// Sets the @page size for browser printing to match the paper width.
// Injected as the last stylesheet so it overrides the defaults in globals.css.
export function applyBrowserPaper(cfg: PrintConfig) {
  if (typeof document === 'undefined') return
  let el = document.getElementById('print-paper-style') as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = 'print-paper-style'
    document.head.appendChild(el)
  }
  el.textContent = `@media print {
  @page { size: ${cfg.paperWidthMm}mm auto; margin: 0; }
  .receipt-container, .print\\:block { width: ${cfg.contentWidthMm}mm !important; }
}`
}

async function sendToServer(cfg: PrintConfig, payload: object) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(`${cfg.serverUrl}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, paperWidthMm: cfg.paperWidthMm }),
      signal: controller.signal,
    })
    const result = await res.json()
    if (!result.ok) throw new Error(result.error || 'Print server error')
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error('Print server did not respond (timeout)')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// Prints a receipt using the configured printer.
// - server mode: POST to the print server; if it fails and `fallbackToBrowser`
//   is true, falls back to window.print(), otherwise throws.
// - browser mode: window.print(). The caller must have a <Receipt> rendered.
// Returns which path was actually used.
export async function printReceipt(
  settings: Settings | null | undefined,
  payload: object,
  opts: { fallbackToBrowser?: boolean } = {}
): Promise<'server' | 'browser'> {
  const cfg = getPrintConfig(settings)

  if (cfg.mode === 'server') {
    try {
      await sendToServer(cfg, payload)
      return 'server'
    } catch (err) {
      if (!opts.fallbackToBrowser) throw err
      console.error('Print server failed, falling back to browser print:', err)
    }
  }

  applyBrowserPaper(cfg)
  window.print()
  return 'browser'
}
