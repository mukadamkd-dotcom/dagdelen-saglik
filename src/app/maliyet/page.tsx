'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const KDV_RATES = [1, 8, 10, 18, 20]

interface ProductRow {
  id: string
  name: string
  image_url: string | null
  purchase_price: number
  kdvHaric: string
  kdvDahil: string
  kdvRate: number
}

export default function MaliyetPage() {
  const [rows, setRows] = useState<ProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [defaultKdv, setDefaultKdv] = useState(10)
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)

  useEffect(() => { fetchProducts() }, [])

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('id, name, image_url, purchase_price').order('name')
    setRows((data ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      image_url: p.image_url ?? null,
      purchase_price: Number(p.purchase_price),
      kdvHaric: '',
      kdvDahil: '',
      kdvRate: 10,
    })))
    setLoading(false)
  }

  function changeHaric(id: string, val: string) {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r
      const num = parseFloat(val)
      const dahil = (!val || isNaN(num) || num <= 0) ? '' : String(Math.round(num * (1 + r.kdvRate / 100) * 100) / 100)
      return { ...r, kdvHaric: val, kdvDahil: dahil }
    }))
  }

  function changeDahil(id: string, val: string) {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r
      const num = parseFloat(val)
      const haric = (!val || isNaN(num) || num <= 0) ? '' : String(Math.round(num / (1 + r.kdvRate / 100) * 100) / 100)
      return { ...r, kdvDahil: val, kdvHaric: haric }
    }))
  }

  function changeRate(id: string, rate: number) {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r
      const haricNum = parseFloat(r.kdvHaric)
      if (r.kdvHaric && !isNaN(haricNum) && haricNum > 0) {
        const dahil = String(Math.round(haricNum * (1 + rate / 100) * 100) / 100)
        return { ...r, kdvRate: rate, kdvDahil: dahil }
      }
      return { ...r, kdvRate: rate }
    }))
  }

  function applyDefaultKdv() {
    setRows(prev => prev.map(r => {
      const haricNum = parseFloat(r.kdvHaric)
      if (r.kdvHaric && !isNaN(haricNum) && haricNum > 0) {
        const dahil = String(Math.round(haricNum * (1 + defaultKdv / 100) * 100) / 100)
        return { ...r, kdvRate: defaultKdv, kdvDahil: dahil }
      }
      return { ...r, kdvRate: defaultKdv }
    }))
  }

  async function saveAll() {
    const changed = rows.filter(r => r.kdvHaric.trim() !== '' && parseFloat(r.kdvHaric) > 0)
    if (changed.length === 0) { alert('Hiç fiyat girilmedi.'); return }
    setSaving(true)
    for (const r of changed) {
      const net = Math.round(parseFloat(r.kdvHaric) * 100) / 100
      await supabase.from('products').update({ purchase_price: net }).eq('id', r.id)
    }
    setSaving(false)
    setSavedCount(changed.length)
    fetchProducts()
    setTimeout(() => setSavedCount(0), 3000)
  }

  const filtered = rows.filter(r =>
    !search.trim() || r.name.toLowerCase().includes(search.toLowerCase())
  )
  const changedCount = rows.filter(r => r.kdvHaric.trim() !== '' && parseFloat(r.kdvHaric) > 0).length

  const inputCls = (active: boolean) =>
    `flex-1 px-2 py-2.5 text-sm font-semibold text-stone-900 outline-none tabular-nums bg-transparent`

  const wrapCls = (active: boolean) =>
    `flex items-center border rounded-sm overflow-hidden w-36 transition-colors ${active ? 'border-[#7C3AED] bg-purple-50/40' : 'border-stone-200 focus-within:border-[#7C3AED]'}`

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight">Maliyet Güncelle</h2>
          <p className="text-stone-400 text-sm mt-1">KDV hariç veya KDV dahil fiyat girin — biri yazılınca diğeri otomatik hesaplanır</p>
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
            className="bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium shadow-sm transition-all"
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
              className="w-full border border-stone-200 rounded-sm pl-9 pr-4 py-2.5 text-sm outline-none focus:border-[#7C3AED] transition-colors"
            />
          </div>

          <div className="flex items-center gap-3 border-l border-stone-200 pl-4">
            <span className="text-xs text-stone-500 font-medium whitespace-nowrap">Tümüne KDV uygula:</span>
            <select
              value={defaultKdv}
              onChange={e => setDefaultKdv(Number(e.target.value))}
              className="border border-stone-200 rounded-sm px-3 py-2 text-sm outline-none focus:border-[#7C3AED] bg-white"
            >
              {KDV_RATES.map(r => <option key={r} value={r}>%{r}</option>)}
            </select>
            <button
              onClick={applyDefaultKdv}
              className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-4 py-2 rounded-sm text-xs font-semibold transition-colors whitespace-nowrap"
            >
              Uygula
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
      <div className="bg-white border border-stone-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-100">
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] w-14">Görsel</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Ürün Adı</th>
                <th className="px-5 py-3.5 text-right text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Mevcut Alış ₺</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">KDV Oranı</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">KDV Hariç ₺</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">KDV Dahil ₺</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <div className="flex items-center justify-center gap-2.5">
                      <div className="w-5 h-5 border-2 border-stone-200 border-t-[#7C3AED] rounded-full animate-spin" />
                      <span className="text-stone-400 text-sm">Yükleniyor...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-stone-400 text-sm">Ürün bulunamadı</td>
                </tr>
              ) : filtered.map(r => {
                const changed = r.kdvHaric.trim() !== '' && parseFloat(r.kdvHaric) > 0
                return (
                  <tr key={r.id} className={`border-b border-stone-50 transition-colors ${changed ? 'bg-purple-50/50' : 'hover:bg-stone-50/60'}`}>
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
                      <span className="text-stone-400 tabular-nums text-xs">
                        ₺{r.purchase_price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={r.kdvRate}
                        onChange={e => changeRate(r.id, Number(e.target.value))}
                        className="border border-stone-200 rounded-sm px-3 py-2.5 text-sm outline-none focus:border-[#7C3AED] bg-white transition-colors"
                      >
                        {KDV_RATES.map(rate => <option key={rate} value={rate}>%{rate}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <div className={wrapCls(changed)}>
                        <span className="pl-3 text-stone-400 text-xs flex-shrink-0">₺</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={r.kdvHaric}
                          onChange={e => changeHaric(r.id, e.target.value)}
                          placeholder="0.00"
                          className={inputCls(changed)}
                        />
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className={wrapCls(!!r.kdvDahil && parseFloat(r.kdvDahil) > 0)}>
                        <span className="pl-3 text-stone-400 text-xs flex-shrink-0">₺</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={r.kdvDahil}
                          onChange={e => changeDahil(r.id, e.target.value)}
                          placeholder="0.00"
                          className={inputCls(!!r.kdvDahil && parseFloat(r.kdvDahil) > 0)}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
      </div>

      {/* Sticky bottom save */}
      {changedCount > 0 && (
        <div className="fixed bottom-6 right-10 z-30">
          <button
            onClick={saveAll}
            disabled={saving}
            className="bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white px-8 py-3.5 rounded shadow-lg text-[11px] tracking-[0.2em] uppercase font-semibold transition-all"
          >
            {saving ? 'Kaydediliyor...' : `${changedCount} Ürünü Kaydet`}
          </button>
        </div>
      )}
    </div>
  )
}
