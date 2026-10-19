import { Settings } from '@/src/types'
import { renderReceiptCanvas, encodeEscPos, ReceiptPayload } from '@/src/lib/escpos'
import { getSavedDevice, sendToDevice, SavedDevice } from '@/src/lib/printerDevice'

// 'usb' and 'bluetooth' come from a printer connected on this device (see Settings);
// 'server' and 'browser' are the shop-wide choice stored in the database.
export type PrintMode = 'server' | 'browser' | 'usb' | 'bluetooth'
export type PaperWidth = 58 | 80

export interface PrintConfig {
  mode: PrintMode
  serverUrl: string
  paperWidthMm: PaperWidth
  // Usable width of the receipt content (paper minus margins), in mm
  contentWidthMm: number
  // Printer connected on this device, if any (takes priority over the shop-wide mode)
  device: SavedDevice | null
}

const ENV_URL = process.env.NEXT_PUBLIC_PRINT_SERVER_URL || ''

// Priority: printer connected on this device > shop settings in the database >
// the old env var (kept as a fallback so existing deployments keep working).
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

  const device = getSavedDevice()
  if (device) mode = device.type

  return {
    mode,
    serverUrl,
    paperWidthMm,
    contentWidthMm: paperWidthMm === 80 ? 72 : 48,
    device,
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
// - usb / bluetooth: renders the receipt in the browser and sends it straight to
//   the printer connected on this device.
// - server mode: POST to the print server.
// - browser mode: window.print(). The caller must have a <Receipt> rendered.
// If usb / bluetooth / server fails and `fallbackToBrowser` is true, falls back
// to window.print(), otherwise throws.
// Returns which path was actually used.
export async function printReceipt(
  settings: Settings | null | undefined,
  payload: object,
  opts: { fallbackToBrowser?: boolean } = {}
): Promise<PrintMode> {
  const cfg = getPrintConfig(settings)

  if ((cfg.mode === 'usb' || cfg.mode === 'bluetooth') && cfg.device) {
    try {
      const canvas = renderReceiptCanvas(payload as ReceiptPayload, cfg.paperWidthMm)
      await sendToDevice(cfg.device, encodeEscPos(canvas))
      return cfg.mode
    } catch (err) {
      if (!opts.fallbackToBrowser) throw err
      console.error(`${cfg.mode} print failed, falling back to browser print:`, err)
    }
  }

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
