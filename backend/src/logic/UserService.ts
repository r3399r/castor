import { inject, injectable } from 'inversify';
import { UserAccess } from 'src/dao/UserAccess';
import { UserEntity } from 'src/model/entity/UserEntity';
import { NotFoundError } from 'src/model/error';
import { deviceIdSymbol, userIdSymbol } from 'src/utils/LambdaHelper';

/**
 * Service class for User
 */
@injectable()
export class UserService {
  @inject(UserAccess)
  private readonly userAccess!: UserAccess;
  @inject(deviceIdSymbol)
  private readonly deviceId!: string;
  @inject(userIdSymbol)
  private readonly userId!: string;

  public async getUserByDeviceId(deviceId: string) {
    const user = await this.userAccess.findOne({ where: { deviceId } });
    if (user) return user;

    const userEntity = new UserEntity();
    userEntity.deviceId = deviceId;

    return await this.userAccess.save(userEntity);
  }

  public async getUser() {
    let user = await this.userAccess.findOne({
      where: { id: Number(this.userId) },
    });
    if (user !== null) return user;

    user = await this.userAccess.findOne({
      where: { deviceId: this.deviceId },
    });

    if (user !== null) return user;
    throw new NotFoundError('User not found');
  }
}
