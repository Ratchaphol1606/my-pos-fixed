"use client"
import { useState, useEffect } from 'react'
import { supabase } from '@/src/lib/supabase'
import { Settings, Save, Upload, Store, Phone, MapPin, CreditCard, AlertTriangle } from 'lucide-react'

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>({
    shop_name: '',
    shop_address: '',
    shop_phone: '',
    promptpay_id: '',
    qr_code_url: '',
    low_stock_threshold: 5
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    fetchSettings()
  }, [])

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
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><Store size={20} className="text-black"/> ข้อมูลร้านค้า</h2>
              
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
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2"><AlertTriangle size={20} className="text-black"/> ระบบสต็อก</h2>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">แจ้งเตือนสต็อกต่ำเมื่อเหลือน้อยกว่า (ชิ้น)</label>
                <input 
                  type="number"
                  className="w-full p-4 border border-slate-200 rounded-2xl outline-none text-black focus:border-blue-500"
                  value={settings.low_stock_threshold} 
                  onChange={e => setSettings({...settings, low_stock_threshold: Number(e.target.value)})} 
                />
              </div>
            </div>
          </div>

          {/* อัปโหลด QR Code */}
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center">
              <h2 className="text-xl font-bold mb-6 w-full text-center text-black">QR Code รับเงิน</h2>
              
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
    </div>
  )
}
