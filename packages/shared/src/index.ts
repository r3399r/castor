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
  type: 'GROUP' | 'SINGLE' | 'MULTIPLE' | 'TRUE_FALSE' | 'FILL';
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

export type GetCategoryResponse = Category[]

export type GetCategorySubjectResponse = {
  subjects: Omit<Subject, 'category' | 'filterOptions'>[],
  filterDimensions: (FilterDimension & {
    options: {
      id: number;
      parentId: number | null;
      name: string;
      subjectIds: number[];
    }[]
  })[]
}

export type PostCategoryRequest = {
  name: string;
};

export type PostCategoryResponse = Category;

export type GetSubjectResponse = Subject[];

export type PostSubjectResponse = Subject;

export type PostSubjectRequest = {
  name: string;
};

export type GetSubjectExamResponse = Exam[]

export type GetSubjectConceptGroupResponse = ConceptGroup[]

export type GetSubjectTagResponse = Tag[]

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
};

export type GetGuardianResponse = { data: Guardian[]; totalPoints: number };

export type PostGuardianInvestRequest = { points: number };

export type PostGuardianInvestResponse = { guardian: Guardian; totalPoints: number };

export type PostPreviewRequest = { text: string; imageUrl: string }

export type PostPreviewResponse = {
  content: string
  solution: string
  difficulty: number
  conceptIds: number[]
}

export type PostQuestionRequest = {
  subjectId: number;
  type: 'GROUP' | 'SINGLE' | 'MULTIPLE' | 'TRUE_FALSE' | 'FILL';
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

export type GetQuestionResponse = Paginate<Question>;

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
export type SubscriptionStatus = {
  active: boolean;
  plan: string | null;
  expiresAt: string | null;
  autoRenew?: boolean | null;
  pendingPlan?: string | null;
  pendingPlanEffectiveAt?: string | null;
  pendingPlanAmount?: number | null;
};

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
