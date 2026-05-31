import { NextRequest, NextResponse } from 'next/server'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? ''
  if (!q) return NextResponse.json({ images: [] })

  try {
    const searchRes = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(q)}&ia=images`,
      { headers: { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9' } }
    )
    const html = await searchRes.text()
    const vqdMatch = html.match(/vqd=["']?([^"'&\s]+)["']?/)
    if (!vqdMatch?.[1]) return NextResponse.json({ images: [] })
    const vqd = vqdMatch[1]

    const imgRes = await fetch(
      `https://duckduckgo.com/i.js?q=${encodeURIComponent(q)}&vqd=${vqd}&o=json&p=1&s=0&u=bing&f=,,,,,&l=tr-tr`,
      {
        headers: {
          'User-Agent': UA,
          'Referer': 'https://duckduckgo.com/',
          'Accept': 'application/json',
        },
      }
    )
    const data = await imgRes.json()
    const images = (data.results ?? []).slice(0, 15).map((r: any) => ({
      thumbnail: r.thumbnail,
      url: r.image,
      title: r.title,
    }))
    return NextResponse.json({ images })
  } catch {
    return NextResponse.json({ images: [] })
  }
}
