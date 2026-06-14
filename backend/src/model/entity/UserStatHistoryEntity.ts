import { UserStatHistory } from '@castor/shared';
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'user_stat_history' })
export class UserStatHistoryEntity implements UserStatHistory {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, name: 'user_id' })
  userId!: number;

  @Column({ type: 'int', unsigned: true, name: 'subject_id' })
  subjectId!: number;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'double', name: 'weighted_mastery', nullable: true })
  weightedMastery: number | null = null;

  @Column({ type: 'int', unsigned: true, name: 'daily_attempts' })
  dailyAttempts: number = 0;

  @Column({ type: 'double', name: 'daily_correct' })
  dailyCorrect: number = 0;

  @Column({ type: 'datetime', name: 'created_at' })
  createdAt: string | null = null;

  @Column({ type: 'datetime', name: 'updated_at' })
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
