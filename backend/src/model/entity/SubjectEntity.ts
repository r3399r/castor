import {
  BeforeInsert,
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Category, CategoryEntity } from './CategoryEntity';

export type Subject = {
  id: number;
  category: Category[];
  name: string;
  createdAt: string | null;
};

@Entity({ name: 'subject' })
export class SubjectEntity implements Subject {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'datetime', name: 'created_at', default: null })
  createdAt!: string;

  @ManyToMany(() => CategoryEntity)
  @JoinTable({
    name: 'subject_category',
    joinColumn: { name: 'subject_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'category_id', referencedColumnName: 'id' },
  })
  category!: Category[];

  @BeforeInsert()
  setDateCreated(): void {
    this.createdAt = new Date().toISOString();
  }
}
