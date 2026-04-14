import {
  BeforeInsert,
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Subject, SubjectEntity } from './SubjectEntity';

export type Exam = {
  id: number;
  subject: Subject[];
  name: string;
  createdAt: string | null;
};

@Entity({ name: 'exam' })
export class ExamEntity implements Exam {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'datetime', name: 'created_at', default: null })
  createdAt!: string;

  @ManyToMany(() => SubjectEntity)
  @JoinTable({
    name: 'exam_subject',
    joinColumn: { name: 'exam_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'subject_id', referencedColumnName: 'id' },
  })
  subject!: Subject[];

  @BeforeInsert()
  setDateCreated(): void {
    this.createdAt = new Date().toISOString();
  }
}
