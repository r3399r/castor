'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, ChevronDown, ChevronLeft, ExternalLink, HeartHandshake } from 'lucide-react'
import { Badge, Button, ButtonLink, Card, ContentPanel, Modal } from '@/components/ui'
import { SpiritArtwork } from '@/components/spirit'
import { ApiError, apiFetch, apiPost } from '@/lib/api'
import { artworkByCode, type SpiritSpecies } from '@/lib/guardianArtwork'
import { formatNumber } from '@/lib/number'
import type {
  CharityCategoryRow,
  CharityOrganization,
  Donation,
  GetCharityCategoriesResponse,
  GetDonationResponse,
  GetGuardianResponse,
  GetSuggestedOrganizationResponse,
  Guardian,
  Paginate,
} from '@/types/api'

/**
 * The real LV5 donation flow, against the API.
 *
 * Deliberately a separate file from DonationDemo.tsx rather than a
 * `demoMode` branch inside it: that file's state lives in localStorage and
 * its organisations are fictional, and interleaving the two sources in one
 * component is how a demo value ends up rendered as a real promise. The
 * demo stays reachable at /box/donation/?demo=donation for design review.
 *
 * Two facts shape everything here:
 *
 *  - A donation row exists only once the user confirms, and `donation.
 *    amount` is frozen at that moment. Anything already confirmed renders
 *    its own stored amount; only the not-yet-confirmed case may show
 *    today's `donationAmount`.
 *  - The cap is one donation per *spirit* (`user_guardian`'s UNIQUE), so
 *    "has this spirit been spent" is answered by looking for a donation
 *    with that userGuardianId -- not by any flag on the spirit.
 */

/** Per-viewer convenience only: whether the confetti has already played. */
const celebrationKey = (userGuardianId: number) =>
  `castor:donation-celebrated:v1:${userGuardianId}`

const hasCelebrated = (userGuardianId: number) => {
  try {
    return window.localStorage.getItem(celebrationKey(userGuardianId)) === '1'
  } catch {
    // Private windows and blocked storage both throw. Treating that as
    // "already seen" is the quieter failure: replaying confetti on every
    // visit is worse than never showing it.
    return true
  }
}

const markCelebrated = (userGuardianId: number) => {
  try {
    window.localStorage.setItem(celebrationKey(userGuardianId), '1')
  } catch {
    // Nothing depends on this persisting.
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  GUARDIAN_NOT_MAX_LEVEL: '這隻精靈還沒達到 LV5。',
  DONATION_ALREADY_CONFIRMED: '這隻精靈已經選過支持對象了。',
  DONATION_CATEGORY_REQUIRED: '請先選擇一個公益類別。',
  DONATION_CATEGORY_INACTIVE: '這個公益類別目前沒有開放，請改選其他類別。',
  DONATION_CATEGORY_INVALID: '這隻精靈不能支持這個類別。',
  ORGANIZATION_INACTIVE: '這個組織已停止合作，請改選其他組織。',
  ORGANIZATION_CATEGORY_MISMATCH: '這個組織不屬於所選的公益類別，請重新選擇。',
}

const describeError = (error: unknown, fallback: string) => {
  if (error instanceof ApiError) {
    if (error.code && ERROR_MESSAGES[error.code]) return ERROR_MESSAGES[error.code]
    if (error.status === 404) return '找不到這隻精靈。'
  }
  return fallback
}

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  )

const formatDay = (value: string) =>
  new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium' }).format(new Date(value))

/**
 * Every donation the signed-in user has made, keyed by spirit.
 *
 * One request for the whole set rather than one per spirit: only one spirit
 * is on screen at a time in the box, but the flow page needs to answer
 * "has this one been spent" before it knows which step to show.
 */
const useOwnDonations = () => {
  const [state, setState] = useState<{
    byGuardian: Map<number, Donation>
    donationAmount: number
    ready: boolean
    failed: boolean
  }>({ byGuardian: new Map(), donationAmount: 0, ready: false, failed: false })

  const reload = useCallback(async () => {
    try {
      // MAX_LIMIT is 1000 server-side; a user cannot have more donations
      // than they have species, so one page is the whole set.
      const res = await apiFetch<GetDonationResponse>('donation', { limit: 100 })
      setState({
        byGuardian: new Map(res.data.map((row) => [row.userGuardianId, row])),
        donationAmount: res.donationAmount,
        ready: true,
        failed: false,
      })
    } catch {
      setState((prev) => ({ ...prev, ready: true, failed: true }))
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { ...state, reload }
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
          style={
            {
              '--confetti-color': piece.color,
              '--confetti-x': `${piece.x}px`,
              '--confetti-y': `${piece.y}px`,
              '--confetti-rotation': `${piece.rotation}deg`,
              '--confetti-delay': `${piece.delay}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

/**
 * The LV5 panel inside the box: either an invitation to choose, or the
 * record of what was already chosen.
 */
export function DonationEntry({
  guardian,
  species,
}: {
  guardian: Guardian
  species: SpiritSpecies
}) {
  const { byGuardian, donationAmount, ready, failed } = useOwnDonations()
  const donation = byGuardian.get(guardian.id)
  const [celebrating, setCelebrating] = useState(false)

  useEffect(() => {
    if (!ready || donation !== undefined) return
    if (hasCelebrated(guardian.id)) return
    markCelebrated(guardian.id)
    setCelebrating(true)
  }, [guardian.id, donation, ready])

  const open = (step?: string) =>
    window.location.assign(
      `/box/donation/?guardianId=${guardian.id}${step ? `&step=${step}` : ''}`
    )

  if (!ready) return <p className="sp-description">載入公益支持狀態…</p>

  if (failed)
    return (
      <div className="donation-unlocked-message">
        <h3>暫時無法取得公益支持狀態</h3>
        <p>請稍後重新載入頁面。你的選擇機會不會消失。</p>
      </div>
    )

  return (
    <>
      {donation === undefined ? (
        <div className="donation-unlocked-message">
          <Badge tone="complete">
            <Check size={13} aria-hidden="true" /> LV5 滿級
          </Badge>
          <h3>滿級達成！讓這份陪伴延續下去</h3>
          <p>
            你已完成這隻精靈的養成，可以選擇一個公益組織，由平台捐出 NT$
            {formatNumber(donationAmount)}。
          </p>
          <Button onClick={() => open('choose')}>選擇支持對象</Button>
        </div>
      ) : (
        <div className="donation-unlocked-message">
          <Badge tone="complete">
            {donation.batch === null
              ? '等待平台撥款'
              : donation.batch.published
                ? '平台已完成撥款'
                : '已撥款，徵信資料準備中'}
          </Badge>
          <h3>已選擇支持{donation.organization.name}</h3>
          <Button variant="secondary" onClick={() => open('record')}>
            查看支持紀錄
          </Button>
        </div>
      )}
      {celebrating && (
        <Modal
          title="滿級達成！"
          className="donation-celebration"
          onClose={() => setCelebrating(false)}
        >
          <CelebrationConfetti />
          <div className="donation-celebration-art">
            <SpiritArtwork species={species} level={5} priority />
          </div>
          <p className="donation-celebration-copy">
            恭喜你完成一隻精靈的養成！現在可以選擇一個相關公益組織作為捐款對象，
            <strong>這份支持由平台提供。</strong>
          </p>
          <div className="sp-dialog-actions">
            <Button variant="secondary" onClick={() => setCelebrating(false)}>
              稍後再選
            </Button>
            <Button onClick={() => open('choose')}>選擇支持對象</Button>
          </div>
        </Modal>
      )}
    </>
  )
}

function SpiritSummary({
  guardian,
  categoryName,
  categoryChoices,
  onCategoryChange,
}: {
  guardian: Guardian
  categoryName: string
  categoryChoices?: CharityCategoryRow[]
  onCategoryChange?: (categoryId: number) => void
}) {
  const artwork = artworkByCode[guardian.code]
  return (
    <section className="donation-spirit-summary">
      <div className="donation-spirit-thumb">
        {artwork ? (
          <SpiritArtwork species={artwork} level={5} priority />
        ) : (
          <span className="donation-vip-art-blank" aria-label="這隻精靈的圖片尚未提供" />
        )}
      </div>
      <div className="donation-spirit-copy">
        <Badge tone="complete">
          <Check size={13} aria-hidden="true" /> LV5 滿級
        </Badge>
        <div className="donation-spirit-title-row">
          <h2>{guardian.name}</h2>
          {/* The picker appears only for a spirit tied to no category:
              every other spirit has exactly one legal value, and offering
              a choice the backend would reject is worse than showing none. */}
          {categoryChoices !== undefined ? (
            <label className="donation-category-select">
              <span className="sr-only">選擇公益類別</span>
              <select
                value={categoryChoices.find((item) => item.name === categoryName)?.id ?? ''}
                onChange={(event) => onCategoryChange?.(Number(event.target.value))}
              >
                {categoryChoices.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </label>
          ) : (
            <p className="donation-category-label">{categoryName}</p>
          )}
        </div>
      </div>
    </section>
  )
}

type Step = 'locked' | 'choose' | 'confirm' | 'complete' | 'record'

export function DonationFlowClient() {
  const router = useRouter()
  const params = useSearchParams()
  const guardianIdValue = Number(params.get('guardianId'))
  const guardianId =
    Number.isInteger(guardianIdValue) && guardianIdValue > 0 ? guardianIdValue : null
  const requestedStep = params.get('step') ?? 'choose'

  const [guardian, setGuardian] = useState<Guardian | null>(null)
  const [categories, setCategories] = useState<CharityCategoryRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const {
    byGuardian,
    donationAmount,
    ready: donationsReady,
    failed: donationsFailed,
    reload: reloadDonations,
  } = useOwnDonations()
  const donation = guardianId === null ? undefined : byGuardian.get(guardianId)

  // Which category the organisation list is drawn from. For an ordinary
  // spirit this is fixed by its species; for one tied to no category it is
  // the user's pick, and null until they make one.
  const [chosenCategoryId, setChosenCategoryId] = useState<number | null>(null)
  const [organizations, setOrganizations] = useState<CharityOrganization[] | null>(null)
  const [draftId, setDraftId] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Set when the platform picked instead of the user, so the action bar
  // can say so. Cleared the moment they touch a card themselves -- a
  // suggestion they have since overridden must stop claiming credit.
  const [suggested, setSuggested] = useState(false)
  const [suggesting, setSuggesting] = useState(false)

  useEffect(() => {
    if (guardianId === null) {
      router.replace('/box/')
      return
    }
    const init = async () => {
      try {
        const [guardianRes, categoryRes] = await Promise.all([
          apiFetch<GetGuardianResponse>('guardian'),
          apiFetch<GetCharityCategoriesResponse>('charity-category', { limit: 100 }),
        ])
        const found = guardianRes.data.find((row) => row.id === guardianId) ?? null
        setGuardian(found)
        setCategories(categoryRes.data)
        if (found?.category) setChosenCategoryId(found.category.id)
      } catch {
        setLoadError('無法載入資料，請稍後再試。')
      } finally {
        setReady(true)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardianId])

  // Reloaded whenever the category changes, which for a VIP spirit is
  // every time the picker moves.
  useEffect(() => {
    if (chosenCategoryId === null) {
      setOrganizations(null)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const res = await apiFetch<Paginate<CharityOrganization>>('charity-organization', {
          categoryId: chosenCategoryId,
          // Only organisations still accepting donations: an inactive one
          // is refused by POST /api/donation, so offering it would be a
          // dead end.
          isActive: 'true',
          limit: 100,
        })
        if (!cancelled) {
          setOrganizations(res.data)
          setDraftId(null)
          setSuggested(false)
        }
      } catch {
        if (!cancelled) setLoadError('無法載入公益組織列表。')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [chosenCategoryId])

  const activeCategories = useMemo(
    () => categories.filter((category) => category.isActive),
    [categories]
  )

  const allReady = ready && donationsReady
  const maxed = guardian !== null && guardian.nextLevelXp === null

  let step: Step
  if (donation !== undefined) step = requestedStep === 'complete' ? 'complete' : 'record'
  else if (!maxed) step = 'locked'
  else if (requestedStep === 'confirm' && draftId !== null) step = 'confirm'
  else step = 'choose'

  const flowHref = (nextStep: Step) => `/box/donation/?guardianId=${guardianId}&step=${nextStep}`

  const confirm = async () => {
    if (draftId === null || guardianId === null || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await apiPost('donation', {
        userGuardianId: guardianId,
        organizationId: draftId,
        // Sent only when the spirit has no category of its own. For any
        // other spirit the only legal value is its own, so omitting it
        // keeps the client from having to be right about it.
        ...(guardian?.category === null && chosenCategoryId !== null
          ? { categoryId: chosenCategoryId }
          : {}),
      })
      await reloadDonations()
      router.replace(flowHref('complete'))
    } catch (err) {
      setSubmitError(describeError(err, '送出失敗，請稍後再試。'))
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * Picks on the user's behalf, for someone with no preference of their
   * own.
   *
   * Asks the backend rather than choosing locally: the rule is
   * "least-supported so far", which needs the donation totals the client
   * does not have — and keeping the rule in one place is what lets the
   * public page explain it.
   *
   * This only fills the selection in. The confirm screen still names the
   * organisation and the user still presses the button, because the
   * donation record and the public page both carry that name.
   */
  const chooseForMe = async () => {
    if (chosenCategoryId === null || suggesting) return
    setSuggesting(true)
    setSubmitError(null)
    try {
      const picked = await apiFetch<GetSuggestedOrganizationResponse>(
        'charity-organization/suggest',
        { categoryId: chosenCategoryId }
      )
      setDraftId(picked.id)
      setSuggested(true)
    } catch {
      setSubmitError('暫時無法為你挑選，請直接從上面選一個。')
    } finally {
      setSuggesting(false)
    }
  }

  const pick = (id: number) => {
    setDraftId(id)
    // A suggestion the user has overridden must stop claiming credit.
    setSuggested(false)
  }

  if (!allReady)
    return (
      <main className="donation-flow">
        <p>載入公益支持資料…</p>
      </main>
    )

  if (loadError !== null || donationsFailed)
    return (
      <main className="donation-flow">
        <div className="donation-flow-inner">
          <ContentPanel className="donation-centered-state">
            <h1>暫時無法載入</h1>
            <p>{loadError ?? '無法取得你的公益支持紀錄，請稍後再試。'}</p>
            <ButtonLink href="/box/">返回精靈養成</ButtonLink>
          </ContentPanel>
        </div>
      </main>
    )

  if (guardian === null)
    return (
      <main className="donation-flow">
        <div className="donation-flow-inner">
          <ContentPanel className="donation-centered-state">
            <h1>找不到這隻精靈</h1>
            <p>可能是連結有誤，或這隻精靈不屬於你。</p>
            <ButtonLink href="/box/">返回精靈養成</ButtonLink>
          </ContentPanel>
        </div>
      </main>
    )

  const categoryName =
    guardian.category?.name ??
    activeCategories.find((item) => item.id === chosenCategoryId)?.name ??
    '尚未選擇類別'
  const draft = (organizations ?? []).find((item) => item.id === draftId)

  return (
    <main className="donation-flow">
      <div className="donation-flow-inner">
        {step === 'locked' ? (
          <ContentPanel className="donation-centered-state">
            <h1>尚未取得支持選擇機會</h1>
            <p>精靈達到 LV5 滿級後，才會取得一次公益支持對象的選擇機會。</p>
            <ButtonLink href="/box/">返回精靈養成</ButtonLink>
          </ContentPanel>
        ) : step === 'choose' ? (
          <>
            <ButtonLink href="/box/" variant="quiet" className="donation-back">
              <ChevronLeft size={17} aria-hidden="true" />
              返回精靈養成
            </ButtonLink>
            <header className="donation-flow-heading">
              <h1>選擇支持的公益組織</h1>
              <p>本次由平台捐出 NT${formatNumber(donationAmount)}，你不需要付款。</p>
            </header>
            <SpiritSummary
              guardian={guardian}
              categoryName={categoryName}
              categoryChoices={guardian.category === null ? activeCategories : undefined}
              onCategoryChange={setChosenCategoryId}
            />
            {chosenCategoryId === null ? (
              <ContentPanel className="donation-centered-state">
                <p>請先從上方選擇一個公益類別。</p>
              </ContentPanel>
            ) : organizations === null ? (
              <p>載入公益組織…</p>
            ) : organizations.length === 0 ? (
              <ContentPanel className="donation-centered-state">
                <h2>這個類別目前沒有合作組織</h2>
                <p>
                  {guardian.category === null
                    ? '請改選其他公益類別。'
                    : '平台正在洽談合作中，你的選擇機會會保留著，稍後再回來即可。'}
                </p>
                <ButtonLink href="/box/">返回精靈養成</ButtonLink>
              </ContentPanel>
            ) : (
              <>
                <div className="donation-org-grid" role="radiogroup" aria-label="公益組織">
                  {organizations.map((item) => {
                    const selected = draftId === item.id
                    const isExpanded = expanded === item.id
                    return (
                      <Card
                        key={item.id}
                        className={`donation-org-card${selected ? ' is-selected' : ''}`}
                        role="radio"
                        aria-checked={selected}
                        tabIndex={0}
                        onClick={() => pick(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === ' ' || event.key === 'Enter') {
                            event.preventDefault()
                            pick(item.id)
                          }
                        }}
                      >
                        <div className="donation-radio" aria-hidden="true">
                          {selected && <Check size={15} />}
                        </div>
                        <h2>{item.name}</h2>
                        <div
                          className={`donation-org-description${isExpanded ? ' is-expanded' : ''}`}
                        >
                          <p>{item.introduction}</p>
                        </div>
                        <button
                          type="button"
                          className="donation-expand-button"
                          aria-label={
                            isExpanded ? `收合${item.name}簡介` : `展開${item.name}完整簡介`
                          }
                          aria-expanded={isExpanded}
                          onClick={(event) => {
                            event.stopPropagation()
                            setExpanded(isExpanded ? null : item.id)
                          }}
                        >
                          <ChevronDown size={18} aria-hidden="true" />
                        </button>
                        {item.websiteUrl && (
                          <a
                            className="donation-org-link"
                            href={item.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            了解更多 <ExternalLink size={14} aria-hidden="true" />
                          </a>
                        )}
                      </Card>
                    )
                  })}
                </div>
                <div className="donation-action-bar">
                  <p aria-live="polite">
                    {draft === undefined
                      ? '請選擇一個公益組織，或讓平台幫你決定'
                      : suggested
                        ? `平台為你選了：${draft.name}（目前累積支持最少的單位）`
                        : `已選擇：${draft.name}`}
                  </p>
                  <div className="donation-action-bar-buttons">
                    {/* Offered even once something is selected: the user may
                        have picked at random just to get past the screen,
                        and this is the honest version of that. */}
                    <Button
                      variant="secondary"
                      loading={suggesting}
                      onClick={chooseForMe}
                    >
                      {suggesting ? '挑選中…' : '沒有特別想法，幫我決定'}
                    </Button>
                    <Button disabled={!draft} onClick={() => router.push(flowHref('confirm'))}>
                      下一步
                    </Button>
                  </div>
                </div>
                {/* The suggestion can fail, and its error belongs next to
                    the button that caused it rather than on the confirm
                    screen the user has not reached yet. */}
                {submitError && <p className="donation-final-warning">{submitError}</p>}
              </>
            )}
          </>
        ) : step === 'confirm' && draft ? (
          <>
            <header className="donation-flow-heading">
              <h1>確認支持的公益組織</h1>
            </header>
            <ContentPanel className="donation-confirm-card">
              <div className="donation-confirm-spirit">
                <div className="donation-confirm-spirit-art">
                  {artworkByCode[guardian.code] ? (
                    <SpiritArtwork species={artworkByCode[guardian.code]!} level={5} priority />
                  ) : (
                    <span className="donation-vip-art-blank" aria-label="圖片尚未提供" />
                  )}
                </div>
                <div>
                  <div className="donation-confirm-spirit-title">
                    <h2>{guardian.name}</h2>
                  </div>
                  <p>{categoryName}</p>
                </div>
              </div>
              <HeartHandshake size={32} aria-hidden="true" />
              <dl>
                <div>
                  <dt>支持的組織</dt>
                  <dd>{draft.name}</dd>
                </div>
                <div>
                  <dt>平台捐款金額</dt>
                  <dd>NT${formatNumber(donationAmount)}</dd>
                </div>
              </dl>
              <p>款項由平台支付，你不需要付款。</p>
              <p>平台會定期彙整撥款，完成後可在公開徵信頁查到這筆紀錄。</p>
              <p className="donation-final-warning">確認後將無法更換本次支持對象。</p>
              {submitError && <p className="donation-final-warning">{submitError}</p>}
              <div className="donation-confirm-actions">
                <Button
                  variant="secondary"
                  disabled={submitting}
                  onClick={() => router.push(flowHref('choose'))}
                >
                  返回修改
                </Button>
                <Button loading={submitting} onClick={confirm}>
                  確認支持這個組織
                </Button>
              </div>
            </ContentPanel>
          </>
        ) : step === 'complete' && donation ? (
          <ContentPanel className="donation-centered-state">
            <span className="donation-complete-icon">
              <Check size={30} aria-hidden="true" />
            </span>
            <h1>已收到你的支持選擇</h1>
            <p>
              你已選擇支持{donation.organization.name}，平台將捐出 NT$
              {formatNumber(donation.amount)}。
            </p>
            <Badge tone="growth">等待平台撥款</Badge>
            <ButtonLink href="/box/">返回精靈養成</ButtonLink>
          </ContentPanel>
        ) : donation ? (
          <>
            <ButtonLink href="/box/" variant="quiet" className="donation-back">
              <ChevronLeft size={17} aria-hidden="true" />
              返回精靈養成
            </ButtonLink>
            <header className="donation-flow-heading">
              <h1>公益支持紀錄</h1>
            </header>
            <ContentPanel className="donation-record-card">
              <div className="donation-confirm-spirit">
                <div className="donation-confirm-spirit-art">
                  {artworkByCode[guardian.code] ? (
                    <SpiritArtwork species={artworkByCode[guardian.code]!} level={5} priority />
                  ) : (
                    <span className="donation-vip-art-blank" aria-label="圖片尚未提供" />
                  )}
                </div>
                <div>
                  <div className="donation-confirm-spirit-title">
                    <h2>{guardian.name}</h2>
                  </div>
                  <p>{donation.category.name}</p>
                </div>
              </div>
              <dl>
                <div>
                  <dt>支持組織</dt>
                  <dd>
                    {donation.organization.websiteUrl ? (
                      <a
                        className="donation-record-link"
                        href={donation.organization.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {donation.organization.name}{' '}
                        <ExternalLink size={15} aria-hidden="true" />
                      </a>
                    ) : (
                      donation.organization.name
                    )}
                  </dd>
                </div>
                {/* The stored amount, never today's constant: the figure is
                    frozen at confirmation and a later change must not
                    rewrite what this record says was promised. */}
                <div>
                  <dt>平台捐款金額</dt>
                  <dd>NT${formatNumber(donation.amount)}</dd>
                </div>
                <div>
                  <dt>選擇時間</dt>
                  <dd>{formatTime(donation.confirmedAt)}</dd>
                </div>
                <div>
                  <dt>目前狀態</dt>
                  <dd>
                    {donation.batch === null
                      ? '等待平台撥款'
                      : donation.batch.published
                        ? '平台已完成撥款'
                        : '已撥款，徵信資料準備中'}
                  </dd>
                </div>
                {donation.batch !== null && (
                  <div>
                    <dt>撥款日期</dt>
                    <dd>{formatDay(donation.batch.transferredAt)}</dd>
                  </div>
                )}
                <div>
                  <dt>公益執行紀錄</dt>
                  <dd>
                    {/* Linked only once the batch is published: an
                        unpublished batch is absent from /impact, so the
                        link would land on a page that does not mention it. */}
                    {donation.batch?.published ? (
                      <a className="donation-record-link" href="/impact/">
                        查看公開徵信紀錄 <ExternalLink size={15} aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="donation-record-pending">
                        將於平台完成撥款並上傳證明後提供
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
              <ButtonLink href="/box/">返回精靈養成</ButtonLink>
            </ContentPanel>
          </>
        ) : (
          <ContentPanel className="donation-centered-state">
            <h1>找不到這筆紀錄</h1>
            <ButtonLink href="/box/">返回精靈養成</ButtonLink>
          </ContentPanel>
        )}
      </div>
    </main>
  )
}
