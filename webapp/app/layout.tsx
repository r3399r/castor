import type { Metadata, Viewport } from 'next'
import { Fredoka, Inter } from 'next/font/google'
import { AuthProvider } from '@/contexts/AuthContext'
import MathJaxProvider from '@/components/MathJaxProvider'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const fredoka = Fredoka({
  subsets: ['latin'],
  weight: '600',
  variable: '--font-fredoka',
  display: 'swap',
})

// The English is in the title as well as the Chinese because "學益" is a
// homophone of "學藝" -- people who hear the name will search for the wrong
// spelling, and "Learn for Good" is the half of the brand that is unambiguous.
const TITLE = '學益 Learn for Good - 考試題庫與練習平台'
const DESCRIPTION =
  '涵蓋高中／大學／公職／證照考試，以智慧出題與個人化練習，幫你精準掌握重點、穩定提升成績。練習累積的積分還能培育精靈，完成培育後由平台提撥款項支持公益——學習有所得，也讓世界有所益。'

export const metadata: Metadata = {
  // Open Graph tags have to carry absolute URLs, and a static export has no
  // request to infer the host from, so the canonical public origin is stated
  // here. Without it Next falls back to localhost and every share preview
  // points at a machine nobody else can reach.
  //
  // The one place the public hostname is written in application code. Every
  // other copy -- the Route53 record, the CloudFront alias, the CORS origin,
  // PUBLIC_BASE_URL and therefore ECPay's callback URLs -- is derived from
  // `SubDomain` in the CloudFormation template, which deploy.sh passes in.
  // Keep this in step with deploy.sh's `subDomain` by hand.
  metadataBase: new URL('https://learnforgood.celestialstudio.net'),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    locale: 'zh_TW',
    siteName: '學益 Learn for Good',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className={`${inter.variable} ${fredoka.variable}`}>
      <body className="bg-beige-100">
        <MathJaxProvider>
          <AuthProvider>{children}</AuthProvider>
        </MathJaxProvider>
      </body>
    </html>
  )
}
