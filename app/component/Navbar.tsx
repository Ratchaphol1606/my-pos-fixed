"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShoppingCart, Package, BarChart3, DollarSign, DollarSignIcon, Settings, LogOut, ShieldCheck } from 'lucide-react'
import { useRole } from '@/src/lib/RoleContext'

export default function Navbar() {
  const pathname = usePathname()
  const role = useRole()

  const menuItems = [
    { name: 'คิดเงิน', href: '/', icon: <ShoppingCart size={20} />, adminOnly: false },
    { name: 'สินค้า', href: '/products', icon: <Package size={20} />, adminOnly: false },
    { name: 'ยอดขาย', href: '/sales', icon: <DollarSign size={20} />, adminOnly: true },
    { name: 'รายงานสรุป', href: '/reports', icon: <BarChart3 size={20} />, adminOnly: true },
    { name: 'ภาษี', href: '/taxReports', icon: <DollarSignIcon size={20} />, adminOnly: true },
    { name: 'ตั้งค่า', href: '/settings', icon: <Settings size={20} />, adminOnly: true },
  ].filter(item => !item.adminOnly || role === 'admin')

  const handleLock = async () => {
    await fetch('/api/auth', { method: 'DELETE' })
    window.location.href = '/'
  }

  return (
    // Mobile: fixed bottom bar | Desktop: sticky left sidebar that stays while scrolling
    <nav className="
      fixed bottom-0 left-0 right-0 z-40 bg-white border-t
      md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0
      md:border-t-0 md:border-r md:border-gray-100
      flex md:flex-col
      justify-around md:justify-start
      p-2 md:p-4 md:gap-1
      print:hidden
    ">
      {/* Logo — desktop only */}
      <div className="hidden md:block mb-6 px-2 pt-2">
        <h1 className="text-xl font-black text-blue-600 tracking-tight">MY POS</h1>
        <p className="text-[10px] text-gray-400 font-medium">บุญชอบเครื่องครัว</p>
        {role && (
          <span className={`inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
            role === 'admin' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
          }`}>
            <ShieldCheck size={10} /> {role === 'admin' ? 'ผู้ดูแลระบบ' : 'แคชเชียร์'}
          </span>
        )}
      </div>

      {menuItems.map((item) => (
        <Link 
          key={item.href} 
          href={item.href}
          className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-3 py-2 rounded-2xl transition-all text-center md:text-left ${
            pathname === item.href
              ? 'bg-blue-600 text-white'
              : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          {item.icon}
          <span className="text-[10px] md:text-sm font-semibold">{item.name}</span>
        </Link>
      ))}

      {/* Lock screen — desktop only, pinned to bottom */}
      <button
        onClick={handleLock}
        className="hidden md:flex items-center gap-3 px-3 py-2 rounded-2xl text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all mt-auto"
      >
        <LogOut size={20} />
        <span className="text-sm font-semibold">ล็อกหน้าจอ</span>
      </button>
    </nav>
  )
}
