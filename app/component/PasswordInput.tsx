"use client"
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// Password field with a show/hide eye, used by the account and users pages.
export default function PasswordInput({
  value,
  onChange,
  autoComplete = 'new-password',
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  autoComplete?: string
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="w-full p-3 pr-12 border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white font-bold text-sm"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}
