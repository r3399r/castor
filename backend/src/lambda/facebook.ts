import { bindings } from 'src/bindings';
import { DbAccess } from 'src/dao/DbAccess';
import { FacebookService } from 'src/logic/FacebookService';
import { initLambda } from 'src/utils/LambdaHelper';

export async function facebook(_event: unknown, _context: unknown) {
  const db = bindings.get(DbAccess);
  await db.startTransaction();
  initLambda();
  const service = bindings.get(FacebookService);
  try {
    await service.processNextQuestion();
    await db.commitTransaction();
  } catch (e) {
    console.log(e);
    await db.rollbackTransaction();
  } finally {
    await db.cleanup();
  }
}
