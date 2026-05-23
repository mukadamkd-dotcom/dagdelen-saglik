'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { useMode } from '@/contexts/ModeContext'
import { supabase } from '@/lib/supabase'

const adminMenu = [
  { href: '/', label: 'Ana Sayfa' },
  { href: '/satis-ekrani', label: 'Satış Ekranı' },
  { href: '/urunler', label: 'Ürünler' },
  { href: '/maliyet', label: 'Maliyet Güncelle' },
  { href: '/fiyat', label: 'Satış Fiyatı Güncelle' },
  { href: '/stok', label: 'Stok Durumu' },
  { href: '/satin-alma', label: 'Satın Alma' },
  { href: '/satislar', label: 'Satışlar' },
  { href: '/transferler', label: 'Transferler' },
  { href: '/ic-borclar', label: 'Takaslar ve İç Borçlar' },
  { href: '/musteriler', label: 'Müşteriler' },
  { href: '/takip', label: 'Müşteri Takip' },
  { href: '/veresiye', label: 'Veresiye' },
  { href: '/kargo', label: 'Kargo' },
  { href: '/fire', label: 'Fire & İade' },
  { href: '/raporlar', label: 'Raporlar' },
  { href: '/import', label: 'Excel İçe Aktar' },
]

const cashierMenu = [
  { href: '/', label: 'Ana Sayfa' },
  { href: '/satis-ekrani', label: 'Satış Ekranı' },
  { href: '/stok', label: 'Stok Durumu' },
  { href: '/satislar', label: 'Satışlar' },
  { href: '/musteriler', label: 'Müşteriler' },
  { href: '/takip', label: 'Müşteri Takip' },
  { href: '/ic-borclar', label: 'Takaslar ve İç Borçlar' },
  { href: '/fire', label: 'Fire & İade' },
]

interface LocationRow { id: string; name: string; cashier_pin: string | null }

export default function Sidebar() {
  const pathname = usePathname()
  const { isAdminMode, cashierLocationId, enterAdminMode, enterCashierMode } = useMode()

  // Admin PIN modal
  const [showAdminPin, setShowAdminPin] = useState(false)
  const [adminPin, setAdminPin] = useState('')
  const [adminPinError, setAdminPinError] = useState(false)

  // Kasiyer şube + PIN modal
  const [showLocModal, setShowLocModal] = useState(false)
  const [locStep, setLocStep] = useState<'select' | 'pin'>('select')
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [selectedLocId, setSelectedLocId] = useState('')
  const [cashierPin, setCashierPin] = useState('')
  const [cashierPinError, setCashierPinError] = useState(false)

  // Gizli admin tetikleyici
  const [logoClicks, setLogoClicks] = useState(0)
  const logoClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const menu = isAdminMode ? adminMenu : cashierMenu

  // İlk açılışta şube seçilmemişse modal aç
  useEffect(() => {
    if (!isAdminMode && !cashierLocationId) {
      openLocModal()
    }
  }, [isAdminMode, cashierLocationId])

  async function openLocModal() {
    const { data } = await supabase.from('locations').select('id, name, cashier_pin').order('name')
    setLocations((data ?? []) as LocationRow[])
    setSelectedLocId(data?.[0]?.id ?? '')
    setLocStep('select')
    setCashierPin('')
    setCashierPinError(false)
    setShowLocModal(true)
  }

  function handleLocNext() {
    if (!selectedLocId) return
    setLocStep('pin')
    setCashierPin('')
    setCashierPinError(false)
  }

  function handleCashierPinSubmit() {
    const loc = locations.find(l => l.id === selectedLocId)
    if (!loc) return
    const correctPin = loc.cashier_pin ?? '0000'
    if (cashierPin === correctPin) {
      enterCashierMode(loc.id, loc.name)
      setShowLocModal(false)
    } else {
      setCashierPinError(true)
      setCashierPin('')
    }
  }

  function handleAdminPinSubmit() {
    const success = enterAdminMode(adminPin)
    if (success) { setShowAdminPin(false); setAdminPin(''); setAdminPinError(false) }
    else { setAdminPinError(true); setAdminPin('') }
  }

  function handleLogoClick() {
    const newCount = logoClicks + 1
    setLogoClicks(newCount)
    if (logoClickTimer.current) clearTimeout(logoClickTimer.current)
    if (newCount >= 5) {
      setLogoClicks(0)
      setShowAdminPin(true)
    } else {
      logoClickTimer.current = setTimeout(() => setLogoClicks(0), 2000)
    }
  }

  // Modal kapatılabilir mi? Şube seçilmişse veya admin moddaysa evet
  const canDismissLocModal = isAdminMode || !!cashierLocationId

  return (
    <>
      <aside
        className="fixed left-0 top-0 h-screen flex flex-col z-40"
        style={{ width: '260px', background: '#FFFFFF', borderRight: '1px solid #E5E7EB' }}
      >
        {/* Brand */}
        <div
          className="px-6 py-5 flex-shrink-0 cursor-default select-none"
          style={{ background: '#F27A1A' }}
          onClick={handleLogoClick}
        >
          <p className="text-white font-bold text-xl tracking-wide" style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontWeight: 600 }}>
            Dağdelen
          </p>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', marginTop: '2px', fontWeight: 500 }}>
            {isAdminMode ? 'Yönetim Paneli' : 'Kasiyer Modu'}
          </p>
        </div>

        {!isAdminMode && (
          <div className="mx-4 mt-3 px-3 py-1.5 text-center" style={{ background: '#FFF3E8', border: '1px solid #FDBA74', borderRadius: '4px' }}>
            <p style={{ color: '#F27A1A', fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Kasiyer Modu Aktif</p>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {menu.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between px-3 py-2.5 mb-0.5 transition-all duration-150"
                style={{
                  borderRadius: '6px',
                  background: active ? '#FFF3E8' : 'transparent',
                  borderLeft: active ? '3px solid #F27A1A' : '3px solid transparent',
                }}
              >
                <span
                  className="text-[12px] font-medium transition-colors"
                  style={{ color: active ? '#F27A1A' : '#1A1A1A', fontWeight: active ? 700 : 500 }}
                >
                  {item.label}
                </span>
                {active && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#F27A1A' }} />}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 pb-5 pt-3 flex-shrink-0" style={{ borderTop: '1px solid #F0F0F0' }}>
          <button
            onClick={openLocModal}
            className="w-full flex items-center justify-center px-3 py-2.5 mb-3 transition-all font-semibold text-[11px] tracking-wider uppercase"
            style={{ borderRadius: '6px', border: '1.5px solid #F27A1A', color: '#F27A1A', background: 'white' }}
          >
            {isAdminMode ? 'Kasiyer Moduna Geç' : 'Şube Değiştir'}
          </button>
          <div className="flex items-center justify-center gap-2">
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22C55E' }} />
            <p style={{ color: '#9CA3AF', fontSize: '10px' }}>Sistem aktif · v1.0.0</p>
          </div>
        </div>
      </aside>

      {/* Kasiyer Şube + PIN Modal */}
      {showLocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm shadow-2xl" style={{ background: '#FFFFFF', borderRadius: '12px', overflow: 'hidden' }}>
            <div className="px-6 py-4" style={{ background: '#F27A1A' }}>
              <h3 className="text-white font-bold text-lg">
                {locStep === 'select' ? 'Şubenizi Seçin' : 'Kasiyer PIN'}
              </h3>
              <p className="text-white/80 text-xs mt-0.5">
                {locStep === 'select'
                  ? 'Kasiyer olarak hangi şubede çalışıyorsunuz?'
                  : `${locations.find(l => l.id === selectedLocId)?.name} — PIN kodunuzu girin`}
              </p>
            </div>

            <div className="p-6">
              {locStep === 'select' ? (
                <>
                  <select
                    className="w-full px-4 py-3 text-sm outline-none bg-white text-stone-800 mb-5 font-medium"
                    style={{ border: '1.5px solid #E5E7EB', borderRadius: '8px' }}
                    value={selectedLocId}
                    onChange={e => setSelectedLocId(e.target.value)}
                  >
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <div className="flex gap-3">
                    <button
                      onClick={handleLocNext}
                      disabled={!selectedLocId}
                      className="flex-1 py-3 text-white font-semibold text-sm disabled:opacity-40"
                      style={{ background: '#F27A1A', borderRadius: '8px' }}
                    >
                      Devam Et
                    </button>
                    {canDismissLocModal && (
                      <button
                        onClick={() => setShowLocModal(false)}
                        className="flex-1 py-3 font-semibold text-sm"
                        style={{ background: '#F5F5F5', color: '#1A1A1A', borderRadius: '8px' }}
                      >
                        İptal
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <input
                    type="password"
                    maxLength={6}
                    autoFocus
                    className="w-full px-4 py-4 text-center text-3xl font-bold tracking-[0.5em] outline-none bg-gray-50 text-stone-900 mb-3"
                    style={{ border: `1.5px solid ${cashierPinError ? '#EF4444' : '#E5E7EB'}`, borderRadius: '8px' }}
                    value={cashierPin}
                    onChange={e => { setCashierPin(e.target.value.replace(/\D/g, '')); setCashierPinError(false) }}
                    onKeyDown={e => e.key === 'Enter' && handleCashierPinSubmit()}
                    placeholder="····"
                  />
                  {cashierPinError && (
                    <p className="text-center text-red-500 text-sm font-medium mb-3">Yanlış PIN. Tekrar deneyin.</p>
                  )}
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={handleCashierPinSubmit}
                      className="flex-1 py-3 text-white font-semibold text-sm"
                      style={{ background: '#F27A1A', borderRadius: '8px' }}
                    >
                      Giriş Yap
                    </button>
                    <button
                      onClick={() => setLocStep('select')}
                      className="flex-1 py-3 font-semibold text-sm"
                      style={{ background: '#F5F5F5', color: '#1A1A1A', borderRadius: '8px' }}
                    >
                      Geri
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Gizli Admin PIN Modal */}
      {showAdminPin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm shadow-2xl" style={{ background: '#FFFFFF', borderRadius: '12px', overflow: 'hidden' }}>
            <div className="px-6 py-4" style={{ background: '#F27A1A' }}>
              <h3 className="text-white font-bold text-lg">Yönetici Girişi</h3>
              <p className="text-white/80 text-xs mt-0.5">PIN kodunuzu girin</p>
            </div>
            <div className="p-6">
              <input
                type="password"
                maxLength={6}
                autoFocus
                className="w-full px-4 py-4 text-center text-3xl font-bold tracking-[0.5em] outline-none bg-gray-50 text-stone-900 mb-3"
                style={{ border: '1.5px solid #E5E7EB', borderRadius: '8px' }}
                value={adminPin}
                onChange={e => { setAdminPin(e.target.value.replace(/\D/g, '')); setAdminPinError(false) }}
                onKeyDown={e => e.key === 'Enter' && handleAdminPinSubmit()}
                placeholder="····"
              />
              {adminPinError && (
                <p className="text-center text-red-500 text-sm font-medium mb-3">Yanlış PIN. Tekrar deneyin.</p>
              )}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleAdminPinSubmit}
                  className="flex-1 py-3 text-white font-semibold text-sm"
                  style={{ background: '#F27A1A', borderRadius: '8px' }}
                >Giriş Yap</button>
                <button
                  onClick={() => { setShowAdminPin(false); setAdminPin(''); setAdminPinError(false) }}
                  className="flex-1 py-3 font-semibold text-sm"
                  style={{ background: '#F5F5F5', color: '#1A1A1A', borderRadius: '8px' }}
                >İptal</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
