import { bindings } from 'src/bindings';
import { DbAccess } from 'src/dao/DbAccess';
import { HousekeepService } from 'src/logic/HousekeepService';
import { initLambda } from 'src/utils/LambdaHelper';

export async function housekeep(_event: unknown, _context: unknown) {
  const db = bindings.get(DbAccess);
  await db.startTransaction();
  initLambda();
  const service = bindings.get(HousekeepService);
  try {
    await service.dataClean();
    await db.commitTransaction();
  } catch (e) {
    console.log(e);
    await db.rollbackTransaction();
  } finally {
    await db.cleanup();
  }
}
