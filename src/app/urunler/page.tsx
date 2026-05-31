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

  async function deleteProduct() {
    if (!editing) return
    if (!confirm(`"${editing.name}" kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`)) return
    setSaving(true)
    const { error } = await supabase.from('products').delete().eq('id', editing.id)
    setSaving(false)
    if (error) return alert('Silinemedi: ' + error.message)
    setShowModal(false)
    fetchProducts()
  }

  async function handleSave() {
    if (!form.name || !form.purchase_price || !form.standard_price || !form.min_sale_price) return alert('Ad ve fiyat alanları zorunludur.')
    setSaving(true)

    // Barkod tekrar kontrolü (yeni ürün veya barkod değişmişse)
    if (form.barcode?.trim()) {
      const { data: existing } = await supabase.from('products').select('id, name').eq('barcode', form.barcode.trim()).maybeSingle()
      if (existing && existing.id !== editing?.id) {
        alert(`Bu barkod zaten "${existing.name}" ürününe ait. Farklı bir barkod girin veya barkod alanını boş bırakın.`)
        setSaving(false)
        return
      }
    }

    const payload = { name: form.name, barcode: form.barcode?.trim() || null, category: form.category || null, unit: form.unit, purchase_price: Number(form.purchase_price), standard_price: Number(form.standard_price), min_sale_price: Number(form.min_sale_price), description: form.description || null, image_url: form.image_url || null }
    if (editing) {
      const { error } = await supabase.from('products').update(payload).eq('id', editing.id)
      if (error) { alert('Güncelleme hatası: ' + error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('products').insert(payload)
      if (error) { alert('Kayıt hatası: ' + error.message); setSaving(false); return }
    }
    setSaving(false)
    setShowModal(false)
    fetchProducts()
  }

  async function toggleActive(p: Product) {
    const { error } = await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id)
    if (error) { alert('Güncelleme hatası: ' + error.message); return }
    fetchProducts()
  }

  // Aynı isimde birden fazla ürün olan isimleri tespit et
  const nameCounts: Record<string, number> = {}
  products.forEach(p => { nameCounts[p.name.toLowerCase()] = (nameCounts[p.name.toLowerCase()] ?? 0) + 1 })
  const duplicateNames = new Set(Object.entries(nameCounts).filter(([, c]) => c > 1).map(([n]) => n))

  // Barkod veya isim bazlı tekrar grupları
  const mergeGroups = (() => {
    function score(p: Product) {
      return (p.image_url ? 2 : 0) + (p.description ? 1 : 0) + (p.category ? 1 : 0)
    }
    function sortGroup(group: Product[]) {
      return [...group].sort((a, b) => score(b) - score(a) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    }

    const processed = new Set<string>()
    const result: Array<{ label: string; keeper: Product; duplicates: Product[] }> = []

    // Önce barkod bazlı
    const bcMap: Record<string, Product[]> = {}
    products.forEach(p => {
      if (p.barcode) {
        bcMap[p.barcode] = [...(bcMap[p.barcode] ?? []), p]
      }
    })
    Object.entries(bcMap).filter(([, g]) => g.length > 1).forEach(([bc, group]) => {
      const sorted = sortGroup(group)
      group.forEach(p => processed.add(p.id))
      result.push({ label: `Barkod: ${bc}`, keeper: sorted[0], duplicates: sorted.slice(1) })
    })

    // Sonra isim bazlı (barkodla işlenmeyenleri)
    const nameMap: Record<string, Product[]> = {}
    products.forEach(p => {
      if (processed.has(p.id)) return
      const key = p.name.toLowerCase().trim()
      nameMap[key] = [...(nameMap[key] ?? []), p]
    })
    Object.entries(nameMap).filter(([, g]) => g.length > 1).forEach(([, group]) => {
      const sorted = sortGroup(group)
      result.push({ label: `İsim: ${sorted[0].name}`, keeper: sorted[0], duplicates: sorted.slice(1) })
    })

    return result
  })()

  async function runMerge() {
    setMerging(true)
    try {
      for (const { keeper, duplicates } of mergeGroups) {
        for (const dup of duplicates) {
          const [{ data: keeperInv, error: e1 }, { data: dupInv, error: e2 }] = await Promise.all([
            supabase.from('inventory').select('*').eq('product_id', keeper.id),
            supabase.from('inventory').select('*').eq('product_id', dup.id),
          ])
          if (e1 || e2) throw new Error('Stok okunamadı: ' + (e1?.message ?? e2?.message))
          for (const di of (dupInv ?? [])) {
            const ki = (keeperInv ?? []).find((x: any) => x.location_id === di.location_id)
            if (ki) {
              const { error: ue } = await supabase.from('inventory').update({ quantity: Number(ki.quantity) + Number(di.quantity) }).eq('id', ki.id)
              if (ue) throw new Error('Stok güncellenemedi: ' + ue.message)
              const { error: de } = await supabase.from('inventory').delete().eq('id', di.id)
              if (de) throw new Error('Stok silinemedi: ' + de.message)
            } else {
              const { error: me } = await supabase.from('inventory').update({ product_id: keeper.id }).eq('id', di.id)
              if (me) throw new Error('Stok taşınamadı: ' + me.message)
            }
          }
          const { error: se } = await supabase.from('sale_items').update({ product_id: keeper.id }).eq('product_id', dup.id)
          if (se) throw new Error('Satış kalemleri taşınamadı: ' + se.message)
          const { error: sme } = await supabase.from('stock_movements').update({ product_id: keeper.id }).eq('product_id', dup.id)
          if (sme) throw new Error('Stok hareketleri taşınamadı: ' + sme.message)
          const { error: pe } = await supabase.from('products').delete().eq('id', dup.id)
          if (pe) throw new Error('Tekrar ürün silinemedi: ' + pe.message)
        }
      }
      setShowMergeModal(false)
      fetchProducts()
    } catch (err: any) {
      alert('Birleştirme hatası — işlem yarıda kaldı, sayfayı yenileyin: ' + err.message)
    } finally {
      setMerging(false)
    }
  }

  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [merging, setMerging] = useState(false)

  // Ürün hareketleri
  const [hareketProduct, setHareketProduct] = useState<Product | null>(null)
  const [hareketler, setHareketler] = useState<any[]>([])
  const [hareketStok, setHareketStok] = useState<{ loc: string; qty: number }[]>([])
  const [hareketLoading, setHareketLoading] = useState(false)

  async function openHareketler(p: Product) {
    setHareketProduct(p)
    setHareketler([])
    setHareketStok([])
    setHareketLoading(true)

    const [{ data: movements }, { data: saleItems }, { data: inv }] = await Promise.all([
      supabase
        .from('stock_movements')
        .select('id, created_at, movement_type, quantity, from_location:locations!stock_movements_from_location_id_fkey(name), to_location:locations!stock_movements_to_location_id_fkey(name)')
        .eq('product_id', p.id)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('sale_items')
        .select('id, quantity, unit_price, sales(id, created_at, status, locations(name), customers(name))')
        .eq('product_id', p.id)
        .limit(500),
      supabase
        .from('inventory')
        .select('quantity, locations(name)')
        .eq('product_id', p.id),
    ])

    const stokByLoc = (inv ?? []).map((r: any) => ({ loc: r.locations?.name ?? '?', qty: Number(r.quantity) }))
    setHareketStok(stokByLoc)

    const combined: any[] = [
      ...(movements ?? []).map((m: any) => ({
        id: m.id,
        date: m.created_at,
        type: m.movement_type as string,
        quantity: Number(m.quantity),
        from: (m.from_location as any)?.name ?? null,
        to: (m.to_location as any)?.name ?? null,
        customer: null,
        price: null,
      })),
      ...(saleItems ?? [])
        .filter((s: any) => s.sales?.status !== 'iptal')
        .map((s: any) => ({
          id: s.id,
          date: s.sales?.created_at,
          type: 'satis',
          quantity: Number(s.quantity),
          from: (s.sales?.locations as any)?.name ?? null,
          to: null,
          customer: (s.sales?.customers as any)?.name ?? null,
          price: Number(s.unit_price),
        })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    setHareketler(combined)
    setHareketLoading(false)
  }

  const typeConf: Record<string, { label: string; cls: string }> = {
    'satis':       { label: 'Satış',       cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    'transfer':    { label: 'Transfer',    cls: 'bg-violet-50 text-violet-700 border-violet-200' },
    'sayim':       { label: 'Sayım',       cls: 'bg-stone-100 text-stone-600 border-stone-200' },
    'satin_alma':  { label: 'Satın Alma',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    'satin-alma':  { label: 'Satın Alma',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    'fire':        { label: 'Fire',        cls: 'bg-red-50 text-red-600 border-red-200' },
  }

  const filtered = products
    .filter(p =>
      (showDuplicatesOnly ? duplicateNames.has(p.name.toLowerCase()) : true) &&
      (
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.barcode ?? '').includes(search) ||
        (p.category ?? '').toLowerCase().includes(search.toLowerCase())
      )
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-stone-900">Ürünler</h2>
          <p className="text-stone-400 text-sm mt-1">{products.length} ürün kayıtlı</p>
        </div>
        <button onClick={openAdd} className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-5 py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium shadow-sm transition-all">
          + Yeni Ürün
        </button>
      </div>

      {mergeGroups.length > 0 && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-600 font-bold text-lg leading-none">⚠</span>
            <div>
              <p className="text-amber-800 font-semibold text-sm">
                {mergeGroups.reduce((s, g) => s + g.duplicates.length, 0)} tekrar giriş tespit edildi
              </p>
              <p className="text-amber-600 text-xs mt-0.5">
                {mergeGroups.map(g => g.label).join(' · ')}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDuplicatesOnly(v => !v)}
              className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition-colors ${showDuplicatesOnly ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
            >
              {showDuplicatesOnly ? 'Tümünü Göster' : 'Sadece Tekrarları'}
            </button>
            <button
              onClick={() => setShowMergeModal(true)}
              className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-amber-600 text-white hover:bg-amber-700 transition-colors"
            >
              Birleştir
            </button>
          </div>
        </div>
      )}

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
              className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] transition-colors ${sort === 'name' ? 'bg-[#7C3AED] text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}
            >İsme Göre</button>
            <button
              onClick={() => setSort('stock')}
              className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] transition-colors border-l border-stone-200 ${sort === 'stock' ? 'bg-[#7C3AED] text-white' : 'bg-white text-stone-500 hover:bg-stone-50'}`}
            >Stoğa Göre</button>
          </div>
        </div>
        <p className="text-stone-400 text-xs ml-1">Barkod okutunca otomatik arar — 1 sonuç kalırsa Enter ile seçilir</p>
      </div>

      <div className="bg-white border border-stone-200 shadow-sm overflow-x-auto">
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
                <tr key={p.id} className={`border-b border-stone-50 transition-colors ${highlighted === p.id ? 'bg-stone-100 ring-2 ring-stone-300 ring-inset' : duplicateNames.has(p.name.toLowerCase()) ? 'bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-stone-50/70'}`}>
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
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-stone-800">{p.name}</p>
                    {duplicateNames.has(p.name.toLowerCase()) && (
                      <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">⚠ Tekrar</span>
                    )}
                  </td>
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
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <button onClick={() => openEdit(p)} className="text-stone-700 hover:text-stone-900 text-xs font-semibold transition-colors whitespace-nowrap">Düzenle</button>
                      <button onClick={() => toggleActive(p)} className="text-stone-400 hover:text-stone-600 text-xs font-semibold transition-colors whitespace-nowrap">
                        {p.is_active ? 'Pasif Yap' : 'Aktif Yap'}
                      </button>
                      <button onClick={() => openHareketler(p)} className="text-violet-600 hover:text-violet-800 text-xs font-semibold transition-colors whitespace-nowrap">Hareketler</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-stone-200 w-full max-w-lg shadow-lg max-h-[90vh] flex flex-col">
            <div className="px-7 pt-7 pb-0 flex-shrink-0">
              <h3 className="text-lg font-bold text-stone-900 mb-6 tracking-tight">{editing ? 'Ürünü Düzenle' : 'Yeni Ürün Ekle'}</h3>
            </div>
            <div className="overflow-y-auto flex-1 px-7 pb-2">
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
            </div>
            <div className="flex gap-3 px-7 py-5 flex-shrink-0 border-t border-stone-100">
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white py-3 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              {editing && (
                <button onClick={deleteProduct} disabled={saving} className="bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 border border-red-200 px-4 py-3 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">
                  Sil
                </button>
              )}
              <button onClick={() => setShowModal(false)} className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 py-3 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barkod Tekrar Birleştirme Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-stone-200 w-full max-w-2xl shadow-lg max-h-[90vh] flex flex-col">
            <div className="px-7 pt-6 pb-0 flex-shrink-0">
              <h3 className="text-lg font-bold text-stone-900 tracking-tight">Barkod Tekrarlarını Birleştir</h3>
              <p className="text-stone-400 text-xs mt-1 mb-4">Aynı barkodlu ürünler tek ürüne dönüştürülecek. Stoklar toplanır, satış geçmişi korunur.</p>
            </div>
            <div className="overflow-y-auto flex-1 px-7 pb-4 space-y-5">
              {mergeGroups.map(({ label, keeper, duplicates }) => (
                <div key={label} className="border border-stone-200 rounded p-4">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.15em] mb-3">{label}</p>
                  {/* Korunan */}
                  <div className="flex items-center gap-3 mb-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded">
                    <span className="text-emerald-600 font-bold text-sm flex-shrink-0">Korunacak</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-stone-800 truncate">{keeper.name}</p>
                      <p className="text-xs text-stone-400">Stok: {stockTotals[keeper.id] ?? 0} · Satış: ₺{Number(keeper.standard_price).toLocaleString('tr-TR')}</p>
                    </div>
                  </div>
                  {/* Silinecekler */}
                  {duplicates.map(dup => (
                    <div key={dup.id} className="flex items-center gap-3 p-2.5 bg-red-50 border border-red-200 rounded mt-1.5">
                      <span className="text-red-500 font-bold text-sm flex-shrink-0">Silinecek</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-stone-500 truncate line-through">{dup.name}</p>
                        <p className="text-xs text-stone-400">Stok: {stockTotals[dup.id] ?? 0} (korunana eklenecek) · Satış: ₺{Number(dup.standard_price).toLocaleString('tr-TR')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex gap-3 px-7 py-5 flex-shrink-0 border-t border-stone-100">
              <button
                onClick={runMerge}
                disabled={merging}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-3 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors"
              >
                {merging ? 'Birleştiriliyor...' : 'Onayla ve Birleştir'}
              </button>
              <button
                onClick={() => setShowMergeModal(false)}
                className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 py-3 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ürün Hareketleri Modal */}
      {hareketProduct && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-stone-200 w-full max-w-3xl shadow-lg max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="px-7 pt-6 pb-4 flex-shrink-0 border-b border-stone-100">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-stone-900 tracking-tight">{hareketProduct.name}</h3>
                  <p className="text-stone-400 text-xs mt-0.5">Ürün Hareketleri</p>
                </div>
                <button onClick={() => setHareketProduct(null)} className="text-stone-400 hover:text-stone-700 text-2xl leading-none font-light mt-1">×</button>
              </div>

              {/* Stok özeti + istatistik */}
              {!hareketLoading && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {hareketStok.map(s => (
                    <div key={s.loc} className="bg-stone-50 border border-stone-200 rounded px-3 py-2 min-w-24">
                      <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-[0.1em]">{s.loc}</p>
                      <p className="text-lg font-bold text-stone-900 tabular-nums mt-0.5">{s.qty}</p>
                    </div>
                  ))}
                  {(() => {
                    const totalSold = hareketler.filter(h => h.type === 'satis').reduce((s, h) => s + h.quantity, 0)
                    const totalRevenue = hareketler.filter(h => h.type === 'satis').reduce((s, h) => s + h.quantity * (h.price ?? 0), 0)
                    const totalCost = totalSold * Number(hareketProduct.purchase_price)
                    const profit = totalRevenue - totalCost
                    return (
                      <>
                        <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2 min-w-24">
                          <p className="text-[10px] text-blue-500 font-semibold uppercase tracking-[0.1em]">Toplam Satış</p>
                          <p className="text-lg font-bold text-blue-900 tabular-nums mt-0.5">{totalSold} adet</p>
                        </div>
                        <div className={`border rounded px-3 py-2 min-w-32 ${profit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                          <p className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>Toplam Kâr</p>
                          <p className={`text-lg font-bold tabular-nums mt-0.5 ${profit >= 0 ? 'text-emerald-900' : 'text-red-700'}`}>
                            {profit >= 0 ? '+' : ''}₺{profit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1">
              {hareketLoading ? (
                <div className="flex items-center justify-center gap-2.5 py-16">
                  <div className="w-5 h-5 border-2 border-stone-200 border-t-violet-600 rounded-full animate-spin" />
                  <span className="text-stone-400 text-sm">Yükleniyor...</span>
                </div>
              ) : hareketler.length === 0 ? (
                <div className="py-14 text-center text-stone-400 text-sm">Bu ürüne ait hareket kaydı bulunamadı</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-stone-50 border-b border-stone-100 z-10">
                    <tr>
                      <th className="px-5 py-3 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Tarih</th>
                      <th className="px-5 py-3 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Tür</th>
                      <th className="px-5 py-3 text-center text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Miktar</th>
                      <th className="px-5 py-3 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Detay</th>
                      <th className="px-5 py-3 text-right text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Fiyat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hareketler.map((h, i) => {
                      const conf = typeConf[h.type] ?? { label: h.type, cls: 'bg-stone-100 text-stone-600 border-stone-200' }
                      let detay = ''
                      if (h.type === 'satis') detay = [h.from, h.customer].filter(Boolean).join(' · ')
                      else if (h.type === 'transfer') detay = h.from && h.to ? `${h.from} → ${h.to}` : (h.from ?? h.to ?? '')
                      else if (h.type === 'satin-alma') detay = h.to ? `→ ${h.to}` : ''
                      else if (h.type === 'fire') detay = h.from ? `${h.from}` : ''
                      else if (h.type === 'sayim') detay = h.to ?? h.from ?? ''
                      return (
                        <tr key={`${h.id}-${i}`} className="border-b border-stone-50 hover:bg-stone-50/60 transition-colors">
                          <td className="px-5 py-3 text-stone-400 text-xs tabular-nums whitespace-nowrap">
                            {h.date ? new Date(h.date).toLocaleDateString('tr-TR') : '—'}
                            <span className="block text-[10px] text-stone-300">{h.date ? new Date(h.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${conf.cls}`}>{conf.label}</span>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className={`font-bold tabular-nums text-sm ${h.type === 'satis' || h.type === 'fire' ? 'text-red-600' : h.type === 'satin-alma' || (h.type === 'sayim' && h.to) ? 'text-emerald-700' : 'text-stone-700'}`}>
                              {h.type === 'satis' || h.type === 'fire' ? '-' : ''}{h.quantity}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-stone-500 text-xs">{detay || '—'}</td>
                          <td className="px-5 py-3 text-right text-stone-600 tabular-nums text-xs font-medium">
                            {h.price != null ? `₺${Number(h.price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-7 py-4 flex-shrink-0 border-t border-stone-100 flex justify-between items-center">
              <p className="text-xs text-stone-400">{hareketler.length} kayıt</p>
              <button onClick={() => setHareketProduct(null)} className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-6 py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">
                Kapat
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
              <button onClick={() => saveEditImg()} className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9] text-white py-2.5 rounded text-[11px] tracking-[0.2em] uppercase font-medium transition-colors">Kaydet</button>
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
