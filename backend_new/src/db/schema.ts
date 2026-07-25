import { datetime, int, mysqlTable, varchar } from 'drizzle-orm/mysql-core';

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
