"use client"
import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, NotFoundException, BarcodeFormat, DecodeHintType } from '@zxing/library'
import { X, Camera, AlertCircle, Zap, ZapOff } from 'lucide-react'

interface CameraScannerProps {
  onScan: (code: string) => void
  onClose: () => void
  // Optional — lets the caller show a running cart total while
  // scanning (used on the checkout page). Products page doesn't pass
  // this since there's no cart concept there.
  cartSummary?: { itemCount: number; total: number; recentItems?: string[] }
  // Controls visibility without unmounting. Keeping the component
  // mounted (just hidden) between opens is the fix for iOS Safari
  // re-prompting for camera permission every time — fully unmounting
  // tears down the MediaStream, and Safari treats the next
  // getUserMedia() call as a brand new request rather than a
  // continuation of an already-granted session.
  //
  // IMPORTANT: this component must always be rendered (never wrapped
  // in `{show && <CameraScanner ... />}`), with `visible` toggled
  // instead — e.g. `<CameraScanner visible={show} ... />`. If it's
  // ever conditionally mounted again, this prop will be undefined and
  // the component will never render anything.
  visible: boolean
}

// Camera-based barcode scanner — a free fallback to a physical
// scanner. Uses @zxing/library instead of the native BarcodeDetector
// API because BarcodeDetector isn't supported in Safari/iOS at all,
// which would silently break this on the iPad/iPhone.
export default function CameraScanner({ onScan, onClose, cartSummary, visible }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 })

  // Starts the camera once, the first time the scanner becomes
  // visible. After that, the stream stays alive (just hidden via CSS
  // when not visible) so reopening never re-requests permission.
  useEffect(() => {
    if (!visible || started) return
    setStarted(true)

    // Only decode the formats we actually use — factory barcodes
    // (EAN-13/EAN-8/UPC, the global retail standard) and our own
    // self-generated codes (CODE_128). Restricting the format list
    // means zxing spends every decode attempt checking fewer
    // possibilities, which means more attempts per second on the
    // formats that matter instead of also checking QR, Aztec, PDF417,
    // etc. that we'll never actually use here.
    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
    ])
    // Default is 500ms between decode attempts — dropping this much
    // lower means far more attempts per second, which matters most in
    // marginal conditions (low light, slight blur, awkward angle)
    // where any single frame might fail and a retry a moment later
    // succeeds. 50ms is aggressive but the actual decode itself is
    // cheap once formats are restricted above.
    const reader = new BrowserMultiFormatReader(hints, 50)
    readerRef.current = reader

    // Requesting the stream ourselves (instead of letting zxing's
    // decodeFromVideoDevice do it with default constraints) lets us
    // ask for a higher resolution and continuous autofocus explicitly
    // — both help with small/close-up barcodes — and gives us the
    // actual MediaStream object afterward so the torch toggle below
    // has something to control.
    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        // @ts-expect-error -- focusMode/advanced aren't in the standard
        // TS lib.dom types yet but are widely supported on mobile Safari/Chrome
        advanced: [{ focusMode: 'continuous' }],
      }
    }

    if (!videoRef.current) return
    reader
      .decodeFromConstraints(constraints, videoRef.current, (result, err) => {
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
      .then(() => {
        // Grab the actual stream so the torch toggle has something to
        // act on, and check whether this device's camera supports a
        // torch at all (most laptops/desktops don't; most phones do).
        const stream = videoRef.current?.srcObject as MediaStream | null
        streamRef.current = stream
        const track = stream?.getVideoTracks()[0]
        const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean }
        setTorchSupported(!!capabilities?.torch)
      })
      .catch(() => {
        setError('ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการเข้าถึงกล้อง')
      })
    // Only re-run if visible/started actually change — onScan is
    // intentionally excluded since we only want this to fire once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, started])

  // Only fully release the camera when the component genuinely
  // unmounts (navigating to a different page) — never on a simple
  // close, which just hides the view via the `visible` prop instead.
  useEffect(() => {
    return () => {
      readerRef.current?.reset()
    }
  }, [])

  const handleClose = () => {
    onClose()
  }

  // Toggles the flashlight — the single biggest lever for scanning in
  // dim conditions, where the camera otherwise struggles with
  // exposure/contrast and either fails to decode or takes much longer
  // hunting for focus. Not all devices report torch support; the
  // button only shows when the capability check above found one.
  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      await track.applyConstraints({
        // @ts-expect-error -- torch isn't in standard TS lib.dom types yet
        advanced: [{ torch: !torchOn }]
      })
      setTorchOn(!torchOn)
    } catch {
      // Some devices report torch capability but fail to actually
      // apply it (inconsistent across browsers) — fail silently
      // rather than show an error for what's a nice-to-have control.
    }
  }

  // Tap-to-focus: default continuous autofocus sometimes hunts and
  // never quite locks onto a close-up barcode, especially indoors.
  // Letting the cashier tap the exact spot forces the camera to
  // refocus there directly, which is usually much faster than waiting
  // for autofocus to figure it out on its own.
  const handleTapToFocus = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      await track.applyConstraints({
        // @ts-expect-error -- focusMode aren't in standard TS lib.dom types yet
        advanced: [{ focusMode: 'single-shot' }]
      })
      // Switch back to continuous shortly after, so it doesn't stay
      // locked on a single distance if the next item is at a
      // different one.
      setTimeout(() => {
        track.applyConstraints({
          // @ts-expect-error -- focusMode isn't in standard TS lib.dom types yet
          advanced: [{ focusMode: 'continuous' }]
        }).catch(() => {})
      }, 1500)
    } catch {
      // Not all cameras support manual focus mode switching — fail
      // silently, continuous autofocus is still running regardless.
    }
  }

  if (!visible && !started) return null

  return (
    <div className={`fixed inset-0 bg-black z-50 flex flex-col ${visible ? '' : 'hidden'}`}>
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
              onClick={handleTapToFocus}
            />
            {/* Scan guide overlay — purely visual, helps aim. Tap
                anywhere on the video to force a refocus on that spot,
                useful when autofocus is hunting and not locking on. */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-40 border-4 border-white/70 rounded-2xl shadow-[0_0_0_2000px_rgba(0,0,0,0.4)]" />
            </div>

            {/* Torch toggle — only shown when the device actually
                reports torch support (most phones; rarely laptops). */}
            {torchSupported && (
              <button
                onClick={toggleTorch}
                className={`absolute bottom-4 right-4 p-3 rounded-full transition-all ${
                  torchOn ? 'bg-yellow-400 text-black' : 'bg-white/20 text-white'
                }`}
                title={torchOn ? 'ปิดไฟฉาย' : 'เปิดไฟฉาย (สำหรับที่มืด)'}
              >
                {torchOn ? <Zap size={20} /> : <ZapOff size={20} />}
              </button>
            )}
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
          <p className="text-white/60 text-sm">วางบาร์โค้ดให้อยู่ในกรอบ หรือแตะที่หน้าจอเพื่อปรับโฟกัส</p>
        </div>
      </div>
    </div>
  )
}
