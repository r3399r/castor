import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type Reply = {
  id: number;
  questionId: number;
  subjectId: number;
  userId: number;
  parentId: number | null;
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

  @Column({ type: 'int', unsigned: true, name: 'subject_id' })
  subjectId!: number;

  @Column({ type: 'int', unsigned: true, name: 'user_id' })
  userId!: number;

  @Column({ type: 'int', unsigned: true, name: 'parent_id' })
  parentId: number | null = null;

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
