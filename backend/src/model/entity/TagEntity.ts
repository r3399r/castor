import { Subject, Tag } from '@castor/shared';
import {
  BeforeInsert,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SubjectEntity } from './SubjectEntity';

@Entity({ name: 'tag' })
export class TagEntity implements Tag {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'int', unsigned: true, name: 'subject_id' })
  subjectId!: number;

  @ManyToOne(() => SubjectEntity)
  @JoinColumn({ name: 'subject_id' })
  subject!: Subject;

  @Column({ type: 'datetime', name: 'created_at', default: null })
  createdAt!: string;

  @BeforeInsert()
  setDateCreated(): void {
    this.createdAt = new Date().toISOString();
  }
}
