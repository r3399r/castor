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
  elapsedTimeMs: number;
  repliedAnswer: string;
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

  @Column({ type: 'int', name: 'elapsed_time_ms' })
  elapsedTimeMs!: number;

  @Column({ type: 'text', name: 'replied_answer' })
  repliedAnswer!: string;

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
