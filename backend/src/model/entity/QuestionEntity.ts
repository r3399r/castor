import { Concept, Exam, Question, Subject, Tag } from '@castor/shared';
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ConceptEntity } from './ConceptEntity';
import { ExamEntity } from './ExamEntity';
import { SubjectEntity } from './SubjectEntity';
import { TagEntity } from './TagEntity';

@Entity({ name: 'question' })
export class QuestionEntity implements Question {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'varchar', length: 36 })
  uuid!: string;

  @Column({ type: 'int', unsigned: true, name: 'subject_id' })
  subjectId!: number;

  @ManyToOne(() => SubjectEntity)
  @JoinColumn({ name: 'subject_id' })
  subject!: Subject;

  @Column({ type: 'int', unsigned: true, name: 'parent_id' })
  parentId!: number | null;

  @Column({ type: 'varchar', length: 255, name: 'fb_post_id' })
  fbPostId: string | null = null;

  @Column({ type: 'boolean', name: 'is_group' })
  isGroup: boolean = false;

  @Column({ type: 'varchar', length: 255 })
  type!: 'GROUP' | 'SINGLE' | 'MULTIPLE' | 'TRUE_FALSE' | 'FILL';

  @Column({ type: 'int', name: 'sort_order' })
  sortOrder: number | null = null;

  @Column({ type: 'text' })
  content: string | null = null;

  @Column({ type: 'varchar', length: 255 })
  options: string | null = null;

  @Column({ type: 'varchar', length: 255 })
  answer: string | null = null;

  @Column({ type: 'tinyint', unsigned: true })
  difficulty!: number;

  @Column({ type: 'int', unsigned: true, name: 'attemp_count' })
  attempCount: number = 0;

  @Column({ type: 'double', name: 'scoring_total' })
  scoringTotal: number = 0;

  @Column({ type: 'double', name: 'adjusted_difficulty' })
  adjustedDifficulty!: number;

  @ManyToOne(() => QuestionEntity, (question) => question.children, {
    nullable: true,
  })
  @JoinColumn({ name: 'parent_id' })
  parent!: QuestionEntity | null;

  @OneToMany(() => QuestionEntity, (question) => question.parent)
  children!: Question[];

  @ManyToMany(() => ExamEntity)
  @JoinTable({
    name: 'question_exam',
    joinColumn: { name: 'question_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'exam_id', referencedColumnName: 'id' },
  })
  exam!: Exam[];

  @ManyToMany(() => TagEntity)
  @JoinTable({
    name: 'question_tag',
    joinColumn: { name: 'question_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tag!: Tag[];

  @ManyToMany(() => ConceptEntity)
  @JoinTable({
    name: 'question_concept',
    joinColumn: { name: 'question_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'concept_id', referencedColumnName: 'id' },
  })
  concept!: Concept[];

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
