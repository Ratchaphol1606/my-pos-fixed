"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShoppingCart, Package, BarChart3, DollarSign, BarChart2Icon, DollarSignIcon } from 'lucide-react'

export default function Navbar() {
  const pathname = usePathname()
  
  const menuItems = [
    { name: 'คิดเงิน', href: '/', icon: <ShoppingCart size={20} /> },
    { name: 'สินค้า', href: '/products', icon: <Package size={20} /> },
    { name: 'ยอดขาย', href: '/sales', icon: <DollarSign size={20} /> },
    { name: 'รายงานสรุป', href: '/reports', icon: <BarChart3 size={20} /> },
    { name: 'ภาษี', href: '/taxReports', icon: <DollarSignIcon size={20} /> },
  ]

  return (
    <nav className="fixed bottom-0 w-full bg-white border-t flex justify-around p-2 md:relative md:border-t-0 md:border-r md:w-64 md:flex-col md:justify-start md:gap-2 md:p-4 z-40">
      <div className="hidden md:block mb-8 px-4">
        <h1 className="text-2xl font-black text-blue-600">MY POS</h1>
      </div>
      {menuItems.map((item) => (
        <Link 
          key={item.href} 
          href={item.href}
          className={`flex flex-col md:flex-row items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
            pathname === item.href ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          {item.icon}
          <span className="text-xs md:text-lg font-medium">{item.name}</span>
        </Link>
      ))}
    </nav>
  )
}