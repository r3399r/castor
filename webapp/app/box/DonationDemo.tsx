'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, ChevronDown, ChevronLeft, ExternalLink, HeartHandshake, RotateCcw, Sparkles } from 'lucide-react'
import { Badge, Button, ButtonLink, Card, ContentPanel, Modal } from '@/components/ui'
import { SpiritArtwork, SpiritScene } from '@/components/spirit'
import { spiritCatalog, type SpiritSpecies } from '@/lib/guardianArtwork'
import {
  DEMO_DONATION_AMOUNT,
  DONATION_DEMO_STORAGE_KEY,
  defaultDonationDemoState,
  demoOrganizationCategories,
  findDemoOrganization,
  organizationsFor,
  readDonationDemoState,
  writeDonationDemoState,
  type DonationDemoState,
} from '@/lib/donationDemo'

const demoSpiritOptions: { value: SpiritSpecies; label: string }[] = [
  { value: 'cat', label: '貓精靈' },
  { value: 'rabbit', label: '兔子精靈' },
  { value: 'bird', label: '彩羽鳥靈' },
  { value: 'deer', label: '森林鹿靈' },
]

function useDonationDemo(enabled = true) {
  const [state, setState] = useState(defaultDonationDemoState)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (enabled) setState(readDonationDemoState())
    setReady(true)
  }, [enabled])
  const update = useCallback((next: DonationDemoState | ((value: DonationDemoState) => DonationDemoState)) => {
    setState((current) => {
      const value = typeof next === 'function' ? next(current) : next
      writeDonationDemoState(value)
      return value
    })
  }, [])
  return { state, update, ready }
}

function DemoNotice() {
  return (
    <p className="donation-demo-notice" role="note">
      <Sparkles size={16} aria-hidden="true" />
      示範流程，本次操作不會產生實際撥款。
    </p>
  )
}

const confettiPieces = Array.from({ length: 30 }, (_, index) => ({
  color: ['#e1c77a', '#d7654f', '#5d9270', '#4f8f9a', '#f2a65a'][index % 5],
  x: ((index * 47) % 360) - 180,
  y: 190 + ((index * 71) % 260),
  rotation: ((index * 83) % 540) - 270,
  delay: (index % 6) * 24,
  wide: index % 3 === 0,
}))

function CelebrationConfetti() {
  return (
    <div className="donation-confetti" aria-hidden="true">
      {confettiPieces.map((piece, index) => (
        <span
          key={index}
          className={piece.wide ? 'is-wide' : ''}
          style={{
            '--confetti-color': piece.color,
            '--confetti-x': `${piece.x}px`,
            '--confetti-y': `${piece.y}px`,
            '--confetti-rotation': `${piece.rotation}deg`,
            '--confetti-delay': `${piece.delay}ms`,
          } as CSSProperties}
        />
      ))}
    </div>
  )
}

function SpiritSummary({
  state,
  categorySelector = false,
  onCategoryChange,
}: {
  state: DonationDemoState
  categorySelector?: boolean
  onCategoryChange?: (category: string) => void
}) {
  const spirit = spiritCatalog[state.spirit]
  const category = state.vip
    ? (state.draftCategory ?? demoOrganizationCategories[0])
    : spirit.category
  return (
    <section className="donation-spirit-summary">
      <div className="donation-spirit-thumb">
        {state.vip ? <span className="donation-vip-art-blank" aria-label="VIP 精靈圖片尚未提供" /> : <SpiritArtwork species={state.spirit} level={5} priority />}
      </div>
      <div className="donation-spirit-copy">
        <Badge tone="complete"><Check size={13} aria-hidden="true" /> LV5 滿級</Badge>
        <div className="donation-spirit-title-row">
          <h2>{state.vip ? 'VIP 星冠精靈' : spirit.name}</h2>
          {state.vip && categorySelector ? (
            <label className="donation-category-select">
              <span className="sr-only">選擇公益類別</span>
              <select value={category} onChange={(event) => onCategoryChange?.(event.target.value)}>
                {demoOrganizationCategories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </label>
          ) : (
            <p className="donation-category-label">{category}</p>
          )}
        </div>
      </div>
    </section>
  )
}

export function DonationDemoBox() {
  const { state, update, ready } = useDonationDemo()
  const [celebrating, setCelebrating] = useState(false)
  const organization = findDemoOrganization(state.organizationId)
  const maxed = state.stage !== 'not-maxed'

  const simulateMax = () => {
    if (maxed) return
    update((current) => ({ ...current, stage: 'eligible', celebrationSeen: true }))
    setCelebrating(true)
  }
  const reset = () => {
    try { window.localStorage.removeItem(DONATION_DEMO_STORAGE_KEY) } catch {}
    update(defaultDonationDemoState)
    setCelebrating(false)
  }
  const openDonationStep = (step: 'choose' | 'record') => {
    window.location.assign(`/box/donation/?demo=donation&step=${step}`)
  }

  if (!ready) return <div className="sp-box"><p className="sp-description">載入示範資料…</p></div>

  return (
    <div className="sp-box donation-demo-box">
      <div className="donation-demo-shell">
        <DemoNotice />
        <ContentPanel className="donation-demo-controls" aria-label="公益支持 demo 控制區">
          <div>
            <p className="sp-eyebrow">DEMO CONTROLS</p>
            <h1>公益支持互動示範</h1>
            <p className="sp-description">切換精靈類型並模擬流程；所有資料只保存在此瀏覽器。</p>
          </div>
          <div className="donation-demo-fields">
            <label>
              <span>示範精靈</span>
              <select
                value={state.vip ? 'vip' : state.spirit}
                disabled={state.stage === 'pending' || state.stage === 'disbursed'}
                onChange={(event) => {
                  const value = event.target.value
                  update({
                    ...state,
                    spirit: value === 'vip' ? 'bird' : value as SpiritSpecies,
                    vip: value === 'vip',
                    draftCategory: null,
                    draftOrganizationId: null,
                  })
                }}
              >
                {demoSpiritOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                <option value="vip">VIP 星冠精靈（可跨分類）</option>
              </select>
            </label>
          </div>
          <div className="donation-demo-control-actions">
            <Button onClick={simulateMax} disabled={maxed}>模擬 LV5 滿級</Button>
            <Button
              variant="secondary"
              disabled={state.stage !== 'pending'}
              onClick={() => update({ ...state, stage: 'disbursed', disbursedAt: new Date().toISOString() })}
            >
              模擬平台完成撥款
            </Button>
            <Button variant="quiet" onClick={reset}><RotateCcw size={16} aria-hidden="true" />重設 demo</Button>
          </div>
        </ContentPanel>

        <div className="donation-demo-growing">
          {state.vip ? (
            <div className="donation-vip-scene" aria-label="VIP 精靈圖片尚未提供">
              <span>{maxed ? 'LV5 滿級' : 'LV4'}</span>
            </div>
          ) : (
            <SpiritScene species={state.spirit} level={maxed ? 5 : 4} priority caption={maxed ? 'LV5 滿級' : 'LV4'} />
          )}
          <ContentPanel className="donation-max-card">
            <p className="sp-eyebrow">{state.vip ? '可跨公益分類' : spiritCatalog[state.spirit].category}</p>
            <h2>{state.vip ? 'VIP 星冠精靈' : spiritCatalog[state.spirit].name}</h2>
            {!maxed ? (
              <div className="donation-locked-message">
                <Badge tone="growth">尚未滿級 · LV4</Badge>
                <p>精靈達到 LV5 滿級後，才會取得一次公益支持對象的選擇機會。</p>
              </div>
            ) : state.stage === 'eligible' ? (
              <div className="donation-unlocked-message">
                <Badge tone="complete"><Check size={13} aria-hidden="true" /> LV5 滿級</Badge>
                <h3>滿級達成！讓這份陪伴延續下去</h3>
                <p>你已完成這隻精靈的養成，可以選擇一個公益組織，由平台提供捐款支持。</p>
                <Button onClick={() => openDonationStep('choose')}>選擇支持對象</Button>
              </div>
            ) : (
              <div className="donation-unlocked-message">
                <Badge tone="complete">{state.stage === 'pending' ? '等待平台撥款（示範）' : '平台已完成撥款（示範）'}</Badge>
                <h3>已選擇支持{organization?.name ?? '示範公益組織'}</h3>
                <p>精靈會繼續保留在收藏中，本次養成成果無法再次提交。</p>
                <Button variant="secondary" onClick={() => openDonationStep('record')}>查看支持紀錄</Button>
              </div>
            )}
          </ContentPanel>
        </div>
      </div>
      {celebrating && (
        <Modal title="滿級達成！" className="donation-celebration" onClose={() => setCelebrating(false)}>
          <CelebrationConfetti />
          <div className="donation-celebration-art">
            {state.vip ? <span className="donation-vip-art-blank" aria-label="VIP 精靈圖片尚未提供" /> : <SpiritArtwork species={state.spirit} level={5} priority />}
          </div>
          <p className="donation-celebration-copy">
            恭喜你完成一隻精靈的養成！現在可以選擇一個相關公益組織作為捐款對象，
            <strong>這份支持由平台提供。</strong>
          </p>
          <div className="sp-dialog-actions">
            <Button variant="secondary" onClick={() => setCelebrating(false)}>稍後再選</Button>
            <Button onClick={() => openDonationStep('choose')}>選擇支持對象</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function formatDemoTime(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function DonationFlowClient() {
  const router = useRouter()
  const params = useSearchParams()
  const demoMode = params.get('demo') === 'donation'
  const requestedStep = params.get('step') ?? 'choose'
  const { state, update, ready } = useDonationDemo(demoMode)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const organizations = organizationsFor(state)
  const draft = organizations.find((item) => item.id === state.draftOrganizationId)
  const confirmed = findDemoOrganization(state.organizationId)

  let step = requestedStep
  if (state.stage === 'not-maxed') step = 'locked'
  else if (state.stage === 'disbursed') step = 'record'
  else if (state.stage === 'pending' && step !== 'complete' && !submitting) step = 'record'
  else if (submitting && state.stage === 'pending') step = 'complete'
  else if (state.stage === 'eligible' && step === 'complete') step = 'choose'
  else if (step === 'confirm' && !draft) step = 'choose'
  else if (!['choose', 'confirm', 'complete', 'record'].includes(step)) step = 'choose'

  useEffect(() => {
    if (!demoMode) {
      router.replace('/box')
      return
    }
    if (!ready || step === requestedStep) return
    router.replace(`/box/donation/?demo=donation&step=${step}`)
  }, [demoMode, ready, requestedStep, router, step])

  if (!ready || !demoMode) return <main className="donation-flow"><p>載入示範資料…</p></main>

  const confirm = () => {
    if (!draft || submitting || state.stage !== 'eligible') return
    setSubmitting(true)
    const next = { ...state, stage: 'pending' as const, organizationId: draft.id, selectedAt: new Date().toISOString() }
    update(next)
    router.replace('/box/donation/?demo=donation&step=complete')
  }

  return (
    <main className="donation-flow">
      <div className="donation-flow-inner">
        {step === 'locked' ? (
          <ContentPanel className="donation-centered-state">
            <h1>尚未取得支持選擇機會</h1>
            <p>請先在 demo 控制區模擬精靈達到 LV5 滿級。</p>
            <ButtonLink href="/box/?demo=donation">返回精靈養成</ButtonLink>
          </ContentPanel>
        ) : step === 'choose' ? (
          <>
            <ButtonLink href="/box/?demo=donation" variant="quiet" className="donation-back"><ChevronLeft size={17} aria-hidden="true" />返回精靈養成</ButtonLink>
            <header className="donation-flow-heading"><h1>選擇公益支持對象</h1><p>本次由平台捐出 NT${DEMO_DONATION_AMOUNT}（示範金額），你不需要付款。</p></header>
            <SpiritSummary
              state={state}
              categorySelector
              onCategoryChange={(category) => update({ ...state, draftCategory: category, draftOrganizationId: null })}
            />
            <div className="donation-org-grid" role="radiogroup" aria-label="示範公益組織">
              {organizations.map((item) => {
                const selected = state.draftOrganizationId === item.id
                const isExpanded = expanded === item.id
                return (
                  <Card
                    key={item.id}
                    className={`donation-org-card${selected ? ' is-selected' : ''}`}
                    role="radio"
                    aria-checked={selected}
                    tabIndex={0}
                    onClick={() => update({ ...state, draftOrganizationId: item.id })}
                    onKeyDown={(event) => {
                      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); update({ ...state, draftOrganizationId: item.id }) }
                    }}
                  >
                    <div className="donation-radio" aria-hidden="true">{selected && <Check size={15} />}</div>
                    <h2>{item.name}</h2>
                    <div className={`donation-org-description${isExpanded ? ' is-expanded' : ''}`}>
                      <p>{item.focus}。{item.description}</p>
                    </div>
                    <button
                      type="button"
                      className="donation-expand-button"
                      aria-label={isExpanded ? `收合${item.name}簡介` : `展開${item.name}完整簡介`}
                      aria-expanded={isExpanded}
                      onClick={(event) => { event.stopPropagation(); setExpanded(isExpanded ? null : item.id) }}
                    >
                      <ChevronDown size={18} aria-hidden="true" />
                    </button>
                    <a
                      className="donation-org-link"
                      href={item.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                    >
                      了解更多 <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  </Card>
                )
              })}
            </div>
            <div className="donation-action-bar">
              <p aria-live="polite">{draft ? `已選擇：${draft.name}` : '請先選擇一個示範公益組織'}</p>
              <Button disabled={!draft} onClick={() => router.push('/box/donation/?demo=donation&step=confirm')}>下一步</Button>
            </div>
          </>
        ) : step === 'confirm' && draft ? (
          <>
            <header className="donation-flow-heading"><h1>確認支持的公益組織</h1></header>
            <ContentPanel className="donation-confirm-card">
              <div className="donation-confirm-spirit">
                <div className="donation-confirm-spirit-art">
                  {state.vip ? <span className="donation-vip-art-blank" aria-label="VIP 精靈圖片尚未提供" /> : <SpiritArtwork species={state.spirit} level={5} priority />}
                </div>
                <div>
                  <div className="donation-confirm-spirit-title">
                    <h2>{state.vip ? 'VIP 星冠精靈' : spiritCatalog[state.spirit].name}</h2>
                  </div>
                  <p>{state.vip ? (state.draftCategory ?? demoOrganizationCategories[0]) : spiritCatalog[state.spirit].category}</p>
                </div>
              </div>
              <HeartHandshake size={32} aria-hidden="true" />
              <dl>
                <div><dt>支持的示範組織</dt><dd>{draft.name}</dd></div>
                <div><dt>平台捐款金額</dt><dd>NT${DEMO_DONATION_AMOUNT}（示範金額）</dd></div>
              </dl>
              <p>款項由平台支付，你不需要付款。</p>
              <p>平台完成撥款後將另行通知。</p>
              <p className="donation-final-warning">確認後將無法更換本次支持對象。</p>
              <div className="donation-confirm-actions">
                <Button variant="secondary" disabled={submitting} onClick={() => router.push('/box/donation/?demo=donation&step=choose')}>返回修改</Button>
                <Button loading={submitting} onClick={confirm}>確認支持這個組織</Button>
              </div>
            </ContentPanel>
          </>
        ) : step === 'complete' ? (
          <ContentPanel className="donation-centered-state">
            <span className="donation-complete-icon"><Check size={30} aria-hidden="true" /></span>
            <h1>已收到你的支持選擇</h1>
            <p>你已選擇支持{confirmed?.name ?? draft?.name}。正式版將由平台依撥款時程處理。</p>
            <Badge tone="growth">等待平台撥款（示範）</Badge>
            <ButtonLink href="/box/?demo=donation">返回精靈養成</ButtonLink>
          </ContentPanel>
        ) : (
          <>
            <ButtonLink href="/box/?demo=donation" variant="quiet" className="donation-back"><ChevronLeft size={17} aria-hidden="true" />返回精靈養成</ButtonLink>
            <header className="donation-flow-heading"><h1>公益支持紀錄</h1></header>
            <ContentPanel className="donation-record-card">
              <div className="donation-confirm-spirit">
                <div className="donation-confirm-spirit-art">
                  {state.vip ? <span className="donation-vip-art-blank" aria-label="VIP 精靈圖片尚未提供" /> : <SpiritArtwork species={state.spirit} level={5} priority />}
                </div>
                <div>
                  <div className="donation-confirm-spirit-title">
                    <h2>{state.vip ? 'VIP 星冠精靈' : spiritCatalog[state.spirit].name}</h2>
                  </div>
                  <p>{state.vip ? (state.draftCategory ?? demoOrganizationCategories[0]) : spiritCatalog[state.spirit].category}</p>
                </div>
              </div>
              <dl>
                <div><dt>支持組織</dt><dd>{confirmed?.name ?? '—'}</dd></div>
                <div><dt>示範金額</dt><dd>NT${DEMO_DONATION_AMOUNT}</dd></div>
                <div><dt>選擇時間</dt><dd>{formatDemoTime(state.selectedAt)}</dd></div>
                <div><dt>目前狀態</dt><dd>{state.stage === 'disbursed' ? '平台已完成撥款' : '等待平台撥款'}</dd></div>
                {state.disbursedAt && <div><dt>撥款完成時間</dt><dd>{formatDemoTime(state.disbursedAt)}</dd></div>}
                <div>
                  <dt>公益執行紀錄</dt>
                  <dd>
                    {state.stage === 'disbursed' ? (
                      <a className="donation-record-link" href="https://example.org/" target="_blank" rel="noopener noreferrer">
                        查看平台公益紀錄 <ExternalLink size={15} aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="donation-record-pending">將於平台完成撥款後提供</span>
                    )}
                  </dd>
                </div>
              </dl>
              <ButtonLink href="/box/?demo=donation">返回精靈養成</ButtonLink>
            </ContentPanel>
          </>
        )}
      </div>
    </main>
  )
}
