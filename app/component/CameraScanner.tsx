"use client"
import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library'
import { X, Camera, AlertCircle } from 'lucide-react'

interface CameraScannerProps {
  onScan: (code: string) => void
  onClose: () => void
  // Optional — lets the caller show a running cart total while
  // scanning (used on the checkout page). Products page doesn't pass
  // this since there's no cart concept there.
  cartSummary?: { itemCount: number; total: number; recentItems?: string[] }
}

// Camera-based barcode scanner — a free fallback to a physical
// scanner. Uses @zxing/library instead of the native BarcodeDetector
// API because BarcodeDetector isn't supported in Safari/iOS at all,
// which would silently break this on the iPad/iPhone.
export default function CameraScanner({ onScan, onClose, cartSummary }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 })

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    readerRef.current = reader

    reader
      .listVideoInputDevices()
      .then((devices) => {
        if (devices.length === 0) {
          setError('ไม่พบกล้องในอุปกรณ์นี้')
          return
        }
        // Prefer the back/rear camera (better focus on items than the
        // front-facing camera, which is what most devices default to).
        const backCamera = devices.find(d =>
          /back|rear|environment/i.test(d.label)
        )
        const deviceId = backCamera?.deviceId || devices[devices.length - 1].deviceId

        if (!videoRef.current) return
        reader
          .decodeFromVideoDevice(deviceId, videoRef.current, (result, err) => {
            if (result) {
              const code = result.getText()
              const now = Date.now()
              // Debounce: the same code can decode dozens of times per
              // second while held in frame. Only fire once per 1.5s
              // per unique code so it doesn't add the item repeatedly.
              if (lastScanRef.current.code === code && now - lastScanRef.current.time < 1500) {
                return
              }
              lastScanRef.current = { code, time: now }
              onScan(code)
            }
            // NotFoundException fires continuously while no code is in
            // frame — that's normal, not an error to show the user.
            if (err && !(err instanceof NotFoundException)) {
              // Real decode errors are rare and not actionable for the
              // user — ignore rather than spam an error state.
            }
          })
          .catch(() => {
            setError('ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการเข้าถึงกล้อง')
          })
      })
      .catch(() => {
        setError('ไม่สามารถเข้าถึงกล้องได้')
      })

    return () => {
      reader.reset()
    }
  }, [onScan])

  const handleClose = () => {
    readerRef.current?.reset()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex justify-between items-center p-4 bg-black/80">
        <h3 className="text-white font-bold flex items-center gap-2">
          <Camera size={20} /> สแกนบาร์โค้ดด้วยกล้อง
        </h3>
        {cartSummary && (
          <div className="flex items-center gap-2 bg-white/10 px-4 py-1.5 rounded-full">
            <span className="text-white/70 text-xs font-bold">{cartSummary.itemCount} รายการ</span>
            <span className="text-white/30">|</span>
            <span className="text-emerald-400 font-black text-sm">฿{cartSummary.total.toLocaleString()}</span>
          </div>
        )}
        <button onClick={handleClose} className="p-2 text-white/70 hover:text-white">
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center gap-3 text-white p-8 text-center">
            <AlertCircle size={40} className="text-red-400" />
            <p className="font-bold">{error}</p>
            <p className="text-sm text-white/60">
              ตรวจสอบว่าอนุญาตให้เว็บไซต์เข้าถึงกล้องในตั้งค่า Safari
            </p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              muted
              playsInline
            />
            {/* Scan guide overlay — purely visual, helps aim */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-40 border-4 border-white/70 rounded-2xl shadow-[0_0_0_2000px_rgba(0,0,0,0.4)]" />
            </div>
          </>
        )}
      </div>

      <div className="bg-black/80">
        {cartSummary?.recentItems && cartSummary.recentItems.length > 0 && (
          <div className="px-6 pt-3 flex gap-2 overflow-x-auto">
            {cartSummary.recentItems.slice(-5).map((name, i) => (
              <span
                key={i}
                className="shrink-0 text-[11px] font-bold text-white/80 bg-white/10 px-3 py-1 rounded-full whitespace-nowrap"
              >
                {name}
              </span>
            ))}
          </div>
        )}
        <div className="p-6 text-center">
          <p className="text-white/60 text-sm">วางบาร์โค้ดให้อยู่ในกรอบ กล้องจะสแกนให้อัตโนมัติ</p>
        </div>
      </div>
    </div>
  )
}
