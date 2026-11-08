export type Category = {
  id: number;
  name: string;
  createdAt: string | null;
};

export type Subject = {
  id: number;
  category: Category[];
  filterOptions: FilterOption[];
  exams: Exam[];
  conceptGroups: ConceptGroup[];
  tags: Tag[];
  name: string;
  sortOrder: number;
  createdAt: string | null;
};

export type Exam = {
  id: number;
  subject: Subject[];
  name: string;
  createdAt: string | null;
};

export type Concept = {
  id: number;
  name: string;
  conceptGroupId: number;
  conceptGroup: ConceptGroup;
  numberOfQuestions: number;
  createdAt: string | null;
};

export type ConceptGroup = {
  id: number;
  name: string;
  subjectId: number;
  subject: Subject;
  concepts: Concept[];
  createdAt: string | null;
};

export type Tag = {
  id: number;
  name: string;
  subjectId: number;
  subject: Subject;
  createdAt: string | null;
};

export type Reply = {
  id: number;
  questionId: number;
  question: Question;
  subjectId: number;
  subject: Subject;
  userId: number;
  parentId: number | null;
  parent: Question | null;
  score: number;
  repliedAnswer: string | null;
  repliedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type Question = {
  id: number;
  uuid: string;
  subjectId: number;
  subject: Subject;
  parentId: number | null;
  fbPostId: string | null;
  isGroup: boolean;
  // Admin review gate: false until an admin enables the question. Users
  // only ever receive enabled questions from /question/adaptive, so this
  // is effectively always true on anything the practice UI sees -- it
  // matters on the admin list, which shows both.
  enabled: boolean;
  type: 'GROUP' | 'SINGLE' | 'MULTIPLE' | 'TRUE_FALSE' | 'FILL' | 'CLOZE';
  sortOrder: number | null;
  content: string | null;
  options: string | null;
  answer: string | null;
  difficulty: number;
  attempCount: number;
  scoringTotal: number;
  adjustedDifficulty: number;
  children: Question[];
  exam: Exam[];
  tag: Tag[];
  concept: Concept[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type User = {
  id: number;
  firebaseUid: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  totalPoints: number;
  lifetimePoints: number;
  lastLoginAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PendingReply = {
  id: number;
  questionId: number;
  question: Question;
  userId: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type UserConceptStat = {
  id: number;
  userId: number;
  conceptId: number;
  concept: Concept;
  mastery: number | null;
  attemptCount: number;
  scoringTotal: number;
  lastAttemptAt: string | null;
  weightedSum: number;
  decaySum: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PaginationParams = {
  limit?: string;
  offset?: string;
};


export type Paginate<T> = {
  data: T[];
  paginate: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export type FilterDimension = {
  id: number;
  categoryId: number;
  name: string;
  sortOrder: number;
};

export type FilterOption = {
  id: number;
  dimension: FilterDimension;
  parentId: number | null;
  name: string;
};

export type PostCategoryRequest = {
  name: string;
};

export type PostCategoryResponse = Category;

export type PostSubjectResponse = Subject;

export type PostSubjectRequest = {
  name: string;
};

export type PostExamResponse = Exam;

export type PostExamRequest = {
  name: string;
};

export type PostConceptResponse = Concept;

export type PostConceptRequest = {
  conceptGroupId: number;
  name: string;
};

export type PostConceptGroupResponse = ConceptGroup;

export type PostConceptGroupRequest = {
  subjectId: number;
  name: string;
};

export type PostTagResponse = Tag;

export type PostTagRequest = {
  subjectId: number;
  name: string;
};

export type PostReplyRequest = { questionId: number; repliedAnswer: string; durationMs?: number }[]

export type PostReplyResponse = {
  questionId: number
  repliedAnswer: string
  correctAnswer: string
  score: number
  awardedPoints: number
  fbPostId: string | null
}[]

export type GetReplyParams = PaginationParams & {
  categoryId?: string;
  subjectId?: string;
  examIds?: string;
  tagIds?: string;
};

export type ReplyGroup = {
  repliedAt: string;
  parentQuestion: Question | null;
  subject: Subject;
  subjectId: number;
  children: Reply[];
};

export type GetReplyResponse = Paginate<ReplyGroup>

// One wrong sub-question. `id` is the user_wrong_question row, which is
// what PUT /wrong-question/:id/note and DELETE act on -- the note is per
// sub-question, since that is the granularity a user writes it at.
export type WrongQuestionEntry = {
  id: number;
  question: Question;
  score: number;
  wrongCount: number;
  lastWrongAt: string;
  note: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

// One top-level question and every sub-question of it the user got wrong.
// The list is paginated by group, not by row: a 題組's children are
// separate rows, and a row-based page repeated the passage once per wrong
// child and could split siblings across pages.
//
// `id` is the group key -- the parent's question id, or the question's own
// id when standalone, in which case `parentQuestion` is null and
// `entries` holds exactly one element.
export type WrongQuestion = {
  id: number;
  parentQuestion: Question | null;
  subject: { id: number; name: string };
  subjectId: number;
  /** The most recent lastWrongAt in the group -- what the list sorts on. */
  lastWrongAt: string;
  entries: WrongQuestionEntry[];
};

export type GetWrongQuestionParams = PaginationParams & {
  categoryId?: string;
  subjectId?: string;
  examIds?: string;
  tagIds?: string;
};

export type GetWrongQuestionResponse = Paginate<WrongQuestion>;

export type PutWrongQuestionNoteRequest = { note: string | null };

export type PutWrongQuestionNoteResponse = { id: number; note: string | null; updatedAt: string | null };

export type PointTransaction = {
  id: number;
  type: string;
  amount: number;
  replyId: number | null;
  balanceAfter: number;
  createdAt: string | null;
};

export type GetWalletParams = PaginationParams;

export type GetWalletResponse = Paginate<PointTransaction>;

export type GuardianSpecies = {
  id: number;
  code: string;
  name: string;
  theme: string;
  cost: number;
  owned: boolean;
};

export type GetStoreSpeciesResponse = { data: GuardianSpecies[]; totalPoints: number };

export type PostStoreRedeemRequest = { speciesId: number };

export type PostStoreRedeemResponse = {
  guardian: { id: number; speciesId: number; level: number; xp: number };
  totalPoints: number;
};

export type Guardian = {
  id: number;
  guardianId: number;
  code: string;
  name: string;
  theme: string;
  level: number;
  xp: number;
  nextLevelXp: number | null;
  /**
   * The public-interest category this species supports, or null for one
   * tied to none -- which is what VIP is, and what lets its owner direct
   * the LV5 donation at any category.
   *
   * Not interchangeable with `theme`: that is the egg's own display label.
   * It reads the same as the category's name today and will diverge once
   * one category holds several eggs.
   */
  category: CharityCategoryName | null;
};

/** Just enough of a category to render a label beside a spirit. */
export type CharityCategoryName = { id: number; name: string };

export type GetGuardianResponse = { data: Guardian[]; totalPoints: number };

export type PostGuardianInvestRequest = { points: number };

export type PostGuardianInvestResponse = { guardian: Guardian; totalPoints: number };

export type PostQuestionRequest = {
  subjectId: number;
  type: 'GROUP' | 'SINGLE' | 'MULTIPLE' | 'TRUE_FALSE' | 'FILL' | 'CLOZE';
  content?: string;
  options?: string;
  answer?: string;
  solution?: string;
  difficulty: number;
  examId: number;
  tagIds?: number[];
  conceptIds: number[];
  childQuestions?: {
    type: 'SINGLE' | 'MULTIPLE' | 'TRUE_FALSE' | 'FILL';
    sortOrder: number;
    content: string;
    options: string;
    answer: string;
    difficulty: number;
  }[];
};

export type PostQuestionResponse = Question[];

export type GetQuestionParams = PaginationParams & {
  subjectId: string;
  examIds?: string;
  tagIds?: string;
  conceptIds?: string;
};

export type GetQuestionAdaptiveParams = {
  subjectId: string;
  examIds?: string;
  tagIds?: string;
  conceptIds?: string;
  count?: string;
};

export type GetQuestionAdaptiveResponse = Question[];

export type GetQuestionIdResponse = Question;

export type GetUserResponse = User | null;

export type StatsConceptGroup = {
  id: number;
  name: string;
  mastery: number;
  numberOfQuestions: number;
};

export type StatsSubject = {
  id: number;
  name: string;
  category: Category[];
  conceptGroup: StatsConceptGroup[];
};

export type GetUserStatsResponse = StatsSubject[];

// Mirrors GET /subscription/me, so a client can handle the two
// interchangeably. expiresAt is an ISO string over the wire, like every
// other date in this file.
// `active` means auto-renew is on. A cancelled subscription reports
// false here while its paid period is still running -- the remaining
// entitlement lives in GET /subscription/history, which is where the
// client derives "cancelled but still usable" from.
//
// There are no pending-plan fields: ECPay cannot amend a recurring
// agreement, so a plan change is a new agreement charged immediately,
// never a change scheduled for the end of the period.
export type SubscriptionStatus = {
  active: boolean;
  plan: string | null;
  expiresAt: string | null;
  autoRenew?: boolean | null;
};

// GET /api/info/plans. Public and unauthenticated, because the pricing
// page is read before signing in. `amount` is the authoritative price in
// NTD -- the webapp must render this rather than a constant of its own,
// or it can show one number and charge another.
export type SubscriptionPlanInfo = {
  code: string;
  amount: number;
  periodType: 'D' | 'M' | 'Y';
  frequency: number;
};

export type GetInfoPlansResponse = SubscriptionPlanInfo[];

export type PostPaymentCheckoutRequest = { plan: string };

// POST /api/payment/checkout. Not a payment: it is a signed form the
// browser has to POST to `action` so the cardholder lands on the
// provider's own page. Nothing is charged until the provider's webhook
// says so, and the user may simply close the tab.
export type PostPaymentCheckoutResponse = {
  action: string;
  params: Record<string, string>;
};

// POST /api/subscription/cancel. Same shape as GET /api/subscription/me,
// and it reports active:false as soon as auto-renew is off -- the period
// already paid for keeps granting access and shows up in /history.
export type PostSubscriptionCancelResponse = SubscriptionStatus;

export type SubscriptionHistoryItem = {
  id: number;
  plan: string;
  status: 'active' | 'cancelled' | 'expired' | 'past_due' | string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
};

export type GetSubscriptionHistoryResponse = SubscriptionHistoryItem[];

// Sync returns the subscription alongside the user so sign-in needs one
// authenticated request rather than two.
export type PostUserSyncResponse = User & { subscription: SubscriptionStatus };

// Subscriber-only. retention is the modelled probability the concept is
// still recallable (0-1); level buckets it for display so the UI does not
// re-derive the thresholds.
export type ForgettingRiskItem = {
  conceptId: number;
  concept: string;
  subjectId: number;
  subject: string;
  /**
   * Every category the subject belongs to, name-sorted. Subject names are
   * not unique -- two exams can both have a 數學 -- so the category is
   * what tells them apart. An array because subject_category is
   * many-to-many, and empty for a subject filed under no category.
   */
  categories: string[];
  mastery: number;
  attemptCount: number;
  lastAttemptAt: string | null;
  daysSinceReview: number;
  retention: number;
  level: 'high' | 'medium' | 'low';
};

// Subscriber-only. platformMedianMs is null until a subject has enough
// samples platform-wide; deltaMs is null whenever the comparison would be
// unsound -- either because of that, or because the user has too few timed
// answers in the subject. Treat null as "no comparison yet", never as 0.
export type SpeedComparison = {
  subjectId: number;
  subject: string;
  /** See ForgettingRiskItem.categories. */
  categories: string[];
  userMedianMs: number;
  platformMedianMs: number | null;
  deltaMs: number | null;
  accuracy: number;
  sampleCount: number;
};

// One request for the whole subscriber-only section of the analysis
// page -- both halves share a gate and a lifecycle, so they are fetched
// together.
export type MasteryProgress = {
  overall: DailyMastery[];
  subjects: SubjectHistory[];
};

export type GetAnalysisOverviewResponse = {
  progress: MasteryProgress;
  forgettingRisk: ForgettingRiskItem[];
  speed: SpeedComparison[];
};

// The admin listing carries each user's entitlement so the page can
// show and toggle it without a request per row.
export type AdminUser = User & { subscription: SubscriptionStatus };

export type PutUserSubscriptionRequest = {
  active: boolean;
  plan?: string;
  days?: number;
};

export type PutUserSubscriptionResponse = SubscriptionStatus;

export type GetUserMeResponse = User;

export type PutUserMeRequest = { name: string };

export type PutUserMeResponse = User;

// GET /api/info is the database-free health check; these catalog counts
// are GET /api/info/stats, which the landing page's counter bar reads.
// questionCount is servable top-level questions only -- the same
// definition GET /api/question/count uses.
export type GetInfoStatsResponse = {
  categoryCount: number;
  subjectCount: number;
  examCount: number;
  questionCount: number;
  userCount: number;
};

// GET /api/info/popular -- the landing page's 熱門考試 / 科目 section.
//
// attemptCount is how many times the questions were practised, not how
// many answers they drew: a 題組 answered once counts once, however many
// sub-questions it holds. Spelled correctly here even though the column it
// is aggregated from (question.attemp_count) and the Question type both
// carry the original typo -- this is a new aggregate rather than that
// column passed through, and nothing is gained by propagating the
// misspelling into a second public shape.
//
// questionCount counts servable top-level questions, so a 題組 counts once
// however many sub-questions it holds -- the same definition
// GetInfoStatsResponse.questionCount uses.
export type PopularExam = {
  id: number;
  name: string;
  attemptCount: number;
  questionCount: number;
};

export type PopularSubject = {
  id: number;
  name: string;
  attemptCount: number;
  questionCount: number;
  // Ranked like the subjects themselves, and empty when the subject's
  // questions are not filed under any exam -- which is a real state, not
  // an error, so the section has to render a subject that has none.
  exams: PopularExam[];
};

export type GetInfoPopularResponse = PopularSubject[];

export type UserStatHistory = {
  id: number;
  userId: number;
  subjectId: number;
  date: string;
  weightedMastery: number | null;
  dailyAttempts: number;
  dailyCorrect: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type DailyMastery = {
  date: string;
  weightedMastery: number;
};

export type SubjectHistory = {
  subjectId: number;
  subjectName: string;
  dailyStats: DailyMastery[];
};

// The mastery-over-time series moved to GetAnalysisOverviewResponse when
// progress charts became subscriber-only. DailyMastery and SubjectHistory
// above are still the shapes those series take.
export type GetUserHistoryResponse = {
  totalAttempts: number;
  overallAccuracy: number;
  streakDays: number;
  activityMap: { date: string; count: number }[];
};

// ---------------------------------------------------------------------
// 公益捐款 (donation)
//
// Added alongside the routes that return them, not all at once up front:
// the batch and donation-record shapes land with /api/donation and
// /api/info/donation. See DONATION.md for the data model.
// ---------------------------------------------------------------------

/**
 * A public-interest category a donation can be directed at.
 *
 * Its own table, not the guardian row it used to be folded into: a
 * category can be added without shipping a new egg, several eggs can
 * share one, and a species tied to no category at all (VIP) is simply one
 * whose categoryId is null.
 */
export type CharityCategory = {
  id: number;
  code: string;
  name: string;
};

export type CharityOrganization = {
  id: number;
  name: string;
  /** The 統編. Null for associations that do not publish one. */
  taxId: string | null;
  introduction: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  sortOrder: number;
  /** false takes it out of the picker; existing donations keep pointing at it. */
  isActive: boolean;
  categories: CharityCategory[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type GetCharityOrganizationResponse = Paginate<CharityOrganization>;

export type GetCharityOrganizationIdResponse = CharityOrganization;

export type PostCharityOrganizationRequest = {
  name: string;
  taxId?: string | null;
  introduction: string;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  /** At least one; an organization under no category is offered to nobody. */
  categoryIds: number[];
};

export type PutCharityOrganizationCategoryRequest = { categoryIds: number[] };

export type PutCharityOrganizationCategoryResponse = { categories: CharityCategory[] };

/**
 * The payout a donation was settled in, or null while it is still
 * awaiting one -- `donation.batchId` being NULL is the whole state
 * machine, there is no status column.
 */
export type DonationBatchRef = {
  id: number;
  transferredAt: string;
  /** False while the public page does not show this batch yet. */
  published: boolean;
};

export type Donation = {
  id: number;
  /** Which maxed spirit paid for it -- how the picker knows one is spent. */
  userGuardianId: number;
  /** Frozen at confirmation. Never render DONATION_AMOUNT in its place. */
  amount: number;
  confirmedAt: string;
  category: CharityCategory;
  organization: Pick<
    CharityOrganization,
    'id' | 'name' | 'introduction' | 'websiteUrl' | 'logoUrl'
  >;
  batch: DonationBatchRef | null;
};

export type GetDonationResponse = Paginate<Donation> & {
  /** What confirming one more spirit would be worth, for the picker. */
  donationAmount: number;
};

export type PostDonationRequest = {
  userGuardianId: number;
  organizationId: number;
  /**
   * Required only for a spirit whose species is tied to no category (VIP);
   * for any other spirit the only legal value is its own category, so it
   * can be left out.
   */
  categoryId?: number;
};

export type PostDonationResponse = Donation;

/** One document proving a batch was paid, under /api/info/donation. */
export type DonationEvidence = {
  id: number;
  /** TRANSFER_RECEIPT, ORG_RECEIPT, THANK_YOU_LETTER -- open-ended. */
  kind: string;
  url: string;
  caption: string | null;
};

/**
 * One published payout on the public record, carrying the arithmetic
 * rather than only the total: donationCount x donationUnitAmount +
 * platformTopUp equals transferredAmount, which is the figure on the
 * receipt linked from `evidence`.
 */
export type DonationRecordBatch = {
  id: number;
  transferredAt: string;
  /** Bank transaction number, or the last digits of the account. */
  reference: string | null;
  organization: Pick<
    CharityOrganization,
    'id' | 'name' | 'introduction' | 'websiteUrl' | 'logoUrl'
  >;
  donationCount: number;
  donationSubtotal: number;
  /**
   * The single frozen amount every member of this batch shares, or null
   * when they differ. null means the "57 x NT$1,000" line cannot be
   * printed and only the subtotal is safe to show.
   */
  donationUnitAmount: number | null;
  /** transferredAmount - donationSubtotal. Signed: negative means underpaid. */
  platformTopUp: number;
  transferredAmount: number;
  evidence: DonationEvidence[];
};

export type DonationRecordSummary = {
  /** Spirits grown to max level; every one of them is owed. */
  maxedSpiritCount: number;
  confirmedCount: number;
  /** Summed from the frozen per-donation amounts. */
  confirmedAmount: number;
  /** Maxed spirits whose owner has not picked an organisation yet. */
  pendingCount: number;
  /** pendingCount x donationAmount -- the only figure priced at today's rate. */
  pendingAmount: number;
  /** confirmedAmount + pendingAmount. */
  promisedAmount: number;
  /** Over published batches only, so the listed batches add up to it. */
  transferredAmount: number;
  publishedBatchCount: number;
  donationAmount: number;
};

export type GetInfoDonationResponse = Paginate<DonationRecordBatch> & {
  summary: DonationRecordSummary;
};

// ---------------------------------------------------------------------------
// Admin payout workflow (/api/donation-batch). Admin-only, unlike the
// DonationRecord* types above, which are the public view of the same rows:
// these name users and carry the internal note, those never do.
// ---------------------------------------------------------------------------

/** One donation still awaiting payout, under GET /api/donation-batch/unpaid. */
export type UnpaidDonation = {
  id: number;
  userId: number;
  amount: number;
  confirmedAt: string;
  category: Pick<CharityCategory, 'id' | 'name'>;
};

export type GetUnpaidDonationsResponse = Paginate<UnpaidDonation> & {
  /**
   * The whole outstanding set, not the page. A batch can only be built
   * from what is on screen, so this is how a second page makes itself
   * known.
   */
  summary: { unpaidCount: number; unpaidAmount: number };
};

/** One proof document as the admin sees it -- with its S3 key. */
export type DonationBatchEvidence = DonationEvidence & {
  /**
   * Present here and absent from the public type: the key is what
   * deleteFromS3 needs, and it is never useful to a reader of the public
   * page.
   */
  s3Key: string;
  sortOrder: number;
  createdAt: string | null;
};

/**
 * One payout as the admin sees it, published or not.
 *
 * `donationSubtotal` and `platformTopUp` are derived from the member rows
 * on every read rather than stored, because a batch's membership is frozen
 * once created -- there is nothing for a stored copy to stay in sync with
 * except drift.
 */
export type DonationBatch = {
  id: number;
  organization: Pick<CharityOrganization, 'id' | 'name'> | null;
  transferredAmount: number;
  transferredAt: string;
  reference: string | null;
  /** The internal memo. Deliberately not part of the public record. */
  note: string | null;
  published: boolean;
  donationCount: number;
  donationSubtotal: number;
  /**
   * Signed, not clamped: a negative value is exactly what
   * PUT /:id/publish refuses, so the admin screen has to be able to show
   * the reason.
   */
  platformTopUp: number;
  evidence: DonationBatchEvidence[];
  createdAt: string | null;
  updatedAt: string | null;
};

/** GET /api/donation-batch/:id adds the frozen membership list. */
export type DonationBatchDetail = DonationBatch & {
  donations: UnpaidDonation[];
};

export type GetDonationBatchesResponse = Paginate<DonationBatch>;

export type PostDonationBatchRequest = {
  organizationId: number;
  transferredAmount: number;
  /** ISO 8601. Must not be in the future. */
  transferredAt: string;
  reference?: string | null;
  note?: string | null;
  /**
   * Explicit rather than "everything unpaid": the admin pays what they
   * saw, and a donation confirmed since the list loaded must not be swept
   * into a transfer that did not cover it. Membership is frozen after
   * this, so correcting it means DELETE and rebuild.
   */
  donationIds: number[];
};

export type PutDonationBatchRequest = Omit<
  PostDonationBatchRequest,
  'organizationId' | 'donationIds'
>;

export type PostDonationBatchEvidenceRequest = {
  /** UPPER_SNAKE_CASE. TRANSFER_RECEIPT, ORG_RECEIPT, THANK_YOU_LETTER. */
  kind: string;
  /** application/pdf included: a PDF cannot be an <img> source. */
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  /** Base64, with or without a `data:` prefix. */
  data: string;
  caption?: string | null;
  sortOrder?: number;
};

/**
 * One category as GET /api/charity-category lists it.
 *
 * Wider than `CharityCategory`, which is the shape embedded in an
 * organisation or a donation -- a picker also needs to know which
 * categories are still accepting organisations, and in what order to show
 * them.
 */
export type CharityCategoryRow = CharityCategory & {
  sortOrder: number;
  /**
   * Inactive categories stay listed: past donations point at them and the
   * public record keeps naming them. They drop out of the picker only.
   */
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type GetCharityCategoriesResponse = Paginate<CharityCategoryRow>;
