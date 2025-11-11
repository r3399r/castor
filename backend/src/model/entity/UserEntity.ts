import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type User = {
  id: number;
  firebaseUid: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

@Entity({ name: 'user' })
export class UserEntity implements User {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'varchar', length: 128, name: 'firebase_uid' })
  firebaseUid!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null = null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null = null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  avatar: string | null = null;

  @Column({ type: 'datetime', name: 'last_login_at', default: null })
  lastLoginAt: string | null = null;

  @Column({ type: 'datetime', name: 'created_at', default: null })
  createdAt: string | null = null;

  @Column({ type: 'datetime', name: 'updated_at', default: null })
  updatedAt: string | null = null;

  @BeforeInsert()
  setDateCreated(): void {
    this.createdAt = new Date().toISOString();
  }

  @BeforeUpdate()
  setDateUpdated(): void {
    this.updatedAt = new Date().toISOString();
  }
}
