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
import { QuestionMinor, QuestionMinorEntity } from './QuestionMinorEntity';
import { Reply, ReplyEntity } from './ReplyEntity';
import { Tag, TagEntity } from './TagEntity';

export type Question = {
  id: number;
  rid: string;
  categoryId: number;
  category: Category;
  content: string;
  discussionUrl: string | null;
  source: string | null;
  minor: QuestionMinor[];
  reply: Reply[];
  tag: Tag[];
  count: number;
  scoringRate: number | null;
  avgElapsedTimeMs: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

@Entity({ name: 'question' })
export class QuestionEntity implements Question {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'varchar', length: 16 })
  rid!: string;

  @Column({ type: 'int', unsigned: true, name: 'category_id' })
  categoryId!: number;

  @ManyToOne(() => CategoryEntity)
  @JoinColumn({ name: 'category_id' })
  category!: Category;

  @Column({ type: 'text' })
  content!: string;

  @Column({
    type: 'varchar',
    length: 255,
    name: 'discussion_url',
    default: null,
  })
  discussionUrl: string | null = null;

  @Column({ type: 'varchar', length: 255, default: null })
  source: string | null = null;

  @Column({ type: 'int', unsigned: true })
  count: number = 0;

  @Column({ type: 'double', name: 'scoring_rate', default: null })
  scoringRate: number | null = null;

  @Column({ type: 'double', name: 'avg_elapsed_time_ms', default: null })
  avgElapsedTimeMs: number | null = null;

  @OneToMany(
    () => QuestionMinorEntity,
    (questionMinor) => questionMinor.question
  )
  minor!: QuestionMinor[];

  @OneToMany(() => ReplyEntity, (reply) => reply.question)
  reply!: Reply[];

  @ManyToMany(() => TagEntity)
  @JoinTable({
    name: 'question_tag',
    joinColumn: { name: 'question_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tag!: Tag[];

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
