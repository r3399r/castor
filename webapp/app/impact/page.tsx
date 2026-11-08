import type { Metadata } from 'next'
import Navbar from '@/components/Navbar'
import ImpactClient from './ImpactClient'

export const metadata: Metadata = {
  title: '公益徵信紀錄',
  description:
    '學益平台所有已完成的公益撥款紀錄：受贈單位、金額、匯款日期與證明文件，任何人都可以查看核對。',
}

/**
 * The public transparency page. Deliberately outside AuthGuard.
 *
 * Needing no sign-in is the whole point: a record only anyone-with-an-
 * account can read is not evidence. The data comes from
 * GET /api/info/donation, which lists published batches only and never
 * names a user -- and sits under the /api/info/* CloudFront behavior,
 * which does not forward Authorization.
 */
export default function ImpactPage() {
  return (
    <div className="spirit-theme sp-page">
      <div className="standard-site-header">
        <Navbar />
      </div>
      <ImpactClient />
    </div>
  )
}
