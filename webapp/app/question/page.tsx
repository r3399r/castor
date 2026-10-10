import { PageContainer, StandardPageLayout } from '@/components/layout'
import QuestionClient from './QuestionClient'

export default function QuestionPage() {
  return (
    <StandardPageLayout>
      <PageContainer>
        <QuestionClient />
      </PageContainer>
    </StandardPageLayout>
  )
}
