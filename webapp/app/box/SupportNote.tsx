import { ContentPanel } from '@/components/ui'
import { Sprout } from 'lucide-react'

export default function SupportNote() {
  return (
    <ContentPanel className="sp-support">
      <div className="sp-support-summary">
        <div className="sp-support-copy">
          <p className="sp-support-eyebrow">Learning for good</p>
          <h2>讓學習成果，成為一份真實的支持</h2>
          <p>
            每完成一隻守護靈的最高階段，平台就會提撥資金，支持與守護靈主題相關的公益機構。
          </p>
        </div>
        <div className="sp-support-result" aria-label="完成 LV5，平台提撥新台幣 10 元">
          <Sprout size={22} aria-hidden="true" />
          <span>完成 LV5</span>
          <span>平台提撥</span>
          <strong>NT$10</strong>
        </div>
      </div>
      <div className="sp-support-rules">
        <p>
          實際受贈機構、捐款時間與執行方式，將依當期公益計畫及合作條件為準。
          本活動中的積分與培育行為不等同於使用者直接捐款，亦不提供捐款收據或稅務抵扣憑證。每月提撥總額以新台幣
          5,000
          元為上限；詳細執行方式與公益紀錄將依正式活動辦法公告。當月達到提撥上限後，後續完成的公益進度將累計至下一期，不影響守護靈升級與圖鑑解鎖。
        </p>
      </div>
    </ContentPanel>
  )
}
