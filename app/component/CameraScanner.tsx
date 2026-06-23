"use client"
import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library'
import { X, Camera, AlertCircle } from 'lucide-react'

interface CameraScannerProps {
  onScan: (code: string) => void
  onClose: () => void
}

// Camera-based barcode scanner — a free fallback to a physical
// scanner. Uses @zxing/library instead of the native BarcodeDetector
// API because BarcodeDetector isn't supported in Safari/iOS at all,
// which would silently break this on the iPad/iPhone.
export default function CameraScanner({ onScan, onClose }: CameraScannerProps) {
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

      <div className="p-6 bg-black/80 text-center">
        <p className="text-white/60 text-sm">วางบาร์โค้ดให้อยู่ในกรอบ กล้องจะสแกนให้อัตโนมัติ</p>
      </div>
    </div>
  )
}
