import { Check } from 'lucide-react'
import Footer from '@/components/Footer'
import LearningFooterFoliage from '@/components/learning/LearningFooterFoliage'
import Navbar from '@/components/Navbar'
import { PageContainer } from '@/components/layout'
import { Badge, Button, Card, ContentPanel, PageHeader } from '@/components/ui'
import styles from './subscription.module.css'

const coreBenefits = [
  {
    title: '看見學習變化',
    description: '掌握整體、各科與各觀念的熟練度變化，看見每一次練習累積出的進步。',
  },
  {
    title: '找到優先複習內容',
    description: '根據遺忘風險整理建議優先複習的觀念，協助你安排下一步。',
  },
  {
    title: '更有效率地培養精靈',
    description: '取得訂閱限定精靈，投入積分時享有額外的精靈成長加成。',
  },
]

const analysisFeatures = [
  {
    title: '進步曲線',
    description: '查看整體、各科與各觀念的熟練度如何隨時間改變。',
  },
  {
    title: '遺忘風險提示',
    description: '找出可能逐漸遺忘的觀念，並依優先程度安排複習。',
  },
  {
    title: '答題速度分析',
    description: '比較各科答題速度與平台中位數，理解自己的作答節奏。',
  },
]

const plans = [
  {
    name: '月繳方案',
    price: 'NT$199',
    period: '／月',
    note: '按月計費，可隨時取消',
  },
  {
    name: '年繳方案',
    price: 'NT$1,990',
    period: '／年',
    note: '平均每月約 NT$166（暫定）',
    recommended: true,
  },
]

const faqs = [
  ['訂閱後何時可以使用進階分析？', '完成訂閱後即可使用；正式啟用時間與付款流程仍待確認。'],
  ['原本的學習紀錄會保留嗎？', '會，訂閱不會影響既有的練習紀錄與學習資料。'],
  ['如何取消訂閱？', '取消方式、續訂日期與使用期限會在付款機制確認後補上。'],
  ['10% XP 加成如何計算？', '例如投入 100 積分，訂閱期間精靈可獲得 110 XP。'],
  ['公益類別可以更改嗎？', '限定精靈完成培養後的公益選擇規則仍待確認。'],
]

function ImagePlaceholder({ label }: { label: string }) {
  return (
    <div className={styles.imagePlaceholder} role="img" aria-label={label}>
      <span>這裡可以放圖片</span>
      <small>{label}</small>
    </div>
  )
}

export default function SubscriptionPage() {
  return (
    <div className={`${styles.page} learning-page`}>
      <div className="standard-site-header">
        <Navbar />
      </div>

      <main className={styles.main}>
        <PageContainer>
          <PageHeader
            title="訂閱方案"
            subtitle="解鎖完整學習分析，讓每一次練習都成為清楚可見的進步。"
          />

          <ContentPanel className={styles.hero}>
            <div className={styles.heroIntro}>
              <div className={styles.heroCopy}>
                <h2>讓學習方向更清楚，也讓精靈陪你一起成長</h2>
                <p>
                  訂閱後可使用完整的進階學習分析、取得限定精靈，並享有精靈培養加成。
                </p>
              </div>
              <ImagePlaceholder label="訂閱方案主視覺" />
            </div>

            <form className={styles.planSelector}>
              <fieldset>
                <legend>選擇計費週期</legend>
                <div className={styles.planOptions}>
                  {plans.map((plan) => (
                    <label key={plan.name} className={styles.planOption}>
                      <input
                        type="radio"
                        name="billing-period"
                        value={plan.name}
                        defaultChecked={plan.recommended}
                      />
                      <span className={styles.radioMark} aria-hidden="true" />
                      <span className={styles.planOptionContent}>
                        <span className={styles.planOptionHeading}>
                          <strong>{plan.name}</strong>
                          {plan.recommended && <Badge tone="complete">推薦</Badge>}
                        </span>
                        <span className={styles.planOptionPrice}>
                          <strong>{plan.price}</strong>
                          <span>{plan.period}</span>
                        </span>
                        <small>{plan.note}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <ul className={styles.planSummary}>
                <li><Check size={18} aria-hidden="true" />完整進階學習分析</li>
                <li><Check size={18} aria-hidden="true" />訂閱限定精靈</li>
                <li><Check size={18} aria-hidden="true" />精靈培養 XP 加成</li>
              </ul>
              <Button className={styles.subscribeButton} size="lg" disabled>
                開始訂閱（尚未開放）
              </Button>
              <p className={styles.planNotice}>金額與方案內容皆為暫定，正式上線前會再確認。</p>
            </form>
          </ContentPanel>

          <section className={styles.section} aria-labelledby="benefit-title">
            <div className={styles.sectionHeading}>
              <h2 id="benefit-title">更完整地理解自己的學習狀態</h2>
            </div>
            <div className={styles.threeColumnGrid}>
              {coreBenefits.map((benefit) => (
                <Card key={benefit.title} className={styles.featureCard}>
                  <span className={styles.featureMarker} aria-hidden="true" />
                  <h3>{benefit.title}</h3>
                  <p>{benefit.description}</p>
                </Card>
              ))}
            </div>
          </section>

          <section className={styles.section} aria-labelledby="analysis-title">
            <div className={styles.sectionHeading}>
              <h2 id="analysis-title">從練習紀錄找到下一步</h2>
            </div>
            <div className={styles.analysisGrid}>
              {analysisFeatures.map((feature) => (
                <Card key={feature.title} className={styles.analysisCard}>
                  <ImagePlaceholder label={`${feature.title}介面預覽`} />
                  <div>
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section className={`${styles.section} ${styles.spiritSection}`} aria-labelledby="spirit-title">
            <div className={styles.spiritCopy}>
              <div className={styles.sectionHeading}>
                <h2 id="spirit-title">培養專屬於訂閱方案的精靈</h2>
              </div>
              <p>
                訂閱期間可在蛋商店取得限定的蛋。培養完成後，可依正式規則選擇希望支持的公益類別。
              </p>
              <ul className={styles.checkList}>
                <li><Check size={18} aria-hidden="true" />訂閱限定的精靈與成長階段</li>
                <li><Check size={18} aria-hidden="true" />不預先綁定單一公益類別</li>
                <li><Check size={18} aria-hidden="true" />完成培養後選擇支持方向</li>
              </ul>
            </div>
            <ImagePlaceholder label="訂閱限定精靈預覽" />
            <div className={styles.spiritBonus}>
              <div>
                <h3>投入積分時，額外獲得 10% XP</h3>
                <p>例如投入 100 積分，精靈可獲得 110 XP。加成不影響題目分數或學習統計。</p>
              </div>
              <strong className={styles.bonusValue}>+10%</strong>
            </div>
          </section>

          <ContentPanel className={styles.supportPanel}>
            <div>
              <h2>讓學習成長，也能支持你在意的事</h2>
            </div>
            <p>
              訂閱限定精靈完成培養後，可以選擇希望支持的公益類別。訂閱費、平台捐款與選擇方式將在規則確認後補上完整說明。
            </p>
          </ContentPanel>

          <section className={`${styles.section} ${styles.faqSection}`} aria-labelledby="faq-title">
            <div className={styles.sectionHeading}>
              <h2 id="faq-title">關於訂閱方案</h2>
            </div>
            <div className={styles.faqList}>
              {faqs.map(([question, answer]) => (
                <details key={question} className={styles.faqItem}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>
        </PageContainer>
      </main>

      <div className="px-4 sm:px-6">
        <LearningFooterFoliage className="learning-page-footer-foliage" />
        <Footer variant="learning" />
      </div>
    </div>
  )
}
