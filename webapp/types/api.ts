export type Category = {
  id: number
  name: string
}

export type Subject = {
  id: number
  name: string
}

export type Exam = {
  id: number
  name: string
}

export type Concept = {
  id: number
  name: string
}

export type ConceptGroup = {
  id: number
  name: string
  concepts: Concept[]
}

export type Tag = {
  id: number
  name: string
}

export type Question = {
  id: number
  type: 'SINGLE' | 'MULTIPLE' | 'TRUE_FALSE' | 'FILL' | 'GROUP'
  content: string | null
  options: string | null
  answer: string | null
  adjustedDifficulty: number
  fbPostId: string | null
  subject: Pick<Subject, 'id' | 'name'>
  exam: Pick<Exam, 'id' | 'name'>[]
  concept: Pick<Concept, 'id' | 'name'>[]
  tag: Pick<Tag, 'id' | 'name'>[]
  children: Question[]
}

export type Paginate = {
  totalPages: number
  total: number
  limit: number
  offset: number
}

export type GetQuestionResponse = {
  data: Question[]
  paginate: Paginate
}

export type GetQuestionAdaptiveResponse = Question

export type GetCategoryResponse = Category[]

export type GetCategorySubjectResponse = Subject[]

export type GetSubjectExamResponse = Exam[]

export type GetSubjectConceptGroupResponse = ConceptGroup[]

export type GetSubjectTagResponse = Tag[]

export type ReplyItem = {
  id: number
  questionId: number
  question: Question
  subjectId: number
  subject: Pick<Subject, 'id' | 'name'>
  parentId: number | null
  parent: Question | null
  score: number
  repliedAnswer: string | null
  createdAt: string | null
}

export type PostReplyRequest = { questionId: number; repliedAnswer: string }[]

export type PostReplyResponse = {
  questionId: number
  repliedAnswer: string
  correctAnswer: string
  score: number
  fbPostId: string | null
}[]

export type GetReplyResponse = {
  data: ReplyItem[]
  paginate: { total: number; page: number; limit: number; totalPages: number }
}

export type PostPreviewRequest = { text: string; imageUrl: string }

export type PostPreviewResponse = {
  content: string
  solution: string
  difficulty: number
  conceptIds: number[]
}

export type PostQuestionRequest = {
  subjectId?: number
  type: 'GROUP' | 'SINGLE' | 'MULTIPLE' | 'TRUE_FALSE' | 'FILL'
  imageUrl?: string
  content?: string
  options?: string
  answer?: string
  solution?: string
  difficulty?: number
  examId?: number
  tagIds?: number[]
  conceptIds?: number[]
  childQuestions?: {
    type?: string
    sortOrder: number
    content?: string
    options?: string
    answer?: string
    difficulty?: number
  }[]
}

export type UserConceptStat = {
  id: number
  name: string
  mastery: number
}

export type UserSubjectStat = {
  id: number
  name: string
  category: Pick<Category, 'id' | 'name'>[]
  conceptGroup: UserConceptStat[]
}

export type GetUserStatsResponse = UserSubjectStat[]
