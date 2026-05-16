'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useMode } from '@/contexts/ModeContext'
import { supabase } from '@/lib/supabase'

const adminMenu = [
  { href: '/', label: 'Ana Sayfa' },
  { href: '/satis-ekrani', label: 'Satış Ekranı' },
  { href: '/urunler', label: 'Ürünler' },
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
  { href: '/kargo', label: 'Kargo' },
  { href: '/fire', label: 'Fire & İade' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { isAdminMode, enterAdminMode, enterCashierMode } = useMode()
  const [showPinModal, setShowPinModal] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [showLocModal, setShowLocModal] = useState(false)
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [selectedLocId, setSelectedLocId] = useState('')

  const menu = isAdminMode ? adminMenu : cashierMenu

  function handlePinSubmit() {
    const success = enterAdminMode(pin)
    if (success) { setShowPinModal(false); setPin(''); setPinError(false) }
    else { setPinError(true); setPin('') }
  }

  async function openLocModal() {
    const { data } = await supabase.from('locations').select('id, name').order('name')
    setLocations(data ?? [])
    setSelectedLocId(data?.[0]?.id ?? '')
    setShowLocModal(true)
  }

  function confirmCashierMode() {
    const loc = locations.find(l => l.id === selectedLocId)
    if (!loc) return
    enterCashierMode(loc.id, loc.name)
    setShowLocModal(false)
  }

  return (
    <>
      <aside
        className="fixed left-0 top-0 h-screen flex flex-col z-40"
        style={{ width: '260px', background: '#0F766E', borderRight: '1px solid #0D9488' }}
      >
        {/* Brand */}
        <div className="px-7 pt-8 pb-6">
          <p
            className="text-white text-lg tracking-[0.2em] uppercase"
            style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontWeight: 300, letterSpacing: '0.25em' }}
          >
            Dağdelen
          </p>
          <p style={{ color: '#CCFBF1', fontSize: '9px', letterSpacing: '0.35em', textTransform: 'uppercase', marginTop: '3px', fontWeight: 500 }}>
            {isAdminMode ? 'Yönetim Paneli' : 'Kasiyer Modu'}
          </p>
        </div>

        {/* Gold divider */}
        <div className="mx-7 mb-5" style={{ height: '1px', background: 'linear-gradient(90deg, transparent, #CCFBF1, transparent)', opacity: 0.5 }} />

        {!isAdminMode && (
          <div className="mx-5 mb-4 px-4 py-2 text-center" style={{ border: '1px solid rgba(94,234,212,0.5)', borderRadius: '2px' }}>
            <p style={{ color: '#CCFBF1', fontSize: '9px', letterSpacing: '0.3em', textTransform: 'uppercase', fontWeight: 600 }}>Kasiyer Modu Aktif</p>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-4 py-1">
          {menu.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between px-3 py-2.5 mb-0.5 transition-all duration-150 group"
                style={{
                  borderRadius: '2px',
                  background: active ? (isAdminMode ? 'rgba(204,251,241,0.15)' : 'rgba(204,251,241,0.12)') : 'transparent',
                  borderLeft: active ? '2px solid #5EEAD4' : '2px solid transparent',
                }}
              >
                <span
                  className="text-[11px] tracking-[0.12em] uppercase font-medium transition-colors"
                  style={{ color: active ? '#CCFBF1' : 'rgba(204,251,241,0.6)', letterSpacing: '0.12em' }}
                >
                  {item.label}
                </span>
                {active && <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#5EEAD4', opacity: 0.8 }} />}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 pb-6 pt-4" style={{ borderTop: '1px solid #0D9488' }}>
          {isAdminMode ? (
            <button
              onClick={openLocModal}
              className="w-full flex items-center gap-3 px-3 py-2.5 mb-3 transition-all text-left"
              style={{ borderRadius: '2px', border: '1px solid rgba(94,234,212,0.4)' }}
            >
              <span style={{ color: 'rgba(204,251,241,0.5)', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500 }}>Kasiyer Moduna Geç</span>
            </button>
          ) : (
            <button
              onClick={() => setShowPinModal(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 mb-3 transition-all text-left"
              style={{ borderRadius: '2px', border: '1px solid rgba(94,234,212,0.5)', background: 'rgba(94,234,212,0.1)' }}
            >
              <span style={{ color: '#CCFBF1', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>Yönetici Girişi</span>
            </button>
          )}
          <div className="flex items-center gap-2 px-1">
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#4A9060', boxShadow: '0 0 6px rgba(74,144,96,0.6)' }} />
            <p style={{ color: 'rgba(204,251,241,0.5)', fontSize: '10px', letterSpacing: '0.08em' }}>Sistem aktif · v1.0.0</p>
          </div>
        </div>
      </aside>

      {/* Location Selection Modal */}
      {showLocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,10,8,0.75)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm p-8 shadow-2xl" style={{ background: '#F0FDFA', border: '1px solid #99F6E4' }}>
            <p className="text-center mb-1 text-stone-500 text-[10px] tracking-[0.3em] uppercase">Lokasyon Seçimi</p>
            <h3 className="text-center text-stone-900 text-xl mb-6" style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontWeight: 400 }}>Şubenizi Seçin</h3>
            <select
              className="w-full px-4 py-3 text-sm outline-none bg-white text-stone-800 mb-5"
              style={{ border: '1px solid #99F6E4', borderRadius: '2px' }}
              value={selectedLocId}
              onChange={e => setSelectedLocId(e.target.value)}
            >
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <div className="flex gap-3">
              <button
                onClick={confirmCashierMode}
                disabled={!selectedLocId}
                className="flex-1 py-3 text-white text-[11px] tracking-[0.2em] uppercase font-medium transition-colors disabled:opacity-40"
                style={{ background: '#0F766E', borderRadius: '2px' }}
              >Devam Et</button>
              <button
                onClick={() => setShowLocModal(false)}
                className="flex-1 py-3 text-stone-600 text-[11px] tracking-[0.2em] uppercase font-medium transition-colors"
                style={{ background: '#CCFBF1', borderRadius: '2px' }}
              >İptal</button>
            </div>
          </div>
        </div>
      )}

      {/* PIN Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,10,8,0.75)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm p-8 shadow-2xl" style={{ background: '#F0FDFA', border: '1px solid #99F6E4' }}>
            <p className="text-center mb-1 text-stone-500 text-[10px] tracking-[0.3em] uppercase">Güvenlik</p>
            <h3 className="text-center text-stone-900 text-xl mb-6" style={{ fontFamily: 'var(--font-display, Georgia, serif)', fontWeight: 400 }}>Yönetici Girişi</h3>
            <input
              type="password"
              maxLength={6}
              autoFocus
              className="w-full px-4 py-4 text-center text-3xl font-light tracking-[0.5em] outline-none bg-white text-stone-900 mb-3"
              style={{ border: '1px solid #99F6E4', borderRadius: '2px' }}
              value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setPinError(false) }}
              onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
              placeholder="····"
            />
            {pinError && (
              <p className="text-center text-red-500 text-xs tracking-wider mb-3">Yanlış PIN. Tekrar deneyin.</p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={handlePinSubmit}
                className="flex-1 py-3 text-white text-[11px] tracking-[0.2em] uppercase font-medium"
                style={{ background: '#0F766E', borderRadius: '2px' }}
              >Giriş Yap</button>
              <button
                onClick={() => { setShowPinModal(false); setPin(''); setPinError(false) }}
                className="flex-1 py-3 text-stone-600 text-[11px] tracking-[0.2em] uppercase font-medium"
                style={{ background: '#CCFBF1', borderRadius: '2px' }}
              >İptal</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
