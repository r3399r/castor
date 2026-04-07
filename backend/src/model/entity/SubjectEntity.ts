import {
  BeforeInsert,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Category, CategoryEntity } from './CategoryEntity';

export type Subject = {
  id: number;
  categoryId: number;
  category: Category;
  name: string;
  createdAt: string | null;
};

@Entity({ name: 'subject' })
export class SubjectEntity implements Subject {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, name: 'category_id' })
  categoryId!: number;

  @ManyToOne(() => CategoryEntity)
  @JoinColumn({ name: 'category_id' })
  category!: Category;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'datetime', name: 'created_at', default: null })
  createdAt!: string;

  @BeforeInsert()
  setDateCreated(): void {
    this.createdAt = new Date().toISOString();
  }
}
