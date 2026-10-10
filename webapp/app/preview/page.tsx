import { PageContainer, StandardPageLayout } from '@/components/layout'
import PreviewClient from './PreviewClient'

export default function PreviewPage() {
  return (
    <StandardPageLayout>
      <PageContainer>
        <PreviewClient />
      </PageContainer>
    </StandardPageLayout>
  )
}
