import {
  BeforeInsert,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Subject, SubjectEntity } from './SubjectEntity';

export type Exam = {
  id: number;
  subjectId: number;
  subject: Subject;
  name: string;
  createdAt: string | null;
};

@Entity({ name: 'exam' })
export class ExamEntity implements Exam {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, name: 'subject_id' })
  subjectId!: number;

  @ManyToOne(() => SubjectEntity)
  @JoinColumn({ name: 'subject_id' })
  subject!: Subject;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'datetime', name: 'created_at', default: null })
  createdAt!: string;

  @BeforeInsert()
  setDateCreated(): void {
    this.createdAt = new Date().toISOString();
  }
}
