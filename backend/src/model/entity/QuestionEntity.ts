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
import { Concept, ConceptEntity } from './ConceptEntity';
import { Subject, SubjectEntity } from './SubjectEntity';
import { Tag, TagEntity } from './TagEntity';

export type Question = {
  id: number;
  uuid: string;
  subjectId: number;
  subject: Subject;
  // examId: number;
  parentId: number | null;
  fbPostId: string | null;
  isGroup: boolean;
  type: 'GROUP' | 'SINGLE' | 'MULTIPLE' | 'TRUE_FALSE' | 'FILL';
  sortOrder: number | null;
  content: string | null;
  options: string | null;
  answer: string | null;
  difficulty: number;
  attempCount: number;
  scoringTotal: number;
  discrimination: number | null;
  adjustedDifficulty: number | null;
  tag: Tag[];
  concept: Concept[];
  createdAt: string | null;
  updatedAt: string | null;
};

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

  // @Column({ type: 'int', unsigned: true, name: 'exam_id' })
  // examId!: number;

  // @ManyToOne(() => ExamEntity)
  // @JoinColumn({ name: 'exam_id' })
  // exam!: Exam;

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

  @Column({ type: 'double' })
  discrimination: number | null = null;

  @Column({ type: 'double', name: 'adjusted_difficulty' })
  adjustedDifficulty!: number;

  @ManyToOne(() => QuestionEntity, (question) => question.children, {
    nullable: true,
  })
  @JoinColumn({ name: 'parent_id' })
  parent!: QuestionEntity | null;

  @OneToMany(() => QuestionEntity, (question) => question.parent)
  children!: Question[];

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
