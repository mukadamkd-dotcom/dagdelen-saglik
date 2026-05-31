'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toPng } from 'html-to-image'

interface Product { id: string; name: string; category: string | null; image_url: string | null }
interface SearchImage { thumbnail: string; url: string; title: string }
interface Info { name: string; description: string; benefits: string[] }
interface FetchedInfo { description: string; features: string[] }

const BRAND = 'Dağdelen Sağlık'
const STEP_LABELS = ['Ürün Seç', 'Görsel Seç', 'Bilgi Düzenle', 'Broşür İndir']

// ── Ürün kategorisine göre arka plan sahnesi ──────────────────────────────────
function getBackgroundPrompt(product: Product): string {
  const n = product.name.toLowerCase()
  const c = (product.category ?? '').toLowerCase()

  if (n.includes('güneş') || n.includes('spf') || n.includes('bronzlaş'))
    return 'beautiful woman relaxing on tropical white sand beach, golden sunset over turquoise ocean waves, warm golden hour light, luxury summer lifestyle, cinematic photography, ultra realistic, 4k, no text no watermark'
  if (n.includes('kızarıklık') || n.includes('akne') || n.includes('sivilce') || n.includes('leke'))
    return 'extreme close-up macro of smooth flawless glowing healthy skin texture, soft diffused studio light, fresh aloe vera and white rose petals blurred in background, luxury skincare aesthetic, ultra realistic, 4k, no text'
  if (n.includes('krem') || n.includes('nemlendirici') || n.includes('losyon') || c.includes('cilt') || c.includes('krem'))
    return 'elegant luxury spa bathroom white marble surfaces, fresh white orchids in crystal vase, soft morning sunlight through frosted window, water droplets on glass, premium beauty atmosphere, ultra realistic, cinematic, 4k, no text'
  if (n.includes('bebek') || c.includes('bebek'))
    return 'soft cozy baby nursery room, pastel pink and cream tones, gentle golden morning sunlight through white sheer curtains, soft plush toys, fresh flowers, warm tender innocent atmosphere, ultra realistic, 4k, no text'
  if (n.includes('saç') || n.includes('şampuan') || c.includes('saç'))
    return 'woman with beautiful silky flowing hair in lush green forest, warm sunlight filtering through trees, fresh waterfall bokeh background, hair flowing freely in gentle breeze, cinematic beauty photography, ultra realistic, 4k, no text'
  if (n.includes('vitamin') || n.includes('mineral') || c.includes('vitamin') || c.includes('takviye'))
    return 'vibrant colorful fresh tropical fruits oranges lemons strawberries kiwi arranged on white marble, morning sunlight rays, healthy wellness lifestyle, macro photography, ultra realistic, 4k, no text'
  if (n.includes('diş') || c.includes('diş') || c.includes('ağız'))
    return 'fresh peppermint leaves and clean white marble surface, sparkling water droplets, bright morning light, clean fresh dental aesthetic, minimalist luxury, ultra realistic, 4k, no text'
  if (n.includes('göz') || c.includes('göz'))
    return 'close-up portrait of stunning bright clear eyes with long lashes, soft bokeh green garden background, morning golden light, fresh beauty photography, ultra realistic, 4k, no text'
  if (n.includes('ağrı') || c.includes('ağrı'))
    return 'fit athletic woman doing yoga stretching in bright outdoor park, golden morning sunlight, freedom and vitality, soft bokeh nature background, wellness lifestyle, ultra realistic, 4k, no text'
  if (n.includes('probiyotik') || c.includes('probiyotik'))
    return 'fresh green smoothie bowl with colorful berries and seeds on clean white marble, morning sunlight, healthy wellness lifestyle, vibrant colors, ultra realistic, 4k, no text'
  return 'modern elegant luxury pharmacy interior, warm soft lighting, white marble counters, fresh white flowers, health and wellness premium aesthetic, ultra realistic, 4k, no text'
}

// ── Şablon 1: Sinema — tam kaplama arka plan + ürün overlay ──────────────────
function TemplateSinema({ info, imgUrl, bgUrl }: { info: Info; imgUrl: string; bgUrl: string }) {
  const benefits = info.benefits.filter(Boolean).slice(0, 4)
  return (
    <div style={{ width: 1080, height: 1350, fontFamily: 'system-ui,-apple-system,sans-serif', position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg,#2D0A6E,#0D0520)' }}>
      {/* Arka plan */}
      {bgUrl && <img src={bgUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}

      {/* Gradient overlay — üstten şeffaf, alttan koyu */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,0.4) 0%,rgba(0,0,0,0.05) 22%,rgba(0,0,0,0) 38%,rgba(0,0,0,0.5) 55%,rgba(0,0,0,0.88) 72%,rgba(0,0,0,0.97) 100%)' }} />

      {/* Sol kenar şerit - mor */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 5, height: '100%', background: 'linear-gradient(180deg,#7C3AED,rgba(124,58,237,0.3))' }} />

      {/* Marka — üst */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '34px 64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, letterSpacing: '0.5em', textTransform: 'uppercase', fontWeight: 700, margin: 0 }}>{BRAND}</p>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <div style={{ width: 28, height: 1.5, background: 'rgba(255,255,255,0.45)' }} />
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(167,139,250,0.8)' }} />
        </div>
      </div>

      {/* Ürün görseli — üst merkez */}
      <div style={{ position: 'absolute', top: 100, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 440, height: 440, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {imgUrl
            ? <img src={imgUrl} alt={info.name} style={{ width: 370, height: 370, objectFit: 'contain', filter: 'drop-shadow(0 20px 60px rgba(0,0,0,0.55)) brightness(1.06)' }} />
            : <span style={{ fontSize: 100, color: 'rgba(255,255,255,0.5)' }}>{info.name.charAt(0)}</span>}
        </div>
      </div>

      {/* Alt içerik */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 64px 56px' }}>
        {/* Ürün adı */}
        <p style={{ color: '#FFFFFF', fontSize: 56, fontWeight: 900, margin: '0 0 10px', lineHeight: 1.05, letterSpacing: '-0.025em' }}>{info.name}</p>

        {/* Ayırıcı */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <div style={{ width: 48, height: 3, background: '#A78BFA', borderRadius: 2 }} />
          <div style={{ width: 10, height: 3, background: 'rgba(167,139,250,0.45)', borderRadius: 2 }} />
        </div>

        {/* Açıklama */}
        {info.description && (
          <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 16, lineHeight: 1.75, margin: '0 0 26px', maxWidth: 900 }}>
            {info.description.slice(0, 190)}{info.description.length > 190 ? '…' : ''}
          </p>
        )}

        {/* Özellik chip'leri */}
        {benefits.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {benefits.map((b, i) => (
              <div key={i} style={{ background: 'rgba(91,33,182,0.6)', border: '1px solid rgba(167,139,250,0.4)', borderRadius: 36, padding: '10px 22px' }}>
                <p style={{ color: '#EDE9FE', fontSize: 14, margin: 0, fontWeight: 500 }}>{b.length > 55 ? b.slice(0, 52) + '…' : b}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Şablon 2: Vitrin — split tasarım, ürün ortada ───────────────────────────
function TemplateVitrin({ info, imgUrl, bgUrl }: { info: Info; imgUrl: string; bgUrl: string }) {
  const benefits = info.benefits.filter(Boolean).slice(0, 5)
  return (
    <div style={{ width: 1080, height: 1350, fontFamily: 'system-ui,-apple-system,sans-serif', background: '#FFFFFF', position: 'relative', overflow: 'hidden' }}>
      {/* Üst arka plan alanı */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 640, overflow: 'hidden' }}>
        {bgUrl
          ? <img src={bgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#4C1D95,#7C3AED,#5B21B6)' }} />}
        {/* Alta beyaza doğru solma */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 240, background: 'linear-gradient(0deg,#FFFFFF 0%,rgba(255,255,255,0) 100%)' }} />
        {/* Üstte koyu katman — marka okunabilirliği */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120, background: 'linear-gradient(180deg,rgba(0,0,0,0.45),transparent)' }} />
      </div>

      {/* Marka — sol üst */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '34px 64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 20 }}>
        <p style={{ color: 'white', fontSize: 13, letterSpacing: '0.45em', textTransform: 'uppercase', fontWeight: 700, margin: 0, textShadow: '0 1px 10px rgba(0,0,0,0.7)' }}>{BRAND}</p>
        <div style={{ display: 'flex', gap: 4 }}>
          {[0.35, 0.6, 1].map((o, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: `rgba(255,255,255,${o})` }} />)}
        </div>
      </div>

      {/* Ürün görseli — iki bölüm arasında yüzer */}
      <div style={{ position: 'absolute', top: 390, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 20 }}>
        <div style={{ width: 400, height: 400, borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 28px 90px rgba(0,0,0,0.2), 0 0 0 10px rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {imgUrl
            ? <img src={imgUrl} alt={info.name} style={{ width: 310, height: 310, objectFit: 'contain', filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.12))' }} />
            : <div style={{ width: 240, height: 240, borderRadius: '50%', background: '#F0EBFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 80, color: '#7C3AED' }}>{info.name.charAt(0)}</span>
              </div>}
        </div>
      </div>

      {/* Beyaz alt bölüm */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 730, background: '#FFFFFF', paddingTop: 230, paddingLeft: 64, paddingRight: 64, paddingBottom: 48, display: 'flex', flexDirection: 'column' }}>
        {/* Ürün adı */}
        <p style={{ fontSize: 50, color: '#0F0028', fontWeight: 900, margin: '0 0 10px', lineHeight: 1.05, letterSpacing: '-0.025em' }}>{info.name}</p>

        {/* Ayırıcı */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22 }}>
          <div style={{ width: 48, height: 4, background: '#7C3AED', borderRadius: 2 }} />
          <div style={{ width: 14, height: 4, background: '#C4B5FD', borderRadius: 2 }} />
        </div>

        {/* Açıklama */}
        {info.description && (
          <p style={{ fontSize: 16, color: '#64748B', lineHeight: 1.8, margin: '0 0 28px' }}>
            {info.description.slice(0, 180)}{info.description.length > 180 ? '…' : ''}
          </p>
        )}

        {/* Özellikler */}
        {benefits.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {benefits.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '13px 0', borderBottom: '1px solid #F1ECFF' }}>
                <div style={{ marginTop: 3, width: 24, height: 24, borderRadius: '50%', background: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ color: 'white', fontSize: 12, fontWeight: 800 }}>✓</span>
                </div>
                <p style={{ fontSize: 15, color: '#1E0A40', margin: 0, lineHeight: 1.55, fontWeight: 500 }}>{b.length > 90 ? b.slice(0, 87) + '…' : b}</p>
              </div>
            ))}
          </div>
        )}

        {/* Alt footer */}
        <div style={{ marginTop: 'auto', paddingTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 10, color: '#C4B5FD', margin: 0, letterSpacing: '0.3em', textTransform: 'uppercase' }}>{BRAND}</p>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1,2,3].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i === 2 ? '#7C3AED' : '#DDD6FE' }} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Ana Sayfa ─────────────────────────────────────────────────────────────────
export default function GorselPage() {
  const [products, setProducts]   = useState<Product[]>([])
  const [dbLoading, setDbLoading] = useState(true)
  const [prodSearch, setProdSearch] = useState('')
  const [selected, setSelected]   = useState<Product | null>(null)
  const [step, setStep]           = useState<0|1|2|3>(0)

  // Step 1
  const [imgResults, setImgResults]     = useState<SearchImage[]>([])
  const [imgSearching, setImgSearching] = useState(false)
  const [imgSearched, setImgSearched]   = useState(false)
  const [selectedImg, setSelectedImg]   = useState('')

  // Step 2
  const [infoLoading, setInfoLoading]   = useState(false)
  const [fetchedInfo, setFetchedInfo]   = useState<FetchedInfo>({ description: '', features: [] })
  const [selectedFeatures, setSelectedFeatures] = useState<Set<string>>(new Set())
  const [info, setInfo] = useState<Info>({ name: '', description: '', benefits: [] })

  // Step 3
  const [tmpl, setTmpl]           = useState(0)
  const [bgUrl, setBgUrl]         = useState('')
  const [bgGenerating, setBgGenerating] = useState(false)
  const [downloading, setDownloading]   = useState(false)
  const brochureRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('products').select('id,name,category,image_url').eq('is_active', true).order('name')
      .then(({ data }) => { setProducts(data ?? []); setDbLoading(false) })
  }, [])

  const filtered = prodSearch.trim()
    ? products.filter(p => p.name.toLowerCase().includes(prodSearch.toLowerCase()) || (p.category ?? '').toLowerCase().includes(prodSearch.toLowerCase()))
    : products

  function goSelect(p: Product) {
    setSelected(p); setProdSearch('')
    setImgResults([]); setImgSearched(false); setSelectedImg('')
    setFetchedInfo({ description: '', features: [] })
    setSelectedFeatures(new Set())
    setInfo({ name: p.name, description: '', benefits: [] })
    setBgUrl(''); setBgGenerating(false)
    setStep(1)
  }

  async function doImageSearch() {
    if (!selected) return
    setImgSearching(true); setImgResults([]); setImgSearched(false)
    try {
      const res = await fetch(`/api/gorsel-ara?q=${encodeURIComponent(selected.name)}`)
      const d = await res.json()
      setImgResults(d.images ?? [])
    } catch {}
    setImgSearching(false); setImgSearched(true)
  }

  function pickImage(rawUrl: string) {
    setSelectedImg(`/api/img-proxy?url=${encodeURIComponent(rawUrl)}`)
    setStep(2)
    doFetchInfo()
  }

  async function doFetchInfo() {
    if (!selected) return
    setInfoLoading(true)
    setFetchedInfo({ description: '', features: [] })
    setSelectedFeatures(new Set())
    try {
      const res = await fetch(`/api/urun-bilgi?q=${encodeURIComponent(selected.name)}`)
      const d: FetchedInfo = await res.json()
      setFetchedInfo(d)
      setInfo(prev => ({ ...prev, description: d.description || prev.description }))
    } catch {}
    setInfoLoading(false)
  }

  function toggleFeature(f: string) {
    setSelectedFeatures(prev => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f); else next.add(f)
      setInfo(p => ({ ...p, benefits: [...next] }))
      return next
    })
  }

  async function generateBackground() {
    if (!selected) return
    setBgGenerating(true); setBgUrl('')
    try {
      const prompt = getBackgroundPrompt(selected)
      const seed   = Math.floor(Math.random() * 99999)
      const resp   = await fetch(`/api/gorsel-uret?prompt=${encodeURIComponent(prompt)}&seed=${seed}&w=1080&h=1350`)
      if (!resp.ok) throw new Error('fail')
      const blob = await resp.blob()
      setBgUrl(URL.createObjectURL(blob))
    } catch {}
    setBgGenerating(false)
  }

  function enterStep3() {
    setStep(3)
    generateBackground()
  }

  async function doDownload() {
    if (!brochureRef.current || !selected) return
    setDownloading(true)
    try {
      const url = await toPng(brochureRef.current, { pixelRatio: 1 })
      const a = document.createElement('a')
      a.href = url
      a.download = `${selected.name.replace(/\s+/g, '-')}-brosur.png`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
    } catch { alert('İndirme hatası.') }
    setDownloading(false)
  }

  const W = 1080, H = 1350, SCALE = 0.30

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-stone-900 tracking-tight">Broşür Üret</h2>
        <p className="text-stone-400 text-sm mt-1">Ürün seçin → Görsel + bilgi → Yapay zeka arka plan → Broşür indirin</p>
      </div>

      {/* Adım göstergesi */}
      <div className="flex items-center gap-1 mb-8 flex-wrap">
        {STEP_LABELS.map((label, i) => (
          <div key={i} className="flex items-center gap-1">
            <button onClick={() => { if (i <= step) setStep(i as 0|1|2|3) }}
              className={`flex items-center gap-2 px-3 py-2 rounded text-[11px] font-semibold whitespace-nowrap transition-all ${
                i === step ? 'bg-[#7C3AED] text-white' : i < step ? 'bg-purple-100 text-[#7C3AED] hover:bg-purple-200 cursor-pointer' : 'bg-stone-100 text-stone-400 cursor-default'
              }`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                i === step ? 'bg-white text-[#7C3AED]' : i < step ? 'bg-[#7C3AED] text-white' : 'bg-stone-300 text-white'
              }`}>{i < step ? '✓' : i + 1}</span>
              {label}
            </button>
            {i < 3 && <div className="w-4 h-0.5 bg-stone-200" />}
          </div>
        ))}
      </div>

      {/* ─── Adım 0: Ürün Seç ─────────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-5">
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-[0.15em] mb-3">Ürün Seçin</p>
          <input autoFocus className="w-full border border-stone-200 rounded-sm px-4 py-3 text-sm outline-none focus:border-[#7C3AED] mb-3"
            placeholder="Ürün adı ara..." value={prodSearch} onChange={e => setProdSearch(e.target.value)} />
          {dbLoading ? <p className="text-stone-400 text-sm text-center py-4">Yükleniyor...</p> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
              {filtered.slice(0, 100).map(p => (
                <button key={p.id} onClick={() => goSelect(p)}
                  className="text-left px-3 py-2.5 rounded-sm border bg-stone-50 text-stone-700 border-stone-200 hover:border-[#7C3AED] hover:bg-purple-50 transition-all">
                  <p className="font-semibold truncate text-xs">{p.name}</p>
                  {p.category && <p className="text-[10px] truncate mt-0.5 text-stone-400">{p.category}</p>}
                </button>
              ))}
              {filtered.length === 0 && <p className="col-span-full text-stone-400 text-sm py-2">Bulunamadı</p>}
            </div>
          )}
        </div>
      )}

      {/* ─── Adım 1: Görsel Seç ───────────────────────────────────────────────── */}
      {step === 1 && selected && (
        <div className="space-y-4">
          <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-[0.15em]">İnternetten Görsel Ara</p>
                <p className="text-stone-700 text-sm font-semibold mt-0.5">{selected.name}</p>
              </div>
              <button onClick={doImageSearch} disabled={imgSearching}
                className="bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-60 text-white px-5 py-2.5 rounded text-xs font-semibold flex items-center gap-2">
                {imgSearching
                  ? <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />Aranıyor...</>
                  : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>Görselleri Ara</>}
              </button>
            </div>

            {!imgSearched && !imgSearching && <p className="text-stone-400 text-sm text-center py-8">Butona basın, ürün görselleri listelensin — beğendiğinize tıklayın</p>}
            {imgSearched && imgResults.length === 0 && <p className="text-stone-400 text-sm text-center py-6">Görsel bulunamadı, tekrar deneyin</p>}

            {imgResults.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {imgResults.map((img, i) => (
                  <button key={i} onClick={() => pickImage(img.url)}
                    className="relative aspect-square rounded overflow-hidden border-2 border-stone-200 hover:border-[#7C3AED] transition-all group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.thumbnail} alt={img.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-150" />
                    <div className="absolute inset-0 flex items-center justify-center bg-[#7C3AED]/0 group-hover:bg-[#7C3AED]/20 transition-colors">
                      <span className="text-white text-xs font-bold opacity-0 group-hover:opacity-100 bg-[#7C3AED] px-2 py-1 rounded">Seç</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selected.image_url && (
            <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-5">
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-[0.15em] mb-3">Mevcut Ürün Görseli</p>
              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selected.image_url} alt={selected.name} className="w-20 h-20 object-contain border border-stone-200 rounded" />
                <button onClick={() => { setSelectedImg(`/api/img-proxy?url=${encodeURIComponent(selected.image_url!)}`); setStep(2); doFetchInfo() }}
                  className="text-sm font-semibold text-[#7C3AED] hover:underline">Bunu Kullan →</button>
              </div>
            </div>
          )}
          <button onClick={() => { setSelectedImg(''); setStep(2); doFetchInfo() }} className="text-xs text-stone-400 hover:text-stone-600 underline">Görselsiz devam et</button>
        </div>
      )}

      {/* ─── Adım 2: Bilgi Düzenle ────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-[0.15em]">Ürün Bilgileri</p>
              {infoLoading && <span className="flex items-center gap-1.5 text-xs text-stone-400"><div className="w-3 h-3 border border-stone-400 border-t-transparent rounded-full animate-spin" />Bilgi aranıyor...</span>}
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-1.5 block">Ürün Adı</label>
                <input className="w-full border border-stone-200 rounded-sm px-4 py-3 text-sm outline-none focus:border-[#7C3AED]" value={info.name} onChange={e => setInfo(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-1.5 block">Açıklama</label>
                <textarea className="w-full border border-stone-200 rounded-sm px-4 py-3 text-sm outline-none focus:border-[#7C3AED] resize-none" rows={3}
                  placeholder="Ürün açıklaması..." value={info.description} onChange={e => setInfo(p => ({ ...p, description: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-6">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-[0.15em]">Özellikler — Seçin</p>
              <span className="text-[10px] text-stone-400">{selectedFeatures.size} seçili</span>
            </div>
            <p className="text-[11px] text-stone-400 mb-4">İnternetten bulunan özellikler. Broşüre eklemek istediklerinize tıklayın.</p>

            {infoLoading && <div className="flex items-center gap-2 text-stone-400 text-sm py-4"><div className="w-4 h-4 border border-stone-400 border-t-transparent rounded-full animate-spin" />Özellikler aranıyor...</div>}
            {!infoLoading && fetchedInfo.features.length === 0 && <p className="text-stone-400 text-sm py-2 mb-3">Özellik bulunamadı. Manuel ekleyin.</p>}

            {fetchedInfo.features.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {fetchedInfo.features.map((f, i) => {
                  const sel = selectedFeatures.has(f)
                  return (
                    <button key={i} onClick={() => toggleFeature(f)}
                      className={`px-3 py-2 rounded text-xs border text-left leading-snug transition-all ${sel ? 'bg-[#7C3AED] text-white border-[#7C3AED] font-semibold' : 'bg-stone-50 text-stone-600 border-stone-200 hover:border-[#7C3AED]'}`}
                      style={{ maxWidth: 320 }}>
                      {sel && '✓ '}{f}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="flex gap-2">
              <input id="mf" className="flex-1 border border-stone-200 rounded-sm px-4 py-2.5 text-sm outline-none focus:border-[#7C3AED]" placeholder="Manuel özellik ekle (Enter)..."
                onKeyDown={e => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); if (v) { toggleFeature(v); (e.target as HTMLInputElement).value = '' } } }} />
              <button onClick={() => { const el = document.getElementById('mf') as HTMLInputElement; if (el?.value.trim()) { toggleFeature(el.value.trim()); el.value = '' } }}
                className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-sm">+ Ekle</button>
            </div>

            {selectedFeatures.size > 0 && (
              <div className="mt-4 pt-4 border-t border-stone-100">
                <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.15em] mb-2">Seçilenler ({selectedFeatures.size})</p>
                <div className="flex flex-col gap-1.5">
                  {[...selectedFeatures].map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-stone-600">
                      <div className="mt-1.5 w-4 h-4 rounded-full bg-[#7C3AED] flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-[9px] font-bold">{i + 1}</span>
                      </div>
                      <span className="leading-snug">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button onClick={enterStep3} className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-8 py-3 rounded text-sm font-semibold flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
            Broşür Oluştur
          </button>
        </div>
      )}

      {/* ─── Adım 3: Broşür ───────────────────────────────────────────────────── */}
      {step === 3 && (
        <div>
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            {['Sinema', 'Vitrin'].map((label, i) => (
              <button key={i} onClick={() => setTmpl(i)}
                className={`px-5 py-2.5 rounded text-xs font-semibold border transition-all ${tmpl === i ? 'bg-[#7C3AED] text-white border-[#7C3AED]' : 'bg-white text-stone-600 border-stone-200 hover:border-[#7C3AED]'}`}>
                {label}
              </button>
            ))}
            <button onClick={generateBackground} disabled={bgGenerating}
              className="px-5 py-2.5 rounded text-xs font-semibold border border-stone-200 bg-white text-stone-600 hover:border-[#7C3AED] disabled:opacity-50 flex items-center gap-2 transition-all">
              {bgGenerating ? <><div className="w-3 h-3 border border-stone-500 border-t-transparent rounded-full animate-spin" />Üretiliyor...</> : '↻ Arka Plan Yenile'}
            </button>
            <button onClick={doDownload} disabled={downloading || bgGenerating}
              className="ml-auto bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-60 text-white px-6 py-2.5 rounded text-xs font-semibold flex items-center gap-2">
              {downloading
                ? <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />İndiriliyor...</>
                : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>PNG İndir</>}
            </button>
          </div>

          <div className="bg-white border border-stone-200 shadow-sm rounded-sm overflow-hidden">
            <div className="flex items-start justify-center bg-stone-200 p-6 relative" style={{ minHeight: 420 }}>
              {bgGenerating && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-stone-900/50">
                  <div className="w-10 h-10 border-2 border-[#A78BFA] border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-white text-sm font-medium">Yapay zeka arka plan üretiyor...</p>
                  <p className="text-white/60 text-xs mt-1">30-60 saniye sürebilir</p>
                </div>
              )}
              <div style={{ transform: `scale(${SCALE})`, transformOrigin: 'top left', flexShrink: 0 }}>
                <div ref={brochureRef}>
                  {tmpl === 0
                    ? <TemplateSinema info={info} imgUrl={selectedImg} bgUrl={bgUrl} />
                    : <TemplateVitrin info={info} imgUrl={selectedImg} bgUrl={bgUrl} />}
                </div>
              </div>
              <div style={{ width: W * SCALE, height: H * SCALE, flexShrink: 0, marginLeft: -(W * (1 - SCALE)) }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
