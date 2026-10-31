"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ShoppingCart, Package, BarChart3, DollarSign, DollarSignIcon, Settings, LogOut, ShieldCheck, FlaskConical, Percent } from 'lucide-react'
import { useRole, useAuth } from '@/src/lib/RoleContext'
import { supabase } from '@/src/lib/supabase'

export default function Navbar() {
  const pathname = usePathname()
  const role = useRole()
  const { user, lock, logout } = useAuth()
  // Empty until the real name loads, so no hard-coded shop name ever flashes.
  const [shopName, setShopName] = useState('')

  useEffect(() => {
    const fetchShopName = async () => {
      const { data } = await supabase.from('settings').select('shop_name').eq('id', 1).single()
      if (data?.shop_name) setShopName(data.shop_name)
    }
    fetchShopName()
    // Settings page announces a new name right after saving, so the menu
    // updates immediately instead of after a page reload.
    const onChanged = (e: Event) => {
      const name = (e as CustomEvent<string>).detail
      if (typeof name === 'string' && name.trim()) setShopName(name.trim())
      else fetchShopName()
    }
    window.addEventListener('shop-name-changed', onChanged)
    return () => window.removeEventListener('shop-name-changed', onChanged)
  }, [])

  // Browser tab title follows the shop name too
  useEffect(() => {
    if (shopName) document.title = `${shopName} — POS`
  }, [shopName])

  const menuItems = [
    { name: 'คิดเงิน', href: '/', icon: <ShoppingCart size={20} />, adminOnly: false },
    { name: 'สินค้า', href: '/products', icon: <Package size={20} />, adminOnly: false },
    { name: 'ยอดขาย', href: '/sales', icon: <DollarSign size={20} />, adminOnly: false },
    { name: 'โปรโมชั่น', href: '/promotions', icon: <Percent size={20} />, adminOnly: true },
    { name: 'รายงานสรุป', href: '/reports', icon: <BarChart3 size={20} />, adminOnly: true },
    { name: 'ภาษี', href: '/taxReports', icon: <DollarSignIcon size={20} />, adminOnly: true },
    { name: 'ตั้งค่า', href: '/settings', icon: <Settings size={20} />, adminOnly: true },
    { name: 'ทดสอบ', href: '/test', icon: <FlaskConical size={20} />, adminOnly: true },
  ].filter(item => !item.adminOnly || role === 'admin')

  const [showConfirm, setShowConfirm] = useState(false)

  // Lock = same person, back to the PIN pad. Log out = change user (password screen).
  const handleLock = () => {
    setShowConfirm(false)
    lock()
  }

  const handleLogout = () => {
    setShowConfirm(false)
    void logout()
  }

  return (
    <>
      {/* Confirm dialog before logging out / locking screen */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden">
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs shadow-xl">
            <p className="font-bold text-gray-800 mb-1">ล็อกหน้าจอ?</p>
            <p className="text-sm text-gray-500 mb-4">คุณต้องการล็อกหน้าจอตอนนี้ใช่ไหม</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleLock}
                className="flex-1 py-2 rounded-xl bg-red-500 text-white font-semibold text-sm"
              >
                ล็อก
              </button>
            </div>
            <button
              onClick={handleLogout}
              className="w-full mt-3 py-2 text-sm font-semibold text-gray-400 hover:text-red-500"
            >
              ออกจากระบบ (เปลี่ยนผู้ใช้)
            </button>
          </div>
        </div>
      )}

    {/* Mobile: fixed bottom bar | Desktop: sticky left sidebar that stays while scrolling */}
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
        <h1 className="text-xl font-black text-blue-600 tracking-tight leading-tight break-words">{shopName || 'POS'}</h1>
        <p className="text-[10px] text-gray-400 font-medium">ระบบ POS</p>
        {role && (
          <span className={`inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
            role === 'admin' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
          }`}>
            <ShieldCheck size={10} /> {role === 'admin' ? 'ผู้ดูแลระบบ' : 'แคชเชียร์'}
          </span>
        )}
        {user && <p className="text-xs font-semibold text-gray-500 mt-1 truncate">{user.displayName}</p>}
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

      {/* Lock screen — mobile: inline in bottom bar | desktop: pinned to bottom */}
      <button
        onClick={() => setShowConfirm(true)}
        className="flex flex-col md:flex-row items-center gap-1 md:gap-3 px-3 py-2 rounded-2xl text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all text-center md:text-left md:mt-auto"
      >
        <LogOut size={20} />
        <span className="text-[10px] md:text-sm font-semibold">ล็อกหน้าจอ</span>
      </button>
    </nav>
    </>
  )
}
