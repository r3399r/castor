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
import { Category, CategoryEntity } from './CategoryEntity';
import { Concept, ConceptEntity } from './ConceptEntity';
import { QuestionMinor, QuestionMinorEntity } from './QuestionMinorEntity';
import { Tag, TagEntity } from './TagEntity';

export type Question = {
  id: number;
  uuid: string;
  title: string | null;
  categoryId: number;
  category: Category;
  content: string | null;
  fbPostId: string | null;
  source: string | null;
  difficulty: number | null;
  attempCount: number;
  scoringTotal: number;
  discrimination: number | null;
  minor: QuestionMinor[];
  // reply: Reply[];
  tag: Tag[];
  concept: Concept[];
  createdAt: string | null;
  updatedAt: string | null;
};

@Entity({ name: 'question' })
export class QuestionEntity implements Question {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'varchar', length: 16 })
  uuid!: string;

  @Column({ type: 'varchar', length: 255 })
  title: string | null = null;

  @Column({ type: 'int', unsigned: true, name: 'category_id' })
  categoryId!: number;

  @ManyToOne(() => CategoryEntity)
  @JoinColumn({ name: 'category_id' })
  category!: Category;

  @Column({ type: 'text' })
  content: string | null = null;

  @Column({ type: 'varchar', length: 255, name: 'fb_post_id' })
  fbPostId: string | null = null;

  @Column({ type: 'varchar', length: 255, default: null })
  source: string | null = null;

  @Column({ type: 'tinyint', unsigned: true })
  difficulty: number | null = null;

  @Column({ type: 'int', unsigned: true, name: 'attemp_count' })
  attempCount: number = 0;

  @Column({ type: 'double', name: 'scoring_total' })
  scoringTotal: number = 0;

  @Column({ type: 'float' })
  discrimination: number | null = null;

  @OneToMany(
    () => QuestionMinorEntity,
    (questionMinor) => questionMinor.question
  )
  minor!: QuestionMinor[];

  // @OneToMany(() => ReplyEntity, (reply) => reply.question)
  // reply!: Reply[];

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
