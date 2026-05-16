import { NextRequest, NextResponse } from 'next/server'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function tryOpenFoodFacts(barcode: string): Promise<string | null> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`)
    const d = await res.json()
    return d.status === 1 ? (d.product?.image_front_url ?? d.product?.image_url ?? null) : null
  } catch { return null }
}

async function tryUpcItemDb(barcode: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const d = await res.json()
    return d.items?.[0]?.images?.[0] ?? null
  } catch { return null }
}

async function tryDuckDuckGoImages(query: string): Promise<string | null> {
  try {
    // Step 1: get VQD token
    const searchRes = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&ia=images`,
      { headers: { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9' } }
    )
    const html = await searchRes.text()
    const vqdMatch = html.match(/vqd=["']?([^"'&\s]+)["']?/)
    if (!vqdMatch?.[1]) return null
    const vqd = vqdMatch[1]

    // Step 2: fetch image results
    const imgRes = await fetch(
      `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&vqd=${vqd}&o=json&p=1&s=0&u=bing&f=,,,,,&l=tr-tr`,
      {
        headers: {
          'User-Agent': UA,
          'Referer': 'https://duckduckgo.com/',
          'Accept': 'application/json',
          'Accept-Language': 'tr-TR,tr;q=0.9',
        },
      }
    )
    const data = await imgRes.json()
    // Prefer images from known product CDNs
    const results: { image: string; thumbnail: string }[] = data.results ?? []
    const preferred = results.find(r =>
      /hepsiburada|trendyol|n11|gratis|watsons|rossmann|amazon|eczanem|ilacat/i.test(r.image)
    )
    return (preferred ?? results[0])?.image ?? null
  } catch { return null }
}

export async function GET(request: NextRequest) {
  const barcode = request.nextUrl.searchParams.get('barcode') ?? ''
  const name = request.nextUrl.searchParams.get('name') ?? ''

  if (!barcode && !name) return NextResponse.json({ image_url: null })

  // 1. Open Food Facts
  if (barcode) {
    const url = await tryOpenFoodFacts(barcode)
    if (url) return NextResponse.json({ image_url: url })
  }

  // 2. UPC Item DB
  if (barcode) {
    const url = await tryUpcItemDb(barcode)
    if (url) return NextResponse.json({ image_url: url })
  }

  // 3. DuckDuckGo by barcode
  if (barcode) {
    const url = await tryDuckDuckGoImages(barcode)
    if (url) return NextResponse.json({ image_url: url })
  }

  // 4. DuckDuckGo by product name (Turkish context)
  if (name) {
    const url = await tryDuckDuckGoImages(`${name} ürün`)
    if (url) return NextResponse.json({ image_url: url })
  }

  return NextResponse.json({ image_url: null })
}
