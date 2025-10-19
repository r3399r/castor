import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type UserStats = {
  id: number;
  userId: number;
  categoryId: number;
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

  @Column({ type: 'int', unsigned: true, name: 'category_id' })
  categoryId!: number;

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
