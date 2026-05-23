'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface ProductRow {
  id: string
  name: string
  image_url: string | null
  current_standard: number
  current_min: number
  newStandard: string
  newMin: string
}

export default function FiyatPage() {
  const [rows, setRows] = useState<ProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)

  useEffect(() => { fetchProducts() }, [])

  async function fetchProducts() {
    const { data } = await supabase
      .from('products')
      .select('id, name, image_url, standard_price, min_sale_price')
      .eq('is_active', true)
      .order('name')
    setRows((data ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      image_url: p.image_url ?? null,
      current_standard: Number(p.standard_price),
      current_min: Number(p.min_sale_price),
      newStandard: '',
      newMin: '',
    })))
    setLoading(false)
  }

  function setField(id: string, field: 'newStandard' | 'newMin', val: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r))
  }

  function fillAllFromStandard() {
    setRows(prev => prev.map(r => {
      if (r.newStandard && parseFloat(r.newStandard) > 0) {
        const std = parseFloat(r.newStandard)
        return { ...r, newMin: r.newMin || (Math.round(std * 0.9 * 100) / 100).toString() }
      }
      return r
    }))
  }

  async function saveAll() {
    const changed = rows.filter(r =>
      (r.newStandard.trim() !== '' && parseFloat(r.newStandard) > 0) ||
      (r.newMin.trim() !== '' && parseFloat(r.newMin) > 0)
    )
    if (changed.length === 0) { alert('Hiç fiyat girilmedi.'); return }
    setSaving(true)
    for (const r of changed) {
      const updates: Record<string, number> = {}
      if (r.newStandard.trim() !== '' && parseFloat(r.newStandard) > 0)
        updates.standard_price = Math.round(parseFloat(r.newStandard) * 100) / 100
      if (r.newMin.trim() !== '' && parseFloat(r.newMin) > 0)
        updates.min_sale_price = Math.round(parseFloat(r.newMin) * 100) / 100
      await supabase.from('products').update(updates).eq('id', r.id)
    }
    setSaving(false)
    setSavedCount(changed.length)
    fetchProducts()
    setTimeout(() => setSavedCount(0), 3000)
  }

  const filtered = rows.filter(r =>
    !search.trim() || r.name.toLowerCase().includes(search.toLowerCase())
  )
  const changedCount = rows.filter(r =>
    (r.newStandard.trim() !== '' && parseFloat(r.newStandard) > 0) ||
    (r.newMin.trim() !== '' && parseFloat(r.newMin) > 0)
  ).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight">Satış Fiyatı Güncelle</h2>
          <p className="text-stone-400 text-sm mt-1">Satış ve minimum fiyatları toplu güncelleyin</p>
        </div>
        <div className="flex items-center gap-4">
          {savedCount > 0 && (
            <span className="text-emerald-600 text-sm font-semibold">✓ {savedCount} ürün kaydedildi</span>
          )}
          {changedCount > 0 && !savedCount && (
            <span className="text-stone-400 text-sm">{changedCount} ürün girildi</span>
          )}
          <button
            onClick={saveAll}
            disabled={saving || changedCount === 0}
            className="bg-[#F27A1A] hover:bg-[#E06010] disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium shadow-sm transition-all"
          >
            {saving ? 'Kaydediliyor...' : `Kaydet${changedCount > 0 ? ` (${changedCount})` : ''}`}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-stone-200 shadow-sm p-4 mb-5">
        <div className="flex gap-4 items-center flex-wrap">
          <div className="relative flex-1 min-w-48">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm select-none">⌕</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Ürün ara..."
              className="w-full border border-stone-200 rounded-sm pl-9 pr-4 py-2.5 text-sm outline-none focus:border-orange-400 transition-colors"
            />
          </div>

          <div className="flex items-center gap-3 border-l border-stone-200 pl-4">
            <button
              onClick={fillAllFromStandard}
              className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-4 py-2 rounded-sm text-xs font-semibold transition-colors whitespace-nowrap"
            >
              Min fiyatı otomatik doldur (%90)
            </button>
          </div>

          <div className="border-l border-stone-200 pl-4">
            <p className="text-xs text-stone-400">
              Toplam <span className="font-semibold text-stone-600">{rows.length}</span> ürün
            </p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-100">
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] w-14">Görsel</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Ürün Adı</th>
                <th className="px-5 py-3.5 text-right text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Mevcut Satış ₺</th>
                <th className="px-5 py-3.5 text-right text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Mevcut Min ₺</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Yeni Satış Fiyatı</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Yeni Min Fiyat</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <div className="flex items-center justify-center gap-2.5">
                      <div className="w-5 h-5 border-2 border-stone-200 border-t-orange-600 rounded-full animate-spin" />
                      <span className="text-stone-400 text-sm">Yükleniyor...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-stone-400 text-sm">Ürün bulunamadı</td>
                </tr>
              ) : filtered.map(r => {
                const changedRow =
                  (r.newStandard.trim() !== '' && parseFloat(r.newStandard) > 0) ||
                  (r.newMin.trim() !== '' && parseFloat(r.newMin) > 0)
                return (
                  <tr key={r.id} className={`border-b border-stone-50 transition-colors ${changedRow ? 'bg-[#FFF3E8]/50' : 'hover:bg-stone-50/60'}`}>
                    <td className="px-5 py-3">
                      <div className="w-10 h-10 bg-stone-100 rounded-sm flex items-center justify-center overflow-hidden">
                        {r.image_url
                          ? <img src={r.image_url} alt={r.name} className="w-full h-full object-contain p-0.5" />
                          : <span className="text-stone-400 text-sm font-bold">{r.name.charAt(0).toUpperCase()}</span>
                        }
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-stone-800">{r.name}</p>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-stone-500 tabular-nums text-sm font-semibold">
                        ₺{r.current_standard.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-stone-400 tabular-nums text-xs">
                        ₺{r.current_min.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className={`flex items-center border rounded-sm overflow-hidden w-36 transition-colors ${r.newStandard && parseFloat(r.newStandard) > 0 ? 'border-orange-400' : 'border-stone-200 focus-within:border-orange-400'}`}>
                        <span className="pl-3 text-stone-400 text-xs flex-shrink-0">₺</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={r.newStandard}
                          onChange={e => setField(r.id, 'newStandard', e.target.value)}
                          placeholder="0.00"
                          className="flex-1 px-2 py-2.5 text-sm font-semibold text-stone-900 outline-none tabular-nums bg-transparent"
                        />
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className={`flex items-center border rounded-sm overflow-hidden w-36 transition-colors ${r.newMin && parseFloat(r.newMin) > 0 ? 'border-orange-400' : 'border-stone-200 focus-within:border-orange-400'}`}>
                        <span className="pl-3 text-stone-400 text-xs flex-shrink-0">₺</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={r.newMin}
                          onChange={e => setField(r.id, 'newMin', e.target.value)}
                          placeholder="0.00"
                          className="flex-1 px-2 py-2.5 text-sm font-semibold text-stone-900 outline-none tabular-nums bg-transparent"
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {changedCount > 0 && (
        <div className="fixed bottom-6 right-10 z-30">
          <button
            onClick={saveAll}
            disabled={saving}
            className="bg-[#F27A1A] hover:bg-[#E06010] disabled:opacity-50 text-white px-8 py-3.5 rounded shadow-lg text-[11px] tracking-[0.2em] uppercase font-semibold transition-all"
          >
            {saving ? 'Kaydediliyor...' : `${changedCount} Ürünü Kaydet`}
          </button>
        </div>
      )}
    </div>
  )
}
