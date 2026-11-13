/**
 * The webapp's view of the API contract, generated from the server.
 *
 * Every response type below is an alias into `openapi.d.ts`, which
 * `npm run api:types` generates from `backend_new/openapi.json` --
 * itself generated from the zod schemas the handlers are checked
 * against. So a shape here cannot disagree with what the server sends
 * without the server having been changed first.
 *
 * This replaced `export * from '@castor/shared'`. Those types were
 * hand-written beside the API rather than derived from it, and the
 * migration that produced this document found that most of them were
 * wrong -- see "The OpenAPI document" in AGENTS.md for the list. The
 * webapp no longer depends on that package at all: the growth-bonus
 * arithmetic it used to import lives in `lib/invest.ts` and takes the
 * rate from GET /api/info/growth.
 *
 * Aliases rather than deep paths at the call sites, for two reasons:
 * the generated names (`operations['getApiReply']['responses'][200]
 * ['content']['application/json']`) are unreadable in an error
 * message, and one alias per endpoint is the only place to change when
 * an operationId does.
 */
import type { components, operations } from './openapi'

/**
 * The JSON body of a 200 or a 201.
 *
 * `never` when the operation has no such response, which fails loudly
 * at the alias rather than quietly at the call site.
 */
type Ok<K extends keyof operations> = operations[K]['responses'] extends {
  200: { content: { 'application/json': infer T } }
}
  ? T
  : never

type Created<K extends keyof operations> = operations[K]['responses'] extends {
  201: { content: { 'application/json': infer T } }
}
  ? T
  : never

/**
 * A paginated page of anything.
 *
 * Still hand-written, and the only type here that is: OpenAPI has no
 * generics, so the document describes `{ data: Category[], paginate }`
 * and `{ data: Subject[], paginate }` as two unrelated shapes. The
 * `paginate` half comes from the document; `T` is the caller's.
 */
export type Paginate<T> = { data: T[]; paginate: components['schemas']['Pagination'] }

// ---------------------------------------------------------------------------
// Entities -- shapes more than one endpoint sends, named in the document
// ---------------------------------------------------------------------------

export type Category = components['schemas']['Category']
export type CharityCategoryRow = components['schemas']['CharityCategoryRow']
export type CharityOrganization = components['schemas']['CharityOrganization']
export type DailyMastery = components['schemas']['DailyMastery']
export type DayPassPurchase = components['schemas']['DayPassPurchase']
export type Donation = components['schemas']['Donation']
export type DonationBatch = components['schemas']['DonationBatch']
export type DonationEvidence = components['schemas']['DonationEvidence']
export type ForgettingRiskItem = components['schemas']['ForgettingRiskItem']
export type Guardian = components['schemas']['Guardian']
export type PointTransaction = components['schemas']['PointTransaction']
export type ReplyGroup = components['schemas']['ReplyGroup']
export type SpeedComparison = components['schemas']['SpeedComparison']
export type SubscriptionStatus = components['schemas']['SubscriptionStatus']
export type WrongQuestionEntry = components['schemas']['WrongQuestionEntry']

/** One top-level question and the sub-questions of it that went wrong. */
export type WrongQuestion = components['schemas']['WrongQuestionGroup']

/**
 * A question as every response that embeds one sends it.
 *
 * Named `QuestionDetail` in the document, because it is not the whole
 * `question` row: no `enabled`, no attempt counters, no timestamps, and
 * the exam, tag and concept links reduced to what a reader shows. The
 * admin list and the admin single-read send different shapes again
 * (`AdminQuestionRow`, `QuestionRow`), and the screens that use those
 * declare them locally.
 */
export type Question = components['schemas']['QuestionDetail']

// ---------------------------------------------------------------------------
// Responses, one alias per endpoint
// ---------------------------------------------------------------------------

export type GetAnalysisOverviewResponse = Ok<'getApiAnalysisOverview'>
export type MasteryProgress = GetAnalysisOverviewResponse['progress']

export type GetCharityCategoriesResponse = Ok<'getApiCharityCategory'>
export type GetSuggestedOrganizationResponse = Ok<'getApiCharityOrganizationSuggest'>

export type GetDonationResponse = Ok<'getApiDonation'>
export type PostDonationResponse = Created<'postApiDonation'>

export type GetDonationBatchesResponse = Ok<'getApiDonationBatch'>
export type GetUnpaidDonationsResponse = Ok<'getApiDonationBatchUnpaid'>
/** The batch read adds its frozen membership list. */
export type DonationBatchDetail = Ok<'getApiDonationBatchById'>

export type GetGuardianResponse = Ok<'getApiGuardian'>
export type PostGuardianInvestResponse = Ok<'postApiGuardianByIdInvest'>

export type GetInfoDonationResponse = Ok<'getApiInfoDonation'>
export type GetInfoGrowthResponse = Ok<'getApiInfoGrowth'>
export type GetInfoPlansResponse = Ok<'getApiInfoPlans'>
export type GetInfoPopularResponse = Ok<'getApiInfoPopular'>
export type GetInfoStatsResponse = Ok<'getApiInfoStats'>

export type GetPaymentPurchasesResponse = Ok<'getApiPaymentPurchases'>
export type PostPaymentCheckoutResponse = Ok<'postApiPaymentCheckout'>

export type GetQuestionAdaptiveResponse = Ok<'getApiQuestionAdaptive'>

export type GetReplyResponse = Ok<'getApiReply'>
export type PostReplyResponse = Ok<'postApiReply'>

export type GetSubscriptionHistoryResponse = Ok<'getApiSubscriptionHistory'>

export type GetUserHistoryResponse = Ok<'getApiUserHistory'>
export type GetUserMeResponse = Ok<'getApiUserMe'>
export type PutUserMeResponse = Ok<'putApiUserMe'>
export type GetUserStatsResponse = Ok<'getApiUserStats'>
/** One subject's mastery breakdown, as GET /api/user/stats lists it. */
export type StatsSubject = GetUserStatsResponse[number]
export type PostUserSyncResponse = Ok<'postApiUserSync'>

export type GetWalletResponse = Ok<'getApiWallet'>

export type GetWrongQuestionResponse = Ok<'getApiWrongQuestion'>
export type PutWrongQuestionNoteResponse = Ok<'putApiWrongQuestionByIdNote'>

// ---------------------------------------------------------------------------
// Request bodies -- still hand-written
// ---------------------------------------------------------------------------

/**
 * The document describes responses only.
 *
 * Query parameters and request bodies are validated by
 * `@hono/zod-validator`, which the generator cannot read, so covering
 * them means moving every validator call site in the backend onto
 * hono-openapi's own `validator` -- which also changes the 400 body an
 * invalid request gets. Until then these two are copies, and they are
 * the only shapes in this file nothing checks.
 */
export type PostReplyRequest = { questionId: number; repliedAnswer: string; durationMs?: number }[]

export type PutUserMeRequest = { name: string }
