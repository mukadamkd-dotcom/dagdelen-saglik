'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

type Step = 'upload' | 'preview' | 'importing' | 'images' | 'done'

interface ParsedRow {
  name: string
  barcode: string
  quantity: number
}

interface ImportResult {
  total: number
  inserted: number
  skipped: number
  imagesFound: number
}

export default function ImportPage() {
  const [step, setStep] = useState<Step>('upload')
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [colName, setColName] = useState<number>(0)
  const [colBarcode, setColBarcode] = useState<number>(1)
  const [colQty, setColQty] = useState<number>(2)
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [eczaneId, setEczaneId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function parseFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]
      if (rows.length < 2) return alert('Dosya boş görünüyor.')

      const hdrs = rows[0].map(String)
      const dataRows = rows.slice(1).filter(r => r.some(c => c !== ''))
      setHeaders(hdrs)
      setRawRows(dataRows)
      setFileName(file.name)

      // Auto-detect columns
      const autoName = hdrs.findIndex(h => /ad|isim|ürün|urun/i.test(h))
      const autoBarcode = hdrs.findIndex(h => /barkod|barcode|kod|ean|gtin/i.test(h))
      const autoQty = hdrs.findIndex(h => /adet|miktar|stok|quantity|qty/i.test(h))
      if (autoName >= 0) setColName(autoName)
      if (autoBarcode >= 0) setColBarcode(autoBarcode)
      if (autoQty >= 0) setColQty(autoQty)

      setStep('preview')
    }
    reader.readAsArrayBuffer(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
  }

  function buildParsed(): ParsedRow[] {
    return rawRows
      .map(row => ({
        name: String(row[colName] ?? '').trim(),
        barcode: String(row[colBarcode] ?? '').trim().replace(/\.0$/, ''),
        quantity: Math.max(0, Number(row[colQty]) || 0),
      }))
      .filter(r => r.name.length > 0)
  }

  async function handleImport() {
    const rows = buildParsed()
    setParsedRows(rows)
    setStep('importing')
    setProgress(0)

    // Fetch eczane location
    const { data: locs } = await supabase.from('locations').select('id, name, type')
    const eczane = locs?.find(l => l.type === 'eczane')
    if (!eczane) {
      alert('Eczane lokasyonu bulunamadı. Önce lokasyonlar tablosuna "eczane" tipinde bir kayıt ekleyin.')
      setStep('preview')
      return
    }
    setEczaneId(eczane.id)

    let inserted = 0
    let skipped = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      setProgress(Math.round(((i + 1) / rows.length) * 100))
      setProgressMsg(`(${i + 1}/${rows.length}) ${row.name}`)

      // Check if product with same barcode exists
      let productId: string | null = null
      if (row.barcode) {
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('barcode', row.barcode)
          .single()
        if (existing) {
          productId = existing.id
          skipped++
        }
      }

      if (!productId) {
        const { data: newProd } = await supabase
          .from('products')
          .insert({
            name: row.name,
            barcode: row.barcode || null,
            unit: 'adet',
            purchase_price: 0,
            standard_price: 0,
            min_sale_price: 0,
            is_active: true,
          })
          .select('id')
          .single()
        if (newProd) {
          productId = newProd.id
          inserted++
        }
      }

      if (productId && row.quantity > 0) {
        const { data: inv } = await supabase
          .from('inventory')
          .select('id')
          .eq('product_id', productId)
          .eq('location_id', eczane.id)
          .single()

        if (inv) {
          await supabase.from('inventory').update({ quantity: row.quantity }).eq('id', inv.id)
        } else {
          await supabase.from('inventory').insert({
            product_id: productId,
            location_id: eczane.id,
            quantity: row.quantity,
            min_stock_alert: 0,
          })
        }
      }
    }

    setResult({ total: rows.length, inserted, skipped, imagesFound: 0 })
    setStep('images')
    fetchImages(rows, inserted)
  }

  async function fetchImages(rows: ParsedRow[], insertedCount: number) {
    const rowsWithBarcode = rows.filter(r => r.barcode)
    let found = 0

    for (let i = 0; i < rowsWithBarcode.length; i++) {
      const row = rowsWithBarcode[i]
      setProgress(Math.round(((i + 1) / rowsWithBarcode.length) * 100))
      setProgressMsg(`Görsel aranıyor: ${row.name}`)

      try {
        const params = new URLSearchParams({ barcode: row.barcode, name: row.name })
        const res = await fetch(`/api/fetch-product-image?${params}`)
        const { image_url } = await res.json()
        if (image_url) {
          await supabase.from('products').update({ image_url }).eq('barcode', row.barcode)
          found++
        }
      } catch {}
    }

    setResult(r => r ? { ...r, imagesFound: found } : null)
    setStep('done')
  }

  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanMsg, setScanMsg] = useState('')
  const [scanResult, setScanResult] = useState<{ checked: number; found: number } | null>(null)

  async function handleScanAllImages() {
    setScanning(true)
    setScanResult(null)
    setScanProgress(0)

    const { data: products } = await supabase
      .from('products')
      .select('id, name, barcode')
      .not('barcode', 'is', null)
      .or('image_url.is.null,image_url.eq.')

    if (!products || products.length === 0) {
      setScanResult({ checked: 0, found: 0 })
      setScanning(false)
      return
    }

    let found = 0
    for (let i = 0; i < products.length; i++) {
      const p = products[i]
      setScanProgress(Math.round(((i + 1) / products.length) * 100))
      setScanMsg(p.name)

      try {
        const params = new URLSearchParams({ barcode: p.barcode, name: p.name })
        const res = await fetch(`/api/fetch-product-image?${params}`)
        const { image_url } = await res.json()
        if (image_url) {
          await supabase.from('products').update({ image_url }).eq('id', p.id)
          found++
        }
      } catch {}
    }

    setScanResult({ checked: products.length, found })
    setScanning(false)
  }

  const inp = "border border-stone-200 rounded px-3 py-2 text-sm outline-none focus:border-stone-400 transition-colors bg-white text-stone-700"

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-stone-900 tracking-tight">Excel İçe Aktar</h2>
        <p className="text-stone-400 text-sm mt-1">Ürünleri ve stok miktarlarını toplu yükle</p>
      </div>

      {/* STEP: UPLOAD */}
      {step === 'upload' && (
        <div className="space-y-5">
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`bg-white rounded-sm border-2 border-dashed cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-4 p-16 ${dragging ? 'border-stone-400 bg-stone-50' : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'}`}
          >
            <div className="w-16 h-16 rounded-sm bg-stone-100 flex items-center justify-center text-4xl">📊</div>
            <div className="text-center">
              <p className="text-stone-700 font-semibold text-base">Excel dosyasını buraya sürükle</p>
              <p className="text-stone-400 text-sm mt-1">ya da tıklayarak seç (.xlsx, .xls)</p>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
          </div>

          {/* Image scan card */}
          <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-sm bg-stone-100 flex items-center justify-center text-2xl">🖼️</div>
              <div>
                <p className="font-semibold text-stone-900 text-sm">Mevcut Ürün Görsellerini Ara</p>
                <p className="text-stone-400 text-xs">Barkodu olan ama görseli eksik tüm ürünleri tara</p>
              </div>
            </div>

            {scanning ? (
              <div className="space-y-3">
                <div className="flex justify-between text-xs text-stone-400">
                  <span className="truncate max-w-[260px]">{scanMsg}</span>
                  <span className="font-semibold tabular-nums shrink-0 ml-2">{scanProgress}%</span>
                </div>
                <div className="h-2 rounded-sm bg-stone-100 overflow-hidden">
                  <div
                    className="h-full transition-all duration-300 bg-stone-700"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
                <p className="text-stone-400 text-xs text-center">Sayfayı kapatmayın...</p>
              </div>
            ) : scanResult ? (
              <div className="flex items-center gap-3 bg-stone-50 border border-stone-200 rounded-sm p-3.5">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="text-stone-900 font-semibold text-sm">{scanResult.found} görsel bulundu</p>
                  <p className="text-stone-400 text-xs">{scanResult.checked} ürün tarandı</p>
                </div>
                <button onClick={handleScanAllImages} className="ml-auto text-[11px] tracking-[0.15em] uppercase text-stone-600 font-semibold hover:text-stone-900 transition-colors">Tekrar Tara</button>
              </div>
            ) : (
              <button
                onClick={handleScanAllImages}
                className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white py-2.5 rounded text-[11px] tracking-[0.2em] uppercase transition-colors"
              >
                Görselleri Ara ve Yükle
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP: PREVIEW */}
      {step === 'preview' && (
        <div className="space-y-5">
          <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-sm bg-stone-100 flex items-center justify-center text-xl">✅</div>
              <div>
                <p className="font-semibold text-stone-900 text-sm">{fileName}</p>
                <p className="text-stone-400 text-xs">{rawRows.length} satır okundu</p>
              </div>
            </div>

            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-3">Sütun Eşleştirme</p>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { label: 'Ürün Adı *', val: colName, set: setColName },
                { label: 'Barkod', val: colBarcode, set: setColBarcode },
                { label: 'Adet / Miktar', val: colQty, set: setColQty },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <label className="block text-[10px] font-semibold text-stone-400 mb-1.5 uppercase tracking-[0.15em]">{label}</label>
                  <select className={inp + ' w-full'} value={val} onChange={e => set(Number(e.target.value))}>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `Sütun ${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-3">Önizleme (ilk 8 satır)</p>
            <div className="overflow-x-auto rounded-sm border border-stone-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200">
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Ürün Adı</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Barkod</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em]">Adet</th>
                  </tr>
                </thead>
                <tbody>
                  {rawRows.slice(0, 8).map((row, i) => (
                    <tr key={i} className="border-b border-stone-100 last:border-0">
                      <td className="px-4 py-2.5 text-stone-700 font-medium">{String(row[colName] ?? '')}</td>
                      <td className="px-4 py-2.5 text-stone-400 font-mono text-xs">{String(row[colBarcode] ?? '')}</td>
                      <td className="px-4 py-2.5 text-stone-700 tabular-nums">{String(row[colQty] ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-stone-50 border border-stone-200 rounded-sm p-4 flex items-center gap-3">
            <span className="text-2xl">🏥</span>
            <div>
              <p className="text-stone-900 font-semibold text-sm">Hedef Lokasyon: Eczane</p>
              <p className="text-stone-600 text-xs">Tüm ürünler eczane stoğuna eklenecek</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleImport}
              className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9] text-white py-3 rounded text-[11px] tracking-[0.2em] uppercase transition-colors shadow-sm"
            >
              {rawRows.length} Ürünü İçe Aktar
            </button>
            <button
              onClick={() => { setStep('upload'); setRawRows([]); setHeaders([]) }}
              className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-6 py-3 rounded text-[11px] tracking-[0.15em] uppercase transition-colors"
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {/* STEP: IMPORTING */}
      {(step === 'importing' || step === 'images') && (
        <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-10 flex flex-col items-center gap-6">
          <div className="w-16 h-16 rounded-sm bg-stone-100 flex items-center justify-center text-4xl">
            {step === 'importing' ? '📦' : '🖼️'}
          </div>
          <div className="text-center">
            <p className="text-stone-900 font-semibold text-base">
              {step === 'importing' ? 'Ürünler yükleniyor...' : 'Görseller aranıyor...'}
            </p>
            <p className="text-stone-400 text-sm mt-1 max-w-xs truncate">{progressMsg}</p>
          </div>
          <div className="w-full max-w-sm">
            <div className="flex justify-between text-xs text-stone-400 mb-2">
              <span>İlerleme</span>
              <span className="font-semibold tabular-nums">{progress}%</span>
            </div>
            <div className="h-2 rounded-sm bg-stone-100 overflow-hidden">
              <div
                className="h-full transition-all duration-300 bg-stone-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          {step === 'images' && (
            <p className="text-stone-400 text-xs">Görseller bulunurken sayfayı kapatmayın</p>
          )}
        </div>
      )}

      {/* STEP: DONE */}
      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-8 flex flex-col items-center gap-5">
            <div className="w-16 h-16 rounded-sm bg-stone-100 flex items-center justify-center text-4xl">🎉</div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-stone-900">Yükleme Tamamlandı</h3>
              <p className="text-stone-400 text-sm mt-1">Ürünler eczane stoğuna eklendi</p>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
              {[
                { label: 'Toplam Satır', value: result.total, color: 'bg-stone-50 border border-stone-200', num: 'text-stone-900' },
                { label: 'Yeni Ürün', value: result.inserted, color: 'bg-stone-50 border border-stone-200', num: 'text-emerald-700' },
                { label: 'Zaten Vardı', value: result.skipped, color: 'bg-stone-50 border border-stone-200', num: 'text-amber-700' },
                { label: 'Görsel Bulundu', value: result.imagesFound, color: 'bg-stone-50 border border-stone-200', num: 'text-stone-700' },
              ].map(c => (
                <div key={c.label} className={`${c.color} rounded-sm p-3.5 text-center`}>
                  <p className={`text-2xl font-bold tabular-nums ${c.num}`}>{c.value}</p>
                  <p className="text-stone-400 text-xs mt-1">{c.label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <a href="/stok" className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9] text-white py-3 rounded text-[11px] tracking-[0.2em] uppercase transition-colors text-center shadow-sm">
              Stok Sayfasına Git
            </a>
            <button
              onClick={() => { setStep('upload'); setRawRows([]); setHeaders([]); setResult(null) }}
              className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-6 py-3 rounded text-[11px] tracking-[0.15em] uppercase transition-colors"
            >
              Yeni Yükleme
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
