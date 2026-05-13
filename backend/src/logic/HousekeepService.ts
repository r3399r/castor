import { inject, injectable } from 'inversify';
import { PendingReplyAccess } from 'src/dao/PendingReplyAccess';
import { ReplyAccess } from 'src/dao/ReplyAccess';

@injectable()
export class HousekeepService {
  @inject(ReplyAccess)
  private readonly replyAccess!: ReplyAccess;
  @inject(PendingReplyAccess)
  private readonly pendingReplyAccess!: PendingReplyAccess;

  public async dataClean() {
    const threeMonthsAgo = new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000); // 3 months ago

    const result1 = await this.replyAccess.deleteOlderThan(threeMonthsAgo);
    console.log(
      `Deleted ${result1.affected ?? 0} replies older than ${threeMonthsAgo.toISOString()}.`
    );

    const result2 =
      await this.pendingReplyAccess.deleteOlderThan(threeMonthsAgo);
    console.log(
      `Deleted ${result2.affected ?? 0} pending replies older than ${threeMonthsAgo.toISOString()}.`
    );
  }
}
