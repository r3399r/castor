import { Concept, UserConceptStat } from '@castor/shared';
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ConceptEntity } from './ConceptEntity';

@Entity({ name: 'user_concept_stat' })
export class UserConceptStatEntity implements UserConceptStat {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, name: 'user_id' })
  userId!: number;

  @Column({ type: 'int', unsigned: true, name: 'concept_id' })
  conceptId!: number;

  @ManyToOne(() => ConceptEntity)
  @JoinColumn({ name: 'concept_id' })
  concept!: Concept;

  @Column({ type: 'double', nullable: true })
  mastery: number | null = null;

  @Column({ type: 'int', unsigned: true, name: 'attempt_count' })
  attemptCount: number = 0;

  @Column({ type: 'double', name: 'scoring_total' })
  scoringTotal: number = 0;

  @Column({ type: 'datetime', name: 'last_attempt_at' })
  lastAttemptAt: string | null = null;

  @Column({ type: 'double', name: 'weighted_sum' })
  weightedSum: number = 0;

  @Column({ type: 'double', name: 'decay_sum' })
  decaySum: number = 0;

  @Column({ type: 'datetime', name: 'created_at' })
  createdAt: string | null = null;

  @Column({ type: 'datetime', name: 'updated_at' })
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
