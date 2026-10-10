import type { HTMLAttributes, ReactNode } from 'react'
import AuthGuard from '@/components/AuthGuard'
import BackToAdminLink from '@/components/BackToAdminLink'
import Navbar from '@/components/Navbar'

export function PageContainer({
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="px-page-gutter md:px-page-gutter-md lg:px-page-gutter-lg">
      <div
        className={`mx-auto w-full max-w-site ${className}`}
        {...props}
      />
    </div>
  )
}

export function StandardPageLayout({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`spirit-theme min-h-screen bg-spirit-cream text-spirit-ink ${className}`}>
      <div className="standard-site-header">
        <Navbar />
      </div>
      {children}
    </div>
  )
}

export function AdminPageLayout({
  children,
  backHref,
  backLabel,
}: {
  children: ReactNode
  backHref?: string
  backLabel?: string
}) {
  return (
    <StandardPageLayout>
      <PageContainer>
        <BackToAdminLink href={backHref} label={backLabel} />
        <AuthGuard>{children}</AuthGuard>
      </PageContainer>
    </StandardPageLayout>
  )
}
