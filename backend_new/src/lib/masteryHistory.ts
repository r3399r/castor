import { eq, inArray, sql } from 'drizzle-orm';
import {
  conceptGroupTable,
  conceptTable,
  subjectTable,
  userStatHistoryTable,
} from 'src/db/schema';
import { TransactionEnv } from 'src/middleware/transaction';

type Db = TransactionEnv['Variables']['db'];

/**
 * Shared reading of user_stat_history.
 *
 * Two endpoints now consume these rows for different things: the free
 * GET /user/history, for totals, streak and the activity heatmap; and
 * the subscriber-only GET /analysis/overview, for the mastery curves.
 * Only the second needs the question-count weighting, so the loading and
 * the weighting are separate calls rather than one -- the free path must
 * not pay for a concept join it no longer uses.
 */

export type DailyMasteryPoint = { date: string; weightedMastery: number };

export type SubjectMasterySeries = {
  subjectId: number;
  subjectName: string;
  dailyStats: DailyMasteryPoint[];
};

export type MasteryHistoryRow = {
  date: string;
  subjectId: number;
  weightedMastery: number | null;
  dailyAttempts: number;
  dailyCorrect: number;
};

/** date -> subjectId -> that day's figures for the subject. */
export type DateSubjectMap = Map<string, Map<number, { mastery: number | null; attempts: number }>>;

export const loadMasteryHistoryRows = async (
  db: Db,
  userId: number
): Promise<MasteryHistoryRow[]> => {
  // Formatted in SQL rather than from a Date, so the string is the
  // calendar date stored in the row and not a timezone-shifted
  // rendering of it.
  const dateExpr = sql<string>`date_format(${userStatHistoryTable.date}, '%Y-%m-%d')`;
  return db
    .select({
      date: dateExpr,
      subjectId: userStatHistoryTable.subjectId,
      weightedMastery: userStatHistoryTable.weightedMastery,
      dailyAttempts: userStatHistoryTable.dailyAttempts,
      dailyCorrect: userStatHistoryTable.dailyCorrect,
    })
    .from(userStatHistoryTable)
    .where(eq(userStatHistoryTable.userId, userId));
};

export const buildDateSubjectMap = (rows: MasteryHistoryRow[]): DateSubjectMap => {
  const map: DateSubjectMap = new Map();
  for (const row of rows) {
    if (!map.has(row.date)) map.set(row.date, new Map());
    map.get(row.date)!.set(row.subjectId, {
      mastery: row.weightedMastery,
      attempts: row.dailyAttempts,
    });
  }
  return map;
};

/**
 * Subject display names, and each subject's total question count.
 *
 * The question count is the weight the overall curve averages by, so a
 * subject the user has barely started does not swing the headline figure
 * as hard as one they have worked through.
 */
export const loadSubjectWeights = async (
  db: Db,
  subjectIds: number[]
): Promise<{ nameById: Map<number, string>; questionCountById: Map<number, number> }> => {
  if (subjectIds.length === 0) return { nameById: new Map(), questionCountById: new Map() };

  const [subjects, conceptGroups] = await Promise.all([
    db
      .select({ id: subjectTable.id, name: subjectTable.name })
      .from(subjectTable)
      .where(inArray(subjectTable.id, subjectIds)),
    db
      .select({ subjectId: conceptGroupTable.subjectId, id: conceptGroupTable.id })
      .from(conceptGroupTable)
      .where(inArray(conceptGroupTable.subjectId, subjectIds)),
  ]);

  const concepts =
    conceptGroups.length > 0
      ? await db
          .select({
            conceptGroupId: conceptTable.conceptGroupId,
            numberOfQuestions: conceptTable.numberOfQuestions,
          })
          .from(conceptTable)
          .where(
            inArray(
              conceptTable.conceptGroupId,
              conceptGroups.map((g) => g.id)
            )
          )
      : [];

  const groupSubjectById = new Map(conceptGroups.map((g) => [g.id, g.subjectId]));
  const questionCountById = new Map<number, number>();
  for (const concept of concepts) {
    const subjectId = groupSubjectById.get(concept.conceptGroupId);
    if (subjectId === undefined) continue;
    questionCountById.set(
      subjectId,
      (questionCountById.get(subjectId) ?? 0) + concept.numberOfQuestions
    );
  }

  return { nameById: new Map(subjects.map((s) => [s.id, s.name])), questionCountById };
};

/**
 * Expands sparse per-day values into one point per calendar day, from
 * `firstDate` through today, carrying the last known value forward.
 *
 * Carrying forward rather than interpolating or leaving gaps is the
 * honest reading: mastery is a running figure that simply was not
 * resampled on a day with no practice -- it did not drop to zero, and it
 * did not glide upward.
 */
export const fillDaily = (sparse: Map<string, number>, firstDate: string): DailyMasteryPoint[] => {
  const today = new Date().toISOString().slice(0, 10);
  const out: DailyMasteryPoint[] = [];
  let last = 0;
  const cursor = new Date(`${firstDate}T00:00:00Z`);
  const end = new Date(`${today}T00:00:00Z`);
  while (cursor <= end) {
    const dateStr = cursor.toISOString().slice(0, 10);
    if (sparse.has(dateStr)) last = sparse.get(dateStr)!;
    out.push({ date: dateStr, weightedMastery: last });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
};

export const buildOverallDailyMastery = (
  dateSubjectMap: DateSubjectMap,
  questionCountById: Map<number, number>
): DailyMasteryPoint[] => {
  const sparse = new Map<string, number>(
    [...dateSubjectMap.entries()].map(([date, subjectEntries]) => {
      let weightedSum = 0;
      let totalQ = 0;
      for (const [subjectId, { mastery }] of subjectEntries) {
        if (mastery === null) continue;
        const q = questionCountById.get(subjectId) ?? 0;
        weightedSum += mastery * q;
        totalQ += q;
      }
      return [date, totalQ > 0 ? weightedSum / totalQ : 0];
    })
  );

  const firstDate = [...sparse.keys()].sort()[0];
  if (firstDate === undefined) return [];
  return fillDaily(sparse, firstDate);
};

export const buildSubjectHistory = (
  rows: MasteryHistoryRow[],
  nameById: Map<number, string>
): SubjectMasterySeries[] => {
  const sparseBySubject = new Map<number, Map<string, number>>();
  for (const row of rows) {
    if (row.weightedMastery === null) continue;
    if (!sparseBySubject.has(row.subjectId)) sparseBySubject.set(row.subjectId, new Map());
    sparseBySubject.get(row.subjectId)!.set(row.date, row.weightedMastery);
  }

  return [...sparseBySubject.entries()].map(([subjectId, sparse]) => ({
    subjectId,
    subjectName: nameById.get(subjectId) ?? '',
    dailyStats: fillDaily(sparse, [...sparse.keys()].sort()[0]),
  }));
};
