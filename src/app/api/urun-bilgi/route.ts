import { NextRequest, NextResponse } from 'next/server'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function strip(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/)
    .map(s => s.replace(/^\W+/, '').trim())
    .filter(s => s.length >= 25 && s.length <= 220)
}

function extractMeta(html: string, ...tags: string[]): string {
  for (const tag of tags) {
    const m = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${tag}["'][^>]+content=["']([^"']{20,600})["']`, 'i'))
      ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']{20,600})["'][^>]+(?:name|property)=["']${tag}["']`, 'i'))
    if (m?.[1]) return m[1].trim()
  }
  return ''
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>()
  return arr.filter(s => {
    const k = s.toLowerCase().replace(/\s+/g, '').slice(0, 50)
    if (seen.has(k)) return false
    seen.add(k); return true
  })
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? ''
  if (!q) return NextResponse.json({ description: '', features: [] })

  let description = ''
  const raw: string[] = []

  // 1. DDG Instant Answer API
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) }
    )
    const d = await res.json()
    if (d.AbstractText) {
      description = d.AbstractText
      splitSentences(d.AbstractText).forEach(s => raw.push(s))
    }
    for (const t of (d.RelatedTopics ?? []).slice(0, 4)) {
      if (t.Text?.length > 30) splitSentences(t.Text).forEach(s => raw.push(s))
    }
  } catch {}

  // 2. DuckDuckGo Lite — simplest HTML, easiest to scrape
  const queries = [
    `${q} faydaları özellikleri`,
    `${q} kullanımı ne için kullanılır`,
    `${q} içerik etken madde`,
  ]
  for (const query of queries) {
    if (raw.length >= 15) break
    try {
      const res = await fetch(
        `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
        { headers: { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9', Accept: 'text/html' }, signal: AbortSignal.timeout(8000) }
      )
      const html = await res.text()

      // DDG Lite puts snippets in <td> after title links
      const tdMatches = [...html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      for (const m of tdMatches) {
        const text = strip(m[1])
        if (text.length >= 30 && text.length <= 400 && !text.startsWith('http') && !text.includes('duckduckgo')) {
          if (!description) description = text
          splitSentences(text).forEach(s => raw.push(s))
          if (text.length < 200) raw.push(text)
        }
      }
    } catch {}
  }

  // 3. Try fetching a product page directly — use simple sites that server-render
  if (raw.length < 5) {
    const directUrls = [
      `https://www.eczanem.com/arama?q=${encodeURIComponent(q)}`,
      `https://www.netfarma.com.tr/arama?q=${encodeURIComponent(q)}`,
    ]
    for (const url of directUrls) {
      if (raw.length >= 10) break
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'tr-TR' }, signal: AbortSignal.timeout(5000) })
        if (!res.ok) continue
        const html = await res.text()
        const meta = extractMeta(html, 'description', 'og:description')
        if (meta && !description) description = meta
        if (meta) splitSentences(meta).forEach(s => raw.push(s))
        // Extract li items
        for (const m of html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
          const text = strip(m[1])
          if (text.length >= 25 && text.length <= 220 && !text.includes('{') && !text.includes('©')) raw.push(text)
        }
      } catch {}
    }
  }

  const features = dedupe(raw)
    .filter(f => f.length >= 25 && f.length <= 220)
    .slice(0, 20)

  return NextResponse.json({ description, features })
}
