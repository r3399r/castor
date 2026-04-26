import { BeforeInsert, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type Category = {
  id: number;
  name: string;
  createdAt: string | null;
};

@Entity({ name: 'category' })
export class CategoryEntity implements Category {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'datetime', name: 'created_at', default: null })
  createdAt!: string;

  @BeforeInsert()
  setDateCreated(): void {
    this.createdAt = new Date().toISOString();
  }
}
