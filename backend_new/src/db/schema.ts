import {
  datetime,
  int,
  mysqlTable,
  primaryKey,
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
