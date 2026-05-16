import type { Metadata } from 'next'
import { AuthProvider } from '@/contexts/AuthContext'
import MathJaxProvider from '@/components/MathJaxProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'PMP - 考試題庫與練習平台',
  description:
    '涵蓋高中／大學／公職／證照考試，透過智慧出題與個人化練習，幫助你精準掌握重點，穩定提升解題能力與每一次考試表現。',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body className="bg-beige-100">
        <MathJaxProvider>
          <AuthProvider>{children}</AuthProvider>
        </MathJaxProvider>
      </body>
    </html>
  )
}
