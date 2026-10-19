"use client"
import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import { Settings, Save, Upload, Store, Phone, MapPin, CreditCard, AlertTriangle, Award, Users, Search, Edit3, X, ChevronDown, Printer, Usb, Bluetooth } from 'lucide-react'
import { Customer, ReceiptDetail } from '@/src/types'
import Receipt from '@/app/component/Receipt'
import { printReceipt } from '@/src/lib/print'
import {
  SavedDevice,
  getSavedDevice,
  connectUsb,
  connectBluetooth,
  forgetDevice,
  isUsbSupported,
  isBluetoothSupported,
} from '@/src/lib/printerDevice'

const TEST_RECEIPT: ReceiptDetail = {
  items: [
    { name: 'ทดสอบสินค้า A', price: 100, qty: 1, subtotal: 100 },
    { name: 'ทดสอบสินค้า B', price: 50, qty: 2, subtotal: 100 },
  ],
  subtotal: 200,
  discount: 0,
  total: 200,
  received: 200,
  change: 0,
  paymentMethod: 'เงินสด',
  date: new Date().toLocaleString('th-TH'),
  receiptNo: 'TEST-PRINT',
}

// การ์ดที่พับ/ขยายได้ — โชว์แค่หัวข้อ กดถึงเห็นเนื้อหา
function Section({
  title,
  icon,
  isOpen,
  onToggle,
  children,
}: {
  title: string
  icon: React.ReactNode
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-8 text-left"
      >
        <h2 className="text-xl font-bold flex items-center gap-2">{icon} {title}</h2>
        <ChevronDown
          size={22}
          className={`text-slate-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && <div className="px-8 pb-8 -mt-2">{children}</div>}
    </div>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>({
    shop_name: '',
    shop_address: '',
    shop_phone: '',
    promptpay_id: '',
    qr_code_url: '',
    low_stock_threshold: 5,
    earn_amount_thb: 100,
    redeem_point_use: 10,
    redeem_discount_thb: 10,
    vat_enabled: false,
    print_mode: 'server',
    print_server_url: '',
    paper_width_mm: 58
  })
  const [testingPrint, setTestingPrint] = useState(false)
  // Printer connected directly to THIS device (USB / Bluetooth), stored in this browser only
  const [device, setDevice] = useState<SavedDevice | null>(null)
  const [deviceBusy, setDeviceBusy] = useState(false)
  const [usbOk, setUsbOk] = useState(false)
  const [btOk, setBtOk] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // ส่วนไหนกางอยู่บ้าง — ปิดหมดตอนเริ่ม เพื่อความเรียบร้อย
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    store: false,
    stock: false,
    printer: false,
    loyalty: false,
    qr: false,
    members: false,
  })
  const toggleSection = (key: string) =>
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))

  // --- จัดการสมาชิก (Member Management) ---
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editPoints, setEditPoints] = useState(0)
  const [savingCustomer, setSavingCustomer] = useState(false)

  useEffect(() => {
    fetchSettings()
    setDevice(getSavedDevice())
    setUsbOk(isUsbSupported())
    setBtOk(isBluetoothSupported())
  }, [])

  useEffect(() => {
    fetchCustomers()
  }, [customerSearch])

  const fetchCustomers = async () => {
    setLoadingCustomers(true)
    try {
      let query = supabase.from('customers').select('*').order('created_at', { ascending: false }).limit(50)
      if (customerSearch.trim()) {
        query = query.or(`name.ilike.%${customerSearch}%,phone.ilike.%${customerSearch}%`)
      }
      const { data, error } = await query
      if (error) throw error
      setCustomers(data || [])
    } catch (error) {
      console.error('Error fetching customers:', error)
    } finally {
      setLoadingCustomers(false)
    }
  }

  const openEditCustomer = (c: Customer) => {
    setEditingCustomer(c)
    setEditName(c.name)
    setEditPhone(c.phone)
    setEditPoints(c.current_points)
  }

  const closeEditCustomer = () => {
    setEditingCustomer(null)
  }

  const handleSaveCustomer = async () => {
    if (!editingCustomer) return
    const name = editName.trim()
    const phone = editPhone.trim()
    if (!name || !phone) {
      alert('กรุณากรอกชื่อและเบอร์โทรศัพท์')
      return
    }
    setSavingCustomer(true)
    try {
      const { error } = await supabase
        .from('customers')
        .update({ name, phone, current_points: editPoints })
        .eq('id', editingCustomer.id)

      if (error) {
        if (error.code === '23505') {
          alert('เบอร์โทรศัพท์นี้ถูกใช้โดยสมาชิกคนอื่นแล้ว')
        } else {
          throw error
        }
        return
      }

      alert('✅ บันทึกข้อมูลสมาชิกแล้ว')
      closeEditCustomer()
      fetchCustomers()
    } catch (error: any) {
      alert('❌ ผิดพลาด: ' + error.message)
    } finally {
      setSavingCustomer(false)
    }
  }

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single()
      if (data) {
        setSettings(data)
        if (data.qr_code_url) setPreviewUrl(data.qr_code_url)
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
    } finally {
      setLoading(false)
    }
  }

  // Tests with the values currently in the form (no need to save first)
  const handleTestPrint = async () => {
    setTestingPrint(true)
    try {
      const via = await printReceipt(
        settings,
        {
          ...TEST_RECEIPT,
          shopName: settings.shop_name || 'TEST',
          shopAddress: settings.shop_address || '',
          shopPhone: settings.shop_phone || ''
        },
        { fallbackToBrowser: false }
      )
      if (via !== 'browser') alert('✅ ส่งคำสั่งพิมพ์ไปที่เครื่องพิมพ์แล้ว')
    } catch (error: any) {
      alert('❌ พิมพ์ไม่สำเร็จ: ' + error.message)
    } finally {
      setTestingPrint(false)
    }
  }

  // These must run straight from a button click (browser security requirement)
  const handleConnectDevice = async (kind: 'usb' | 'bluetooth') => {
    setDeviceBusy(true)
    try {
      const saved = kind === 'usb' ? await connectUsb() : await connectBluetooth()
      setDevice(saved)
      alert(`✅ เชื่อมต่อ ${saved.name} แล้ว (ใช้กับเครื่องนี้เท่านั้น)`)
    } catch (error: any) {
      alert('❌ ' + error.message)
    } finally {
      setDeviceBusy(false)
    }
  }

  const handleForgetDevice = async () => {
    setDeviceBusy(true)
    try {
      await forgetDevice()
      setDevice(null)
    } finally {
      setDeviceBusy(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]
      setFile(selectedFile)
      setPreviewUrl(URL.createObjectURL(selectedFile))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      let qrUrl = settings.qr_code_url

      // 1. อัปโหลดรูปภาพถ้ามีการเลือกไฟล์ใหม่
      if (file) {
        const fileExt = file.name.split('.').pop()
        const fileName = `qr_code_${Date.now()}.${fileExt}`
        const { data, error: uploadError } = await supabase.storage
          .from('assets') // มั่นใจว่ามี bucket ชื่อ 'assets' และเปิด public
          .upload(fileName, file)

        if (uploadError) throw uploadError
        
        const { data: { publicUrl } } = supabase.storage
          .from('assets')
          .getPublicUrl(fileName)
        
        qrUrl = publicUrl
      }

      // 2. บันทึกข้อมูลลงตาราง settings ด้วย upsert เพื่อความมั่นใจว่ามีข้อมูล (id=1) เสมอ
      const { error } = await supabase
        .from('settings')
        .upsert({
          id: 1,
          shop_name: settings.shop_name,
          shop_address: settings.shop_address,
          shop_phone: settings.shop_phone,
          promptpay_id: settings.promptpay_id,
          qr_code_url: qrUrl,
          low_stock_threshold: settings.low_stock_threshold,
          earn_amount_thb: settings.earn_amount_thb,
          redeem_point_use: settings.redeem_point_use,
          redeem_discount_thb: settings.redeem_discount_thb,
          vat_enabled: settings.vat_enabled,
          print_mode: settings.print_mode || 'server',
          print_server_url: (settings.print_server_url || '').trim().replace(/\/+$/, '') || null,
          paper_width_mm: settings.paper_width_mm === 80 ? 80 : 58,
          updated_at: new Date().toISOString()
        })

      if (error) throw error
      alert('✅ บันทึกการตั้งค่าเรียบร้อยแล้ว')
      fetchSettings()
    } catch (error: any) {
      alert('❌ ผิดพลาด: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-8 text-center">กำลังโหลด...</div>

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-black italic tracking-tighter uppercase flex items-center gap-3">
            <Settings className="text-blue-500" size={40} /> System Settings
          </h1>
          <p className="text-slate-500 font-medium">ตั้งค่าข้อมูลร้านค้าและระบบ POS</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* ข้อมูลร้าน */}
          <div className="md:col-span-2 space-y-6">
            <Section
              title="ข้อมูลร้านค้า"
              icon={<Store size={20} className="text-black"/>}
              isOpen={openSections.store}
              onToggle={() => toggleSection('store')}
            >
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">ชื่อร้าน</label>
                  <input 
                    className="w-full p-4 border border-slate-200 rounded-2xl outline-none text-black focus:border-blue-500"
                    value={settings.shop_name} 
                    onChange={e => setSettings({...settings, shop_name: e.target.value})} 
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">ที่อยู่</label>
                  <textarea 
                    className="w-full p-4 border border-slate-200 rounded-2xl outline-none text-black focus:border-blue-500 min-h-[100px]"
                    value={settings.shop_address} 
                    onChange={e => setSettings({...settings, shop_address: e.target.value})} 
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block"><Phone size={12} className="inline mr-1"/> เบอร์โทรศัพท์</label>
                    <input 
                      className="w-full p-4 border border-slate-200 rounded-2xl outline-none text-black focus:border-blue-500"
                      value={settings.shop_phone} 
                      onChange={e => setSettings({...settings, shop_phone: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block"><CreditCard size={12} className="inline mr-1"/> PromptPay ID</label>
                    <input 
                      className="w-full p-4 border border-slate-200 rounded-2xl outline-none text-black focus:border-blue-500"
                      value={settings.promptpay_id} 
                      onChange={e => setSettings({...settings, promptpay_id: e.target.value})} 
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 p-4 border border-slate-200 rounded-2xl cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-blue-500"
                    checked={!!settings.vat_enabled}
                    onChange={e => setSettings({...settings, vat_enabled: e.target.checked})}
                  />
                  <span className="text-sm font-bold text-black">
                    เปิดใช้งานภาษีมูลค่าเพิ่ม (VAT 7%) บนใบกำกับภาษี
                  </span>
                </label>
              </div>
            </Section>

            <Section
              title="ระบบสต็อก"
              icon={<AlertTriangle size={20} className="text-black"/>}
              isOpen={openSections.stock}
              onToggle={() => toggleSection('stock')}
            >
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">แจ้งเตือนสต็อกต่ำเมื่อเหลือน้อยกว่า (ชิ้น)</label>
                <input 
                  type="number"
                  className="w-full p-4 border border-slate-200 rounded-2xl outline-none text-black focus:border-blue-500"
                  value={settings.low_stock_threshold} 
                  onChange={e => setSettings({...settings, low_stock_threshold: Number(e.target.value)})} 
                />
              </div>
            </Section>

            <Section
              title="เครื่องพิมพ์ใบเสร็จ"
              icon={<Printer size={20} className="text-black"/>}
              isOpen={openSections.printer}
              onToggle={() => toggleSection('printer')}
            >
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">วิธีพิมพ์</label>
                  <select
                    className="w-full p-4 border border-slate-200 rounded-2xl outline-none text-black focus:border-blue-500 bg-white"
                    value={settings.print_mode || 'server'}
                    onChange={e => setSettings({...settings, print_mode: e.target.value})}
                  >
                    <option value="server">Print server (เช่น Raspberry Pi / คอมในร้าน)</option>
                    <option value="browser">พิมพ์ผ่านเบราว์เซอร์ (เครื่องพิมพ์ที่ต่อกับอุปกรณ์นี้)</option>
                  </select>
                </div>

                {(settings.print_mode || 'server') === 'server' && (
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Print server URL</label>
                    <input
                      placeholder="https://print.example.com"
                      className="w-full p-4 border border-slate-200 rounded-2xl outline-none text-black focus:border-blue-500"
                      value={settings.print_server_url || ''}
                      onChange={e => setSettings({...settings, print_server_url: e.target.value})}
                    />
                    <p className="text-[10px] text-slate-400 mt-1.5">
                      ถ้าเว้นว่าง ระบบจะใช้ค่า NEXT_PUBLIC_PRINT_SERVER_URL เดิม (ถ้ามี)
                    </p>
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">ขนาดกระดาษ</label>
                  <select
                    className="w-full p-4 border border-slate-200 rounded-2xl outline-none text-black focus:border-blue-500 bg-white"
                    value={settings.paper_width_mm === 80 ? 80 : 58}
                    onChange={e => setSettings({...settings, paper_width_mm: Number(e.target.value)})}
                  >
                    <option value={58}>58 มม.</option>
                    <option value={80}>80 มม.</option>
                  </select>
                </div>

                {/* เครื่องพิมพ์ที่ต่อกับอุปกรณ์นี้โดยตรง */}
                <div className="p-4 border border-slate-200 rounded-2xl space-y-3">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    เครื่องพิมพ์ที่ต่อกับอุปกรณ์นี้ (USB / Bluetooth)
                  </p>

                  {device ? (
                    <div className="flex items-center justify-between gap-3 bg-green-50 border border-green-100 rounded-xl p-3">
                      <div className="text-sm text-black min-w-0">
                        <p className="font-bold truncate">
                          {device.type === 'usb' ? 'USB' : 'Bluetooth'}: {device.name}
                        </p>
                        <p className="text-[10px] text-slate-500">อุปกรณ์นี้จะพิมพ์ตรงเข้าเครื่องนี้ แทนค่าของร้าน</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleForgetDevice}
                        disabled={deviceBusy}
                        className="shrink-0 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 disabled:opacity-40"
                      >
                        ยกเลิกการเชื่อมต่อ
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">ยังไม่ได้เชื่อมต่อ — อุปกรณ์นี้ใช้ค่าของร้านด้านบน</p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleConnectDevice('usb')}
                      disabled={deviceBusy || !usbOk}
                      className="py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      <Usb size={16} /> เชื่อมต่อ USB
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConnectDevice('bluetooth')}
                      disabled={deviceBusy || !btOk}
                      className="py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      <Bluetooth size={16} /> เชื่อมต่อ Bluetooth
                    </button>
                  </div>

                  {!usbOk && !btOk && (
                    <p className="text-[10px] text-red-500">
                      เบราว์เซอร์นี้ไม่รองรับการพิมพ์ตรง (ต้องใช้ Chrome หรือ Edge — ไม่รองรับ iPhone/iPad)
                    </p>
                  )}
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    ไม่ต้องใช้ Raspberry Pi และตั้งค่าแยกได้ทีละเครื่อง ถ้าเครื่องพิมพ์ส่งไม่สำเร็จ ระบบจะพิมพ์ผ่านเบราว์เซอร์แทนตอนขาย
                    หมายเหตุ: บน Windows ที่ติดตั้งไดรเวอร์เครื่องพิมพ์แล้ว USB จะเชื่อมต่อไม่ได้ ให้ใช้ Bluetooth หรือ Android แทน
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleTestPrint}
                  disabled={testingPrint}
                  className="w-full py-4 bg-slate-100 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <Printer size={18} />
                  {testingPrint ? 'กำลังพิมพ์...' : 'ทดสอบพิมพ์'}
                </button>
                <p className="text-[10px] text-slate-400">
                  ทดสอบด้วยค่าที่กรอกอยู่ตอนนี้ (ยังไม่ต้องกดบันทึก) แต่ต้องกด SAVE SETTINGS เพื่อใช้งานจริง
                </p>
              </div>
            </Section>


            <Section
              title="ระบบสมาชิก / แต้มสะสม"
              icon={<Award size={20} className="text-black"/>}
              isOpen={openSections.loyalty}
              onToggle={() => toggleSection('loyalty')}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">ซื้อครบ (บาท) = 1 แต้ม</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full p-4 border border-slate-200 rounded-2xl outline-none text-black focus:border-blue-500"
                    value={settings.earn_amount_thb}
                    onChange={e => setSettings({...settings, earn_amount_thb: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">ใช้ (แต้ม) เพื่อแลก</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full p-4 border border-slate-200 rounded-2xl outline-none text-black focus:border-blue-500"
                    value={settings.redeem_point_use}
                    onChange={e => setSettings({...settings, redeem_point_use: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">ได้ส่วนลด (บาท)</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full p-4 border border-slate-200 rounded-2xl outline-none text-black focus:border-blue-500"
                    value={settings.redeem_discount_thb}
                    onChange={e => setSettings({...settings, redeem_discount_thb: Number(e.target.value)})}
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-3">
                ตัวอย่าง: ซื้อครบ {settings.earn_amount_thb || 0} บาท ได้ 1 แต้ม, ใช้ {settings.redeem_point_use || 0} แต้ม แลกส่วนลด {settings.redeem_discount_thb || 0} บาท
              </p>
            </Section>
      
           { /* -- - จัดการสมาชิก --- */}
        <Section
          title="จัดการสมาชิก"
          icon={<Users size={20} className="text-black"/>}
          isOpen={openSections.members}
          onToggle={() => toggleSection('members')}
        >
          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            <input
              placeholder="ค้นหาชื่อหรือเบอร์โทรศัพท์..."
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-2xl outline-none transition-all text-black"
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
            />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">
                  <th className="p-4">ชื่อ</th>
                  <th className="p-4">เบอร์โทรศัพท์</th>
                  <th className="p-4 text-center">แต้มสะสม</th>
                  <th className="p-4 text-right">ยอดซื้อสะสม</th>
                  <th className="p-4 text-right">แก้ไข</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {customers.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-bold text-slate-800">{c.name}</td>
                    <td className="p-4 text-slate-500 font-mono text-sm">{c.phone}</td>
                    <td className="p-4 text-center">
                      <span className="inline-block px-3 py-1 rounded-xl font-black text-xs bg-blue-50 text-blue-600 border border-blue-100">
                        {c.current_points} แต้ม
                      </span>
                    </td>
                    <td className="p-4 text-right text-slate-500 text-sm">฿{Number(c.total_spent).toLocaleString()}</td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => openEditCustomer(c)}
                        className="p-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all"
                        title="แก้ไขข้อมูลสมาชิก"
                      >
                        <Edit3 size={16}/>
                      </button>
                    </td>
                  </tr>
                ))}
                {!loadingCustomers && customers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-slate-400 font-bold">
                      ไม่พบสมาชิก
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
        
          {/* อัปโหลด QR Code */}
            <Section
              title="QR Code รับเงิน"
              icon={<CreditCard size={20} className="text-black"/>}
              isOpen={openSections.qr}
              onToggle={() => toggleSection('qr')}
            >
              <div className="flex flex-col items-center">
              <div className="w-full aspect-square bg-slate-100 rounded-3xl mb-4 overflow-hidden border-2 border-dashed border-slate-200 flex items-center justify-center relative group">
                {previewUrl ? (
                  <img src={previewUrl} alt="QR Preview" className="w-full h-full object-contain" />
                ) : (
                  <div className="text-slate-400 text-center p-4">
                    <Upload size={40} className="mx-auto mb-2 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-widest">ยังไม่มีรูปภาพ</p>
                  </div>
                )}
                <label className="absolute inset-0 bg-blue-600/80 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer font-bold">
                  <Upload size={24} className="mr-2" /> เปลี่ยนรูปภาพ
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                </label>
              </div>
              <p className="text-[10px] text-slate-400 text-center leading-tight font-medium">
                แนะนำเป็นรูปภาพสี่เหลี่ยมจตุรัส<br/>(PNG หรือ JPG)
              </p>
              </div>
            </Section>

         
            <button 
              onClick={handleSave}
              disabled={saving}
              className="w-full py-6 bg-blue-600 text-white rounded-[2rem] font-black text-xl shadow-xl shadow-blue-200 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:bg-slate-300"
            >
              {saving ? 'กำลังบันทึก...' : <><Save size={24}/> SAVE SETTINGS</>}
            </button>
        </div>

        </div>

        
      </div>

      {/* Sample receipt used only by "ทดสอบพิมพ์" in browser mode */}
      <div className="hidden print:block fixed top-0 left-0 bg-white">
        <Receipt detail={TEST_RECEIPT} settings={settings} />
      </div>

      {editingCustomer && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={closeEditCustomer}
        >
          <div
            className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-bold text-black">แก้ไขข้อมูลสมาชิก</h2>
              <button onClick={closeEditCustomer} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">ชื่อ / ชื่อเล่น</label>
                <input
                  className="w-full p-4 border border-slate-200 rounded-2xl outline-none text-black focus:border-blue-500"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">เบอร์โทรศัพท์</label>
                <input
                  className="w-full p-4 border border-slate-200 rounded-2xl outline-none text-black focus:border-blue-500"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">
                  <Award size={12} className="inline mr-1"/> แต้มสะสม (ปรับด้วยมือ)
                </label>
                <input
                  type="number"
                  className="w-full p-4 border border-slate-200 rounded-2xl outline-none text-black focus:border-blue-500"
                  value={editPoints}
                  onChange={e => setEditPoints(Number(e.target.value))}
                />
                <p className="text-[10px] text-slate-400 mt-1.5">
                  ⚠️ การแก้ไขแต้มตรงนี้จะไม่บันทึกลงประวัติธุรกรรม (point_transactions) ใช้สำหรับแก้ไขข้อผิดพลาดเท่านั้น
                </p>
              </div>
            </div>

            <div className="p-6 border-t flex gap-3">
              <button
                onClick={closeEditCustomer}
                className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveCustomer}
                disabled={savingCustomer}
                className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <Save size={18} />
                {savingCustomer ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}