import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import { ModeProvider } from '@/contexts/ModeContext'
import { Cormorant_Garamond, Inter } from 'next/font/google'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Dağdelen Sağlık',
  description: 'Stok ve Satış Yönetim Sistemi',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className={`${cormorant.variable} ${inter.variable}`}>
        <ModeProvider>
          <Sidebar />
          <main style={{ marginLeft: '260px', minHeight: '100vh', padding: '44px 40px', backgroundColor: '#F5F5F5' }}>
            {children}
          </main>
        </ModeProvider>
      </body>
    </html>
  )
}
