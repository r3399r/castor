import {
  AnyMySqlColumn,
  boolean,
  date,
  datetime,
  double,
  int,
  mysqlTable,
  primaryKey,
  text,
  tinyint,
  varchar,
} from 'drizzle-orm/mysql-core';

export const categoryTable = mysqlTable('category', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  // mode: 'date' (not 'string') so the mysql2 driver formats the value for
  // MySQL's DATETIME literal syntax itself -- that format isn't ISO 8601
  // ('T'/'Z'), and passing an ISO string through as mode: 'string' fails
  // with ER_TRUNCATED_WRONG_VALUE. Still serializes back to an ISO string
  // in JSON responses via Date.prototype.toJSON, so the API shape is
  // unchanged.
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }),
});

export const subjectTable = mysqlTable('subject', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  sortOrder: tinyint('sort_order', { unsigned: true }).notNull().default(0),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }),
});

export const subjectCategoryTable = mysqlTable(
  'subject_category',
  {
    subjectId: int('subject_id', { unsigned: true })
      .notNull()
      .references(() => subjectTable.id),
    categoryId: int('category_id', { unsigned: true })
      .notNull()
      .references(() => categoryTable.id),
  },
  (table) => [primaryKey({ columns: [table.subjectId, table.categoryId] })]
);

export const examTable = mysqlTable('exam', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }),
});

export const examSubjectTable = mysqlTable(
  'exam_subject',
  {
    examId: int('exam_id', { unsigned: true })
      .notNull()
      .references(() => examTable.id),
    subjectId: int('subject_id', { unsigned: true })
      .notNull()
      .references(() => subjectTable.id),
  },
  (table) => [primaryKey({ columns: [table.examId, table.subjectId] })]
);

// One-to-many with subject (subjectId is a plain required attribute, not a
// join table) -- unlike category/exam, there's no separate relation-edit
// flow, it's just edited alongside name on the tag itself.
export const tagTable = mysqlTable('tag', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  subjectId: int('subject_id', { unsigned: true })
    .notNull()
    .references(() => subjectTable.id),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }),
});

// Same one-to-many-with-subject shape as tag.
export const conceptGroupTable = mysqlTable('concept_group', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  subjectId: int('subject_id', { unsigned: true })
    .notNull()
    .references(() => subjectTable.id),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }),
});

// One-to-many with concept_group, same shape as tag/concept_group's
// relation to subject. numberOfQuestions is populated elsewhere (counted
// as questions get added) -- not an admin-editable attribute, so it's
// never part of the create/update body, just left to its DB default.
export const conceptTable = mysqlTable('concept', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  conceptGroupId: int('concept_group_id', { unsigned: true })
    .notNull()
    .references(() => conceptGroupTable.id),
  numberOfQuestions: int('number_of_questions', { unsigned: true })
    .notNull()
    .default(0),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }),
});

// One-to-many with category (like tag/concept_group's relation to
// subject), plus a sortOrder to control display order among a category's
// dimensions -- same shape as subject's own sortOrder.
export const filterDimensionTable = mysqlTable('filter_dimension', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  categoryId: int('category_id', { unsigned: true })
    .notNull()
    .references(() => categoryTable.id),
  name: varchar('name', { length: 255 }).notNull(),
  sortOrder: tinyint('sort_order', { unsigned: true }).notNull().default(0),
});

// One-to-many with filter_dimension, plus an optional self-referential
// parent -- an option can nest under an option from a preceding dimension
// in the same category, which is what lets the practice-page filter UI
// cascade (picking a parent option narrows which child options show next).
export const filterOptionTable = mysqlTable('filter_option', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  dimensionId: int('dimension_id', { unsigned: true })
    .notNull()
    .references(() => filterDimensionTable.id),
  parentId: int('parent_id', { unsigned: true }).references(
    (): AnyMySqlColumn => filterOptionTable.id
  ),
  name: varchar('name', { length: 255 }).notNull(),
});

// Many-to-many join recording which filter options apply to which
// subjects -- same shape as subject_category/exam_subject, no attributes
// of its own.
export const filterSubjectOptionTable = mysqlTable(
  'filter_subject_option',
  {
    subjectId: int('subject_id', { unsigned: true })
      .notNull()
      .references(() => subjectTable.id),
    optionId: int('option_id', { unsigned: true })
      .notNull()
      .references(() => filterOptionTable.id),
  },
  (table) => [primaryKey({ columns: [table.subjectId, table.optionId] })]
);

// Rows represent both top-level questions and GROUP-question children via
// the nullable self-referential parentId -- a GROUP question has
// isGroup=true, parentId=null, and its children are separate rows with
// their own type/content/options/answer, parentId pointing back at the
// parent, and sortOrder for their display order within the group.
export const questionTable = mysqlTable('question', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  uuid: varchar('uuid', { length: 36 }).notNull(),
  subjectId: int('subject_id', { unsigned: true })
    .notNull()
    .references(() => subjectTable.id),
  parentId: int('parent_id', { unsigned: true }).references(
    (): AnyMySqlColumn => questionTable.id
  ),
  fbPostId: varchar('fb_post_id', { length: 255 }),
  isGroup: boolean('is_group').notNull().default(false),
  type: varchar('type', { length: 255 }).notNull(),
  sortOrder: int('sort_order'),
  content: text('content'),
  options: varchar('options', { length: 255 }),
  answer: varchar('answer', { length: 255 }),
  difficulty: tinyint('difficulty', { unsigned: true }).notNull(),
  // Column name matches the "attemp_count" typo already baked into both
  // the deployed DB schema and the shared API type -- not fixing it here,
  // that would be a three-way (DB/backend/frontend) rename for no
  // behavioral gain.
  attempCount: int('attemp_count', { unsigned: true }).notNull().default(0),
  scoringTotal: double('scoring_total').notNull().default(0),
  adjustedDifficulty: double('adjusted_difficulty').notNull(),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }),
});

// Many-to-many join between question and tag -- only ever populated on
// the parent of a GROUP question (children don't get their own tags).
export const questionTagTable = mysqlTable(
  'question_tag',
  {
    questionId: int('question_id', { unsigned: true })
      .notNull()
      .references(() => questionTable.id),
    tagId: int('tag_id', { unsigned: true })
      .notNull()
      .references(() => tagTable.id),
  },
  (table) => [primaryKey({ columns: [table.questionId, table.tagId] })]
);

// Many-to-many join between question and concept -- same shape as
// question_tag; only the parent of a GROUP question gets concept links.
export const questionConceptTable = mysqlTable(
  'question_concept',
  {
    questionId: int('question_id', { unsigned: true })
      .notNull()
      .references(() => questionTable.id),
    conceptId: int('concept_id', { unsigned: true })
      .notNull()
      .references(() => conceptTable.id),
  },
  (table) => [primaryKey({ columns: [table.questionId, table.conceptId] })]
);

// Many-to-many join between question and exam -- same shape as
// question_tag/question_concept.
export const questionExamTable = mysqlTable(
  'question_exam',
  {
    questionId: int('question_id', { unsigned: true })
      .notNull()
      .references(() => questionTable.id),
    examId: int('exam_id', { unsigned: true })
      .notNull()
      .references(() => examTable.id),
  },
  (table) => [primaryKey({ columns: [table.questionId, table.examId] })]
);

// Rows here come from the app's own sign-in flow (Firebase), never from
// this admin panel -- there's no create/update/delete route for it.
export const userTable = mysqlTable('user', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  firebaseUid: varchar('firebase_uid', { length: 128 }).notNull(),
  email: varchar('email', { length: 255 }),
  name: varchar('name', { length: 255 }),
  avatar: text('avatar'),
  lastLoginAt: datetime('last_login_at', { mode: 'date', fsp: 3 }),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }),
});

// A question served to a user by adaptive selection that they haven't
// answered yet -- exists so a second adaptive fetch before the reply
// lands doesn't hand out a different question for work already in
// flight. Cleared once the user replies (elsewhere, not in this file).
export const pendingReplyTable = mysqlTable('pending_reply', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  questionId: int('question_id', { unsigned: true })
    .notNull()
    .references(() => questionTable.id),
  userId: int('user_id', { unsigned: true })
    .notNull()
    .references(() => userTable.id),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }),
});

// One row per submitted answer. parentId mirrors question.parentId (set
// when the reply is for a GROUP question's child), so replies belonging
// to the same group can be found without joining back through question.
export const replyTable = mysqlTable('reply', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  questionId: int('question_id', { unsigned: true })
    .notNull()
    .references(() => questionTable.id),
  subjectId: int('subject_id', { unsigned: true })
    .notNull()
    .references(() => subjectTable.id),
  userId: int('user_id', { unsigned: true })
    .notNull()
    .references(() => userTable.id),
  parentId: int('parent_id', { unsigned: true }).references(() => questionTable.id),
  score: double('score').notNull().default(0),
  repliedAnswer: varchar('replied_answer', { length: 255 }),
  repliedAt: datetime('replied_at', { mode: 'date', fsp: 3 }).notNull(),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }),
});

// Per-user, per-concept mastery score that adaptive selection reads to
// pick questions near the user's current skill level. The scoring
// columns (attemptCount/scoringTotal/weightedSum/decaySum) are
// maintained by whatever grades replies elsewhere -- adaptive selection
// only ever reads mastery off this table, never writes it.
export const userConceptStatTable = mysqlTable('user_concept_stat', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  userId: int('user_id', { unsigned: true })
    .notNull()
    .references(() => userTable.id),
  conceptId: int('concept_id', { unsigned: true })
    .notNull()
    .references(() => conceptTable.id),
  mastery: double('mastery'),
  attemptCount: int('attempt_count', { unsigned: true }).notNull().default(0),
  scoringTotal: double('scoring_total').notNull().default(0),
  lastAttemptAt: datetime('last_attempt_at', { mode: 'date', fsp: 3 }),
  weightedSum: double('weighted_sum').notNull().default(0),
  decaySum: double('decay_sum').notNull().default(0),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }),
});

// One row per (user, subject, day) -- daily rollup that POST /reply
// upserts after every batch, and that the not-yet-ported user-history
// endpoint (GET /user/history in the legacy backend) will read from.
export const userStatHistoryTable = mysqlTable('user_stat_history', {
  id: int('id', { unsigned: true }).autoincrement().primaryKey(),
  userId: int('user_id', { unsigned: true })
    .notNull()
    .references(() => userTable.id),
  subjectId: int('subject_id', { unsigned: true })
    .notNull()
    .references(() => subjectTable.id),
  date: date('date', { mode: 'string' }).notNull(),
  weightedMastery: double('weighted_mastery'),
  dailyAttempts: int('daily_attempts', { unsigned: true }).notNull().default(0),
  dailyCorrect: double('daily_correct').notNull().default(0),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }),
});
