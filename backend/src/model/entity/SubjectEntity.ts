import { BeforeInsert, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type Subject = {
  id: number;
  categoryId: number;
  name: string;
  createdAt: string | null;
};

@Entity({ name: 'subject' })
export class SubjectEntity implements Subject {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, name: 'category_id' })
  categoryId!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'datetime', name: 'created_at', default: null })
  createdAt!: string;

  @BeforeInsert()
  setDateCreated(): void {
    this.createdAt = new Date().toISOString();
  }
}
