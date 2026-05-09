import { Concept, ConceptGroup, Subject } from '@castor/shared';
import {
  BeforeInsert,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ConceptEntity } from './ConceptEntity';
import { SubjectEntity } from './SubjectEntity';

@Entity({ name: 'concept_group' })
export class ConceptGroupEntity implements ConceptGroup {
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

  @OneToMany(() => ConceptEntity, (concept) => concept.conceptGroup)
  concepts!: Concept[];

  @BeforeInsert()
  setDateCreated(): void {
    this.createdAt = new Date().toISOString();
  }
}
