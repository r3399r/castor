import { bindings } from 'src/bindings';
import { DbAccess } from 'src/dao/DbAccess';
import { StatsService } from 'src/logic/StatsService';
import { initLambda } from 'src/utils/LambdaHelper';

export async function statsLoader(_event: unknown, _context: unknown) {
  const db = bindings.get(DbAccess);
  await db.startTransaction();
  initLambda();
  const service = bindings.get(StatsService);
  try {
    await service.processStats();
    await db.commitTransaction();
  } catch (e) {
    console.log(e);
    await db.rollbackTransaction();
  } finally {
    await db.cleanup();
  }
}
