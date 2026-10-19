// Direct printing from the browser to a USB (WebUSB) or Bluetooth LE (Web Bluetooth)
// thermal printer. The chosen printer is remembered per browser/device in
// localStorage, so each tablet or computer can have its own printer.
//
// Support: Chrome / Edge on Android and desktop. Not available on iOS Safari.
// WebUSB cannot open a printer that Windows has already claimed with a printer
// driver; on Windows use Bluetooth or the print server / browser print instead.

export type DeviceType = 'usb' | 'bluetooth'

export interface SavedDevice {
  type: DeviceType
  name: string
  vendorId?: number
  productId?: number
  bluetoothId?: string
}

const STORAGE_KEY = 'pos_print_device'

// Services commonly used by BLE thermal printers (must be listed to be accessible)
const BLE_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
]

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ── Saved selection ────────────────────────────────────────────────

export function getSavedDevice(): SavedDevice | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && (parsed.type === 'usb' || parsed.type === 'bluetooth')) return parsed as SavedDevice
  } catch {
    // storage unavailable or corrupt: treat as no device
  }
  return null
}

function saveDevice(device: SavedDevice) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(device))
  } catch {
    throw new Error('บันทึกการเชื่อมต่อไม่ได้ (เบราว์เซอร์ปิดการเก็บข้อมูล)')
  }
}

export async function forgetDevice() {
  const saved = getSavedDevice()
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  usbCache = null
  bleCache = null
  // Also revoke the browser permission so the picker shows it again next time
  try {
    if (saved?.type === 'usb') {
      const devs: any[] = await (navigator as any).usb.getDevices()
      for (const d of devs) {
        if (d.vendorId === saved.vendorId && d.productId === saved.productId) {
          if (d.opened) await d.close()
          if (typeof d.forget === 'function') await d.forget()
        }
      }
    } else if (saved?.type === 'bluetooth') {
      const devs: any[] = (await (navigator as any).bluetooth.getDevices?.()) || []
      for (const d of devs) {
        if (d.id === saved.bluetoothId) {
          d.gatt?.disconnect()
          if (typeof d.forget === 'function') await d.forget()
        }
      }
    }
  } catch {
    // best effort only
  }
}

export const isUsbSupported = () => typeof navigator !== 'undefined' && !!(navigator as any).usb
export const isBluetoothSupported = () => typeof navigator !== 'undefined' && !!(navigator as any).bluetooth

// ── USB ────────────────────────────────────────────────────────────

let usbCache: { device: any; endpoint: number } | null = null

async function openUsb(device: any): Promise<number> {
  try {
    if (!device.opened) await device.open()
    if (device.configuration === null) await device.selectConfiguration(1)

    // Prefer the printer-class interface (7), otherwise any interface with a bulk OUT endpoint
    let best: { iface: number; alt: number; endpoint: number; isPrinter: boolean } | null = null
    for (const iface of device.configuration.interfaces) {
      for (const alt of iface.alternates) {
        const ep = alt.endpoints.find((e: any) => e.direction === 'out' && e.type === 'bulk')
        if (!ep) continue
        const candidate = {
          iface: iface.interfaceNumber,
          alt: alt.alternateSetting,
          endpoint: ep.endpointNumber,
          isPrinter: alt.interfaceClass === 7,
        }
        if (!best || (candidate.isPrinter && !best.isPrinter)) best = candidate
      }
    }
    if (!best) throw new Error('ไม่พบช่องส่งข้อมูล (bulk OUT) ของเครื่องพิมพ์นี้')

    await device.claimInterface(best.iface)
    if (best.alt !== 0) await device.selectAlternateInterface(best.iface, best.alt)
    return best.endpoint
  } catch (err: any) {
    try {
      if (device.opened) await device.close()
    } catch {
      // ignore
    }
    if (err?.name === 'SecurityError' || err?.name === 'NetworkError' || /claim/i.test(err?.message || '')) {
      throw new Error(
        'เปิดเครื่องพิมพ์ USB ไม่ได้ — ถ้าใช้ Windows ที่ติดตั้งไดรเวอร์เครื่องพิมพ์ไว้ WebUSB จะใช้ไม่ได้ ' +
          'ลองใช้ Android, Bluetooth หรือพิมพ์ผ่านเบราว์เซอร์/print server แทน'
      )
    }
    throw err
  }
}

export async function connectUsb(): Promise<SavedDevice> {
  if (!isUsbSupported()) throw new Error('เบราว์เซอร์นี้ไม่รองรับ WebUSB (ใช้ Chrome หรือ Edge)')
  let device: any
  try {
    device = await (navigator as any).usb.requestDevice({ filters: [] })
  } catch (err: any) {
    if (err?.name === 'NotFoundError') throw new Error('ยกเลิกการเลือกเครื่องพิมพ์')
    throw err
  }
  const endpoint = await openUsb(device)
  usbCache = { device, endpoint }
  const saved: SavedDevice = {
    type: 'usb',
    name: device.productName || `USB ${device.vendorId?.toString(16)}:${device.productId?.toString(16)}`,
    vendorId: device.vendorId,
    productId: device.productId,
  }
  saveDevice(saved)
  return saved
}

async function getUsb(saved: SavedDevice) {
  if (usbCache?.device.opened) return usbCache
  const devices: any[] = await (navigator as any).usb.getDevices()
  const device = devices.find(d => d.vendorId === saved.vendorId && d.productId === saved.productId)
  if (!device) {
    throw new Error('ไม่พบเครื่องพิมพ์ USB ที่เชื่อมต่อไว้ — เสียบสายแล้วไปที่ Settings เพื่อเชื่อมต่อใหม่')
  }
  const endpoint = await openUsb(device)
  usbCache = { device, endpoint }
  return usbCache
}

async function sendUsb(saved: SavedDevice, data: Uint8Array) {
  let conn = await getUsb(saved)
  const CHUNK = 16384
  try {
    for (let i = 0; i < data.length; i += CHUNK) {
      await conn.device.transferOut(conn.endpoint, data.subarray(i, i + CHUNK))
    }
  } catch (err) {
    usbCache = null // force a clean reopen next time
    throw err
  }
}

// ── Bluetooth LE ───────────────────────────────────────────────────

let bleCache: { device: any; characteristic: any } | null = null

async function findWritableCharacteristic(server: any) {
  for (const uuid of BLE_SERVICES) {
    try {
      const service = await server.getPrimaryService(uuid)
      const chars = await service.getCharacteristics()
      const writable = chars.find((c: any) => c.properties.writeWithoutResponse || c.properties.write)
      if (writable) return writable
    } catch {
      // service not present on this printer, try the next one
    }
  }
  throw new Error('ไม่พบช่องส่งข้อมูลของเครื่องพิมพ์ Bluetooth นี้ (รุ่นนี้อาจไม่รองรับ)')
}

async function connectBleDevice(device: any) {
  const server = await device.gatt.connect()
  const characteristic = await findWritableCharacteristic(server)
  bleCache = { device, characteristic }
  return bleCache
}

export async function connectBluetooth(): Promise<SavedDevice> {
  if (!isBluetoothSupported()) throw new Error('เบราว์เซอร์นี้ไม่รองรับ Web Bluetooth (ใช้ Chrome บน Android หรือคอมพิวเตอร์)')
  let device: any
  try {
    device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_SERVICES,
    })
  } catch (err: any) {
    if (err?.name === 'NotFoundError') throw new Error('ยกเลิกการเลือกเครื่องพิมพ์')
    throw err
  }
  await connectBleDevice(device)
  const saved: SavedDevice = {
    type: 'bluetooth',
    name: device.name || 'Bluetooth printer',
    bluetoothId: device.id,
  }
  saveDevice(saved)
  return saved
}

async function getBle(saved: SavedDevice) {
  if (bleCache && bleCache.device.id === saved.bluetoothId && bleCache.device.gatt?.connected) return bleCache

  const bt = (navigator as any).bluetooth
  const known: any[] = typeof bt.getDevices === 'function' ? await bt.getDevices() : []
  const device = known.find(d => d.id === saved.bluetoothId)
  if (!device) {
    throw new Error('ไม่พบเครื่องพิมพ์ Bluetooth ที่เชื่อมต่อไว้ — เปิดเครื่องพิมพ์แล้วไปที่ Settings เพื่อเชื่อมต่อใหม่')
  }
  return connectBleDevice(device)
}

async function sendBluetooth(saved: SavedDevice, data: Uint8Array) {
  const conn = await getBle(saved)
  const { characteristic } = conn
  const useNoResponse = !!characteristic.properties.writeWithoutResponse
  let chunk = 180

  try {
    let i = 0
    while (i < data.length) {
      const slice = data.subarray(i, i + chunk)
      try {
        if (useNoResponse) await characteristic.writeValueWithoutResponse(slice)
        else await characteristic.writeValue(slice)
        i += slice.length
        await sleep(8)
      } catch (err) {
        // Some printers only accept the minimum 20-byte packets
        if (chunk > 20) {
          chunk = 20
          await sleep(50)
        } else {
          throw err
        }
      }
    }
  } catch (err) {
    bleCache = null
    throw err
  }
}

// ── Public ─────────────────────────────────────────────────────────

export async function sendToDevice(saved: SavedDevice, data: Uint8Array) {
  if (saved.type === 'usb') {
    if (!isUsbSupported()) throw new Error('เบราว์เซอร์นี้ไม่รองรับ WebUSB')
    await sendUsb(saved, data)
  } else {
    if (!isBluetoothSupported()) throw new Error('เบราว์เซอร์นี้ไม่รองรับ Web Bluetooth')
    await sendBluetooth(saved, data)
  }
}
