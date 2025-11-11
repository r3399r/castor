import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Category, CategoryEntity } from './CategoryEntity';
import { User, UserEntity } from './UserEntity';

export type UserStats = {
  id: number;
  userId: number;
  user: User;
  categoryId: number;
  category: Category;
  count: number;
  scoringRate: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

@Entity({ name: 'user_stats' })
export class UserStatsEntity implements UserStats {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, name: 'user_id' })
  userId!: number;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'int', unsigned: true, name: 'category_id' })
  categoryId!: number;

  @ManyToOne(() => CategoryEntity)
  @JoinColumn({ name: 'category_id' })
  category!: Category;

  @Column({ type: 'int', unsigned: true })
  count: number = 0;

  @Column({ type: 'double', name: 'scoring_rate', default: null })
  scoringRate: number | null = null;

  @Column({ type: 'datetime', name: 'created_at', default: null })
  createdAt!: string;

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
