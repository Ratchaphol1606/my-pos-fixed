// Browser-side receipt rendering for USB / Bluetooth thermal printers.
// The layout mirrors print_server.py (same sizes, wrapping and spacing) so a
// receipt looks the same whichever way it is printed.

export interface ReceiptPayload {
  shopName?: string
  shopAddress?: string
  shopPhone?: string
  receiptNo?: string
  date?: string
  items?: { name?: string; price?: number; qty?: number }[]
  subtotal?: number
  discount?: number
  total?: number
  received?: number
  change?: number
  paymentMethod?: string
  customerName?: string
  customerPhoneMasked?: string
  pointsEarned?: number
  pointsRedeemed?: number
  pointsBalance?: number | null
}

const W_58MM = 384 // px at 203 dpi
const W_80MM = 576

const SIZE_SMALL = 20
const SIZE_BODY = 24
const SIZE_STRONG = 26
const SIZE_TOTAL = 30
const SIZE_TITLE = 32

const MARGIN = 10
const FONT_FAMILY = '"Sarabun", "Noto Sans Thai", "Leelawadee UI", "Tahoma", "Garuda", sans-serif'

const BLACK_THRESHOLD = 180 // same cut-off as print_server.py

const fmt = (v: unknown) => {
  const n = Number(v)
  return isNaN(n) ? '0' : Math.round(n).toLocaleString('en-US')
}

const lineHeight = (size: number) => Math.floor(size * 1.4) + 3

// Thai vowels and tone marks must stay with the letter before them
const isCombining = (ch: string) => /\p{Mn}/u.test(ch)

type Entry =
  | { kind: 'text'; t: string; size: number; align: 'left' | 'center'; bold: boolean }
  | { kind: 'row'; left: string; right: string; size: number; bold: boolean }
  | { kind: 'divider' }
  | { kind: 'space'; px: number }

function buildEntries(data: ReceiptPayload): Entry[] {
  const entries: Entry[] = []
  const text = (t: string, size: number, align: 'left' | 'center' = 'left', bold = false) =>
    entries.push({ kind: 'text', t, size, align, bold })
  const row = (left: string, right: string, size: number, bold = false) =>
    entries.push({ kind: 'row', left, right, size, bold })
  const divider = () => entries.push({ kind: 'divider' })
  const space = (px = 8) => entries.push({ kind: 'space', px })

  const method = data.paymentMethod || 'เงินสด'
  const discount = Number(data.discount) || 0

  text(data.shopName || 'MY POS', SIZE_TITLE, 'center', true)
  if (data.shopAddress) text(data.shopAddress, SIZE_SMALL, 'center')
  if (data.shopPhone) text(`โทร: ${data.shopPhone}`, SIZE_SMALL, 'center')
  space(8)
  divider()
  space(8)

  text(`เลขที่: ${data.receiptNo || '-'}`, SIZE_BODY)
  text(`วันที่: ${data.date || '-'}`, SIZE_BODY)
  space(8)
  divider()
  space(8)

  for (const item of data.items || []) {
    const price = Number(item.price) || 0
    const qty = Number(item.qty) || 1
    text(String(item.name || ''), SIZE_BODY, 'left', true)
    row(`   ${fmt(price)} x ${qty}`, fmt(price * qty), SIZE_BODY)
    space(6)
  }

  divider()
  space(8)

  row('ยอดรวม:', fmt(data.subtotal), SIZE_BODY)
  if (discount > 0) row('ส่วนลด:', `-${fmt(discount)}`, SIZE_BODY)
  space(4)
  row('สุทธิ:', `฿${fmt(data.total)}`, SIZE_TOTAL, true)
  space(4)
  row(`รับเงิน (${method}):`, fmt(data.received), SIZE_BODY)
  if (method === 'เงินสด') row('เงินทอน:', fmt(data.change), SIZE_BODY, true)

  if (data.customerName) {
    space(8)
    divider()
    space(8)
    row('สมาชิก:', String(data.customerName), SIZE_BODY)
    if (data.customerPhoneMasked) row('เบอร์:', String(data.customerPhoneMasked), SIZE_BODY)

    const earned = Number(data.pointsEarned) || 0
    const redeemed = Number(data.pointsRedeemed) || 0
    if (earned > 0) row('แต้มที่ได้รับ:', `+${earned}`, SIZE_BODY)
    if (redeemed > 0) row('แต้มที่ใช้:', `-${redeemed}`, SIZE_BODY)
    if (data.pointsBalance !== undefined && data.pointsBalance !== null) {
      row('แต้มคงเหลือ:', String(Math.trunc(Number(data.pointsBalance) || 0)), SIZE_STRONG, true)
    }
  }

  space(8)
  divider()
  space(8)
  text(`ชำระด้วย: ${method}`, SIZE_SMALL, 'center')
  space(6)
  text('*** ขอบคุณที่ใช้บริการ ***', SIZE_BODY, 'center')

  return entries
}

function setFont(ctx: CanvasRenderingContext2D, size: number, bold: boolean) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT_FAMILY}`
}

function wrapText(ctx: CanvasRenderingContext2D, t: string, maxW: number): string[] {
  if (!t) return ['']
  const lines: string[] = []
  for (const paragraph of t.split('\n')) {
    let cur = ''
    for (const word of paragraph.split(' ')) {
      const candidate = cur ? `${cur} ${word}` : word
      if (ctx.measureText(candidate).width <= maxW) {
        cur = candidate
        continue
      }
      if (cur) {
        lines.push(cur)
        cur = ''
      }
      // The word alone is too wide (e.g. Thai, which has no spaces): break by character
      let piece = ''
      for (const ch of Array.from(word)) {
        const trial = piece + ch
        if (piece && !isCombining(ch) && ctx.measureText(trial).width > maxW) {
          lines.push(piece)
          piece = ch
        } else {
          piece = trial
        }
      }
      cur = piece
    }
    lines.push(cur)
  }
  return lines
}

// Draws every entry starting at y and returns the final y.
// Run once on a scratch canvas to measure, then once for real.
function paint(ctx: CanvasRenderingContext2D, entries: Entry[], W: number, startY: number): number {
  const contentW = W - 2 * MARGIN
  let y = startY
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'alphabetic'

  for (const e of entries) {
    if (e.kind === 'divider') {
      ctx.fillRect(MARGIN, y + 3, W - 2 * MARGIN, 2)
      y += 10
    } else if (e.kind === 'space') {
      y += e.px
    } else if (e.kind === 'text') {
      setFont(ctx, e.size, e.bold)
      const lh = lineHeight(e.size)
      for (const ln of wrapText(ctx, e.t, contentW)) {
        const tw = ctx.measureText(ln).width
        const x = e.align === 'center' ? (W - tw) / 2 : MARGIN
        ctx.fillText(ln, x, y + Math.round(e.size * 1.05))
        y += lh
      }
    } else {
      setFont(ctx, e.size, e.bold)
      const lh = lineHeight(e.size)
      const rightW = ctx.measureText(e.right).width
      const leftMax = Math.max(contentW - rightW - 12, contentW / 3)
      const leftLines = wrapText(ctx, e.left, leftMax)
      const baseline = Math.round(e.size * 1.05)
      leftLines.forEach((ln, i) => {
        ctx.fillText(ln, MARGIN, y + baseline)
        if (i === 0) ctx.fillText(e.right, W - MARGIN - rightW, y + baseline)
        y += lh
      })
    }
  }
  return y
}

export function renderReceiptCanvas(data: ReceiptPayload, paperWidthMm: number): HTMLCanvasElement {
  const W = paperWidthMm === 80 ? W_80MM : W_58MM
  const entries = buildEntries(data)

  const scratch = document.createElement('canvas')
  scratch.width = W
  scratch.height = 10
  const endY = paint(scratch.getContext('2d')!, entries, W, 16)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = endY + 30
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  paint(ctx, entries, W, 16)
  return canvas
}

// Packs RGBA pixels into 1-bit rows (1 = black, MSB first). Width must be a multiple of 8.
export function packRows(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  const bytesPerRow = width >> 3
  const out = new Uint8Array(bytesPerRow * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      // Anything transparent counts as white paper
      const a = rgba[i + 3] / 255
      const r = rgba[i] * a + 255 * (1 - a)
      const g = rgba[i + 1] * a + 255 * (1 - a)
      const b = rgba[i + 2] * a + 255 * (1 - a)
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
      if (gray <= BLACK_THRESHOLD) out[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }
  return out
}

const ESC_INIT = [0x1b, 0x40]
const ESC_LINE_SPACING_0 = [0x1b, 0x33, 0x00]
const GS_CUT = [0x1d, 0x56, 0x41, 0x00]
const BAND_ROWS = 64

// Builds the full ESC/POS job: init, raster image in bands, feed, cut
export function encodeEscPos(canvas: HTMLCanvasElement): Uint8Array {
  const { width, height } = canvas
  const ctx = canvas.getContext('2d')!
  const rows = packRows(ctx.getImageData(0, 0, width, height).data, width, height)
  const bytesPerRow = width >> 3

  const parts: number[][] = [ESC_INIT, ESC_LINE_SPACING_0]
  const chunks: Uint8Array[] = []
  for (let y = 0; y < height; y += BAND_ROWS) {
    const h = Math.min(BAND_ROWS, height - y)
    // GS v 0 m xL xH yL yH d1...dk
    chunks.push(
      new Uint8Array([0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, h & 0xff, h >> 8]),
      rows.subarray(y * bytesPerRow, (y + h) * bytesPerRow)
    )
  }

  const head = Uint8Array.from(parts.flat())
  const tail = Uint8Array.from([0x0a, 0x0a, 0x0a, 0x0a, ...GS_CUT])
  const total = head.length + chunks.reduce((n, c) => n + c.length, 0) + tail.length
  const out = new Uint8Array(total)
  let pos = 0
  out.set(head, pos)
  pos += head.length
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.length
  }
  out.set(tail, pos)
  return out
}
