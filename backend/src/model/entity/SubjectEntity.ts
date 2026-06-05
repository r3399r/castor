import {
  Category,
  ConceptGroup,
  Exam,
  FilterOption,
  Subject,
  Tag,
} from '@castor/shared';
import {
  BeforeInsert,
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CategoryEntity } from './CategoryEntity';
import { ConceptGroupEntity } from './ConceptGroupEntity';
import { ExamEntity } from './ExamEntity';
import { FilterOptionEntity } from './FilterOptionEntity';
import { TagEntity } from './TagEntity';

@Entity({ name: 'subject' })
export class SubjectEntity implements Subject {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'tinyint', unsigned: true, name: 'sort_order', default: 0 })
  sortOrder!: number;

  @Column({ type: 'datetime', name: 'created_at', default: null })
  createdAt!: string;

  @ManyToMany(() => CategoryEntity)
  @JoinTable({
    name: 'subject_category',
    joinColumn: { name: 'subject_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'category_id', referencedColumnName: 'id' },
  })
  category!: Category[];

  @ManyToMany(() => FilterOptionEntity)
  @JoinTable({
    name: 'filter_subject_option',
    joinColumn: { name: 'subject_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'option_id', referencedColumnName: 'id' },
  })
  filterOptions!: FilterOption[];

  @ManyToMany(() => ExamEntity, (exam) => exam.subject)
  @JoinTable({
    name: 'exam_subject',
    joinColumn: { name: 'subject_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'exam_id', referencedColumnName: 'id' },
  })
  exams!: Exam[];

  @OneToMany(() => ConceptGroupEntity, (conceptGroup) => conceptGroup.subject)
  conceptGroups!: ConceptGroup[];

  @OneToMany(() => TagEntity, (tag) => tag.subject)
  tags!: Tag[];

  @BeforeInsert()
  setDateCreated(): void {
    this.createdAt = new Date().toISOString();
  }
}
