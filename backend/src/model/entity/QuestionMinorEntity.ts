import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type QuestionMinor = {
  id: number;
  questionId: number;
  type: string;
  orderIndex: number;
  options: string | null;
  answer: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

@Entity({ name: 'question_minor' })
export class QuestionMinorEntity implements QuestionMinor {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, name: 'question_id' })
  questionId!: number;

  @Column({ type: 'varchar', length: 255 })
  type!: string;

  @Column({ type: 'int', name: 'order_index' })
  orderIndex!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  options: string | null = null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  answer: string | null = null;

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
