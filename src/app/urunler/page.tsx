'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Product } from '@/types'

const emptyForm = { name: '', barcode: '', category: '', unit: 'adet', purchase_price: '', standard_price: '', min_sale_price: '', description: '', image_url: '' }

export default function UrunlerPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [stockTotals, setStockTotals] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'name' | 'stock'>('name')
  const [saving, setSaving] = useState(false)
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null)
  const [editImg, setEditImg] = useState<{ id: string; name: string; url: string } | null>(null)
  const [editImgUrl, setEditImgUrl] = useState('')

  useEffect(() => { fetchProducts() }, [])

  async function fetchProducts() {
    const [{ data: prods }, { data: inv }] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('inventory').select('product_id, quantity'),
    ])
    setProducts(prods ?? [])
    const totals: Record<string, number> = {}
    ;(inv ?? []).forEach((r: any) => { totals[r.product_id] = (totals[r.product_id] ?? 0) + Number(r.quantity) })
    setStockTotals(totals)
    setLoading(false)
  }

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({ name: p.name, barcode: p.barcode ?? '', category: p.category ?? '', unit: p.unit, purchase_price: String(p.purchase_price), standard_price: String(p.standard_price), min_sale_price: String(p.min_sale_price), description: p.description ?? '', image_url: p.image_url ?? '' })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name || !form.purchase_price || !form.standard_price || !form.min_sale_price) return alert('Ad ve fiyat alanları zorunludur.')
    setSaving(true)
    const payload = { name: form.name, barcode: form.barcode || null, category: form.category || null, unit: form.unit, purchase_price: Number(form.purchase_price), standard_price: Number(form.standard_price), min_sale_price: Number(form.min_sale_price), description: form.description || null, image_url: form.image_url || null }
    if (editing) {
      await supabase.from('products').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('products').insert(payload)
    }
    setSaving(false)
    setShowModal(false)
    fetchProducts()
  }

  async function toggleActive(p: Product) {
    await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id)
    fetchProducts()
  }

  const filtered = products
    .filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode ?? '').includes(search) ||
      (p.category ?? '').toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) =>
      sort === 'stock'
        ? (stockTotals[b.id] ?? 0) - (stockTotals[a.id] ?? 0)
        : a.name.localeCompare(b.name, 'tr')
    )

  async function saveEditImg(clear = false) {
    if (!editImg) return
    const url = clear ? null : (editImgUrl.trim() || null)
    await supabase.from('products').update({ image_url: url }).eq('id', editImg.id)
    setEditImg(null)
    fetchProducts()
  }

  async function handleImageFileUpload(file: File) {
    if (!editImg) return
    const ext = file.name.split('.').pop()
    const path = `${editImg.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true })
    if (error) { alert('Yükleme hatası: ' + error.message); return }
    const { data } = supabase.storage.from('product-images').getPublicUrl(path)
    setEditImgUrl(data.publicUrl)
  }

  const inp = "w-full border border-stone-200 rounded-sm px-3.5 py-2.5 text-sm outline-none focus:border-stone-400 transition-colors"

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-stone-900">Ürünler</h2>
          <p className="text-stone-400 text-sm mt-1">{products.length} ürün kayıtlı</p>
        </div>
        <button onClick={openAdd} className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium shadow-sm transition-all">
          + Yeni Ürün
        </button>
      </div>

      <div className="bg-white border border-stone-200 shadow-sm mb-5 p-4">
        <div className="flex gap-3 items-center mb-3">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm select-none">&#x2315;</span>
            <input
              autoFocus
              className="w-full border border-stone-200 rounded-sm pl-9 pr-10 py-3 text-sm outline-none focus:border-stone-400 transition-colors font-medium"
              placeholder="Ürün adı veya barkod okut / yaz..."
              value={search}
              onChange={e => { setSearch(e.target.value); setHighlighted(null) }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const matches = products.filter(p =>
                    p.name.toLowerCase().includes(search.toLowerCase()) ||
                    (p.barcode ?? '').includes(search)
                  )
                  if (matches.length === 1) setHighlighted(matches[0].id)
                }
                if (e.key === 'Escape') { setSearch(''); setHighlighted(null) }
              }}
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setHighlighted(null) }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xl leading-none"
              >×</button>
            )}
          </div>
          <div className="flex border border-stone-200 rounded-sm overflow-hidden flex-shrink-0">
            <button
              onClick={() => setSort('name')}
              className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] transition-colors ${sort === 'name' ? 'bg-teal-600 text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}
            >İsme Göre</button>
            <button
              onClick={() => setSort('stock')}
              className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] transition-colors border-l border-stone-200 ${sort === 'stock' ? 'bg-teal-600 text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}
            >Stoğa Göre</button>
          </div>
        </div>
        <p className="text-stone-400 text-xs ml-1">Barkod okutunca otomatik arar — 1 sonuç kalırsa Enter ile seçilir</p>
      </div>

      <div className="bg-white border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-100">
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] w-14">Görsel</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Ürün Adı</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Barkod</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Kategori</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Birim</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Alış ₺</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Satış ₺</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Min. ₺</th>
                <th className="px-5 py-3.5 text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] text-center">Toplam Stok</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Durum</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center">
                    <div className="flex items-center justify-center gap-2.5">
                      <div className="w-5 h-5 border-2 border-stone-200 border-t-stone-700 rounded-full animate-spin" />
                      <span className="text-stone-400 text-sm">Yükleniyor...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-5 py-12 text-center text-stone-400 text-sm">Ürün bulunamadı</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className={`border-b border-stone-50 transition-colors ${highlighted === p.id ? 'bg-stone-100 ring-2 ring-stone-300 ring-inset' : 'hover:bg-stone-50/70'}`}>
                  <td className="px-5 py-3">
                    <div className="relative group w-10 h-10">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          onClick={() => setLightbox({ url: p.image_url!, name: p.name })}
                          className="w-10 h-10 rounded-sm object-cover border border-stone-100 cursor-zoom-in"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-sm bg-stone-100 flex items-center justify-center text-stone-400 text-sm font-bold">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <button
                        onClick={() => { setEditImg({ id: p.id, name: p.name, url: p.image_url ?? '' }); setEditImgUrl(p.image_url ?? '') }}
                        className="absolute inset-0 w-10 h-10 rounded-sm bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs"
                        title="Görseli değiştir"
                      >Edit</button>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 font-semibold text-stone-800">{p.name}</td>
                  <td className="px-5 py-3.5 text-stone-400 font-mono text-xs">{p.barcode ?? '-'}</td>
                  <td className="px-5 py-3.5 text-stone-500">{p.category ?? '-'}</td>
                  <td className="px-5 py-3.5 text-stone-500">{p.unit}</td>
                  <td className="px-5 py-3.5 text-stone-600 tabular-nums">₺{Number(p.purchase_price).toLocaleString('tr-TR')}</td>
                  <td className="px-5 py-3.5 font-semibold text-stone-900 tabular-nums">₺{Number(p.standard_price).toLocaleString('tr-TR')}</td>
                  <td className="px-5 py-3.5 text-stone-600 font-medium tabular-nums">₺{Number(p.min_sale_price).toLocaleString('tr-TR')}</td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`text-sm font-bold tabular-nums ${(stockTotals[p.id] ?? 0) === 0 ? 'text-red-500' : (stockTotals[p.id] ?? 0) <= 5 ? 'text-amber-600' : 'text-stone-700'}`}>
                      {stockTotals[p.id] ?? 0}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-0.5 rounded text-xs font-semibold ${p.is_active ? 'border border-emerald-200 text-emerald-700 bg-emerald-50/50' : 'border border-stone-200 text-stone-500'}`}>
                      {p.is_active ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 flex gap-3">
                    <button onClick={() => openEdit(p)} className="text-stone-700 hover:text-stone-900 text-xs font-semibold transition-colors">Düzenle</button>
                    <button onClick={() => toggleActive(p)} className="text-stone-400 hover:text-stone-600 text-xs font-semibold transition-colors">
                      {p.is_active ? 'Pasif Yap' : 'Aktif Yap'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-stone-200 w-full max-w-lg p-7 shadow-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-stone-900 mb-6 tracking-tight">{editing ? 'Ürünü Düzenle' : 'Yeni Ürün Ekle'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5 uppercase tracking-[0.1em]">Ürün Adı *</label>
                <input className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1.5 uppercase tracking-[0.1em]">Barkod</label>
                  <input className={inp} value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1.5 uppercase tracking-[0.1em]">Kategori</label>
                  <input className={inp} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5 uppercase tracking-[0.1em]">Birim</label>
                <select className={inp} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                  <option>adet</option><option>kutu</option><option>paket</option><option>şişe</option><option>kg</option><option>lt</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1.5 uppercase tracking-[0.1em]">Alış ₺ *</label>
                  <input type="number" step="0.01" className={inp} value={form.purchase_price} onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1.5 uppercase tracking-[0.1em]">Satış ₺ *</label>
                  <input type="number" step="0.01" className={inp} value={form.standard_price} onChange={e => setForm(f => ({ ...f, standard_price: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1.5 uppercase tracking-[0.1em]">Min. Satış ₺ *</label>
                  <input type="number" step="0.01" className={inp} value={form.min_sale_price} onChange={e => setForm(f => ({ ...f, min_sale_price: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5 uppercase tracking-[0.1em]">Açıklama</label>
                <textarea className={inp} rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1.5 uppercase tracking-[0.1em]">Görsel URL</label>
                <input className={inp} placeholder="https://..." value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} />
                {form.image_url && (
                  <img src={form.image_url} alt="önizleme" className="mt-2 w-20 h-20 rounded-sm object-cover border border-stone-200" />
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-7">
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white py-3 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              <button onClick={() => setShowModal(false)} className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 py-3 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Image Modal */}
      {editImg && (
        <div className="fixed inset-0 bg-stone-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-stone-200 w-full max-w-sm p-6 shadow-lg">
            <h3 className="text-base font-bold text-stone-900 mb-1">Görseli Değiştir</h3>
            <p className="text-stone-400 text-xs mb-4 truncate">{editImg.name}</p>

            {/* File upload area */}
            <label className="block w-full border-2 border-dashed border-stone-200 hover:border-stone-400 rounded p-5 text-center cursor-pointer transition-colors group mb-3">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFileUpload(f) }}
              />
              <p className="text-sm font-semibold text-stone-600 group-hover:text-stone-900 transition-colors">Dosya seç veya sürükle</p>
              <p className="text-xs text-stone-400 mt-0.5">JPG, PNG, WEBP</p>
            </label>

            {editImgUrl && (
              <img
                src={editImgUrl}
                alt="önizleme"
                className="w-full max-h-44 object-contain rounded-sm border border-stone-100 mb-3"
                onError={e => (e.currentTarget.style.display = 'none')}
                onLoad={e => (e.currentTarget.style.display = 'block')}
              />
            )}

            <div className="flex gap-2">
              <button onClick={() => saveEditImg()} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">Kaydet</button>
              <button onClick={() => saveEditImg(true)} className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2.5 rounded text-xs font-semibold transition-colors">Sil</button>
              <button onClick={() => setEditImg(null)} className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-4 py-2.5 rounded text-xs font-semibold transition-colors">İptal</button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-stone-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <div className="bg-white rounded border border-stone-200 shadow-lg max-w-sm w-full p-5 flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
            <img src={lightbox.url} alt={lightbox.name} className="w-full max-h-72 object-contain rounded-sm" />
            <p className="text-stone-800 font-semibold text-sm text-center">{lightbox.name}</p>
            <button onClick={() => setLightbox(null)} className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-6 py-2.5 rounded text-xs font-semibold transition-colors">
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
