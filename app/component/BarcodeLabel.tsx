"use client"
import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { X, Printer } from 'lucide-react'

interface BarcodeLabelProps {
  code: string
  name: string
  price?: number
  onClose: () => void
}

// Printable barcode label popup. Used for self-generated product codes
// (loose/kitchen items with no factory barcode) — print this on sticker
// paper and stick it on the item so the same scanner used at checkout
// can read it too.
export default function BarcodeLabel({ code, name, price, onClose }: BarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (svgRef.current) {
      try {
        JsBarcode(svgRef.current, code, {
          format: 'CODE128', // reads with any standard 1D scanner
          width: 2,
          height: 60,
          displayValue: true,
          fontSize: 14,
          margin: 8,
        })
      } catch {
        // CODE128 can fail on unusual characters — fall back to
        // showing the code as plain text inside the SVG area isn't
        // straightforward, so we just leave the SVG empty and the
        // text code is still printed below via displayValue normally.
      }
    }
  }, [code])

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 print:bg-white print:p-0">
      <div className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl print:shadow-none print:rounded-none print:max-w-full print:p-4">
        <div className="flex justify-between items-center mb-4 print:hidden">
          <h3 className="font-black text-lg">ป้ายบาร์โค้ด</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-1 border-2 border-dashed border-slate-200 rounded-2xl p-6 print:border-black">
          <p className="font-black text-sm text-center leading-tight">{name}</p>
          {price !== undefined && (
            <p className="text-blue-600 font-black text-lg">฿{price.toLocaleString()}</p>
          )}
          <svg ref={svgRef} className="max-w-full" />
        </div>

        <button
          onClick={handlePrint}
          className="w-full mt-6 py-3 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 print:hidden"
        >
          <Printer size={18} /> พิมพ์ป้าย
        </button>
      </div>
    </div>
  )
}
