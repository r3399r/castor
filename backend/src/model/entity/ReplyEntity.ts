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
import { Subject, SubjectEntity } from './SubjectEntity';

export type Reply = {
  id: number;
  questionId: number;
  question: Question;
  subjectId: number;
  subject: Subject;
  userId: number;
  parentId: number | null;
  parent: Question | null;
  score: number;
  repliedAnswer: string | null;
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

  @Column({ type: 'int', unsigned: true, name: 'subject_id' })
  subjectId!: number;

  @ManyToOne(() => SubjectEntity)
  @JoinColumn({ name: 'subject_id' })
  subject!: Subject;

  @Column({ type: 'int', unsigned: true, name: 'user_id' })
  userId!: number;

  @Column({ type: 'int', unsigned: true, name: 'parent_id' })
  parentId: number | null = null;

  @ManyToOne(() => QuestionEntity, (question) => question.children, {
    nullable: true,
  })
  @JoinColumn({ name: 'parent_id' })
  parent!: Question | null;

  @Column({ type: 'double' })
  score!: number;

  @Column({ type: 'text', name: 'replied_answer', default: null })
  repliedAnswer: string | null = null;

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
