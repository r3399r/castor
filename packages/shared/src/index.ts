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

export type PostReplyRequest = { questionId: number; repliedAnswer: string }[]

export type PostReplyResponse = {
  questionId: number
  repliedAnswer: string
  correctAnswer: string
  score: number
  fbPostId: string | null
}[]

export type GetReplyParams = PaginationParams;

export type GetReplyResponse = Paginate<Reply>

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
};

export type StatsSubject = {
  id: number;
  name: string;
  category: Category[];
  conceptGroup: StatsConceptGroup[];
};

export type GetUserStatsResponse = StatsSubject[];

export type PostUserSyncResponse = User;

export type GetInfoResponse = {
  categoryCount: number;
  subjectCount: number;
  examCount: number;
  questionCount: number;
  userCount: number;
}
