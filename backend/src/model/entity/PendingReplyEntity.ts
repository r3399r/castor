import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type PendingReply = {
  id: number;
  questionId: number;
  userId: number;
  createdAt: string | null;
  updatedAt: string | null;
};

@Entity({ name: 'pending_reply' })
export class PendingReplyEntity implements PendingReply {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, name: 'question_id' })
  questionId!: number;

  @Column({ type: 'int', unsigned: true, name: 'user_id' })
  userId!: number;

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
