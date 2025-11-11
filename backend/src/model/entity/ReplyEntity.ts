import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Question, QuestionEntity } from './QuestionEntity';

export type Reply = {
  id: number;
  questionId: number;
  question: Question;
  userId: number;
  score: number;
  elapsedTimeMs: number | null;
  repliedAnswer: string | null;
  complete: boolean;
  recordedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

@Entity({ name: 'reply' })
export class ReplyEntity implements Reply {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, name: 'question_id' })
  questionId!: number;

  @ManyToOne(() => QuestionEntity)
  @JoinColumn({ name: 'question_id' })
  question!: Question;

  @Column({ type: 'int', unsigned: true, name: 'user_id' })
  userId!: number;

  @Column({ type: 'double' })
  score!: number;

  @Column({ type: 'int', name: 'elapsed_time_ms', default: null })
  elapsedTimeMs: number | null = null;

  @Column({ type: 'text', name: 'replied_answer', default: null })
  repliedAnswer: string | null = null;

  @Column({ type: 'boolean' })
  complete: boolean = false;

  @Column({ type: 'datetime', name: 'recorded_at', default: null })
  recordedAt: string | null = null;

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
