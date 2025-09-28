import { inject, injectable } from 'inversify';
import { UserAccess } from 'src/dao/UserAccess';
import { UserEntity } from 'src/model/entity/UserEntity';

/**
 * Service class for User
 */
@injectable()
export class UserService {
  @inject(UserAccess)
  private readonly userAccess!: UserAccess;

  public async getUserByDeviceId(deviceId: string) {
    const user = await this.userAccess.findOne({ where: { deviceId } });
    if (user) return user;

    const userEntity = new UserEntity();
    userEntity.deviceId = deviceId;

    return await this.userAccess.save(userEntity);
  }
}
