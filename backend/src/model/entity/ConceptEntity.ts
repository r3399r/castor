import {
  BeforeInsert,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ConceptGroup, ConceptGroupEntity } from './ConceptGroupEntity';

export type Concept = {
  id: number;
  name: string;
  conceptGroupId: number;
  conceptGroup: ConceptGroup;
  createdAt: string | null;
};

@Entity({ name: 'concept' })
export class ConceptEntity implements Concept {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'int', unsigned: true, name: 'concept_group_id' })
  conceptGroupId!: number;

  @ManyToOne(() => ConceptGroupEntity)
  @JoinColumn({ name: 'concept_group_id' })
  conceptGroup!: ConceptGroup;

  @Column({ type: 'datetime', name: 'created_at', default: null })
  createdAt!: string;

  @BeforeInsert()
  setDateCreated(): void {
    this.createdAt = new Date().toISOString();
  }
}
