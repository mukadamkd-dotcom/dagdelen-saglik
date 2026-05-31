import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const prompt = request.nextUrl.searchParams.get('prompt')
  const seed = request.nextUrl.searchParams.get('seed') ?? String(Math.floor(Math.random() * 99999))

  if (!prompt) return NextResponse.json({ error: 'prompt gerekli' }, { status: 400 })

  const w = request.nextUrl.searchParams.get('w') ?? '1080'
  const h = request.nextUrl.searchParams.get('h') ?? '1080'
  const pollinationsUrl =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${w}&height=${h}&seed=${seed}&nologo=true&model=flux`

  try {
    const resp = await fetch(pollinationsUrl, {
      signal: AbortSignal.timeout(90_000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })

    if (!resp.ok) {
      return NextResponse.json({ error: `Pollinations hata: ${resp.status}` }, { status: 502 })
    }

    const buffer = await resp.arrayBuffer()
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': resp.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Bilinmeyen hata' }, { status: 502 })
  }
}
