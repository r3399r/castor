import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type Question = {
  id: number;
  content: string;
  isFreeResponse: boolean;
  discussionUrl: string;
  createdAt: string | null;
  updatedAt: string | null;
};

@Entity({ name: 'question' })
export class QuestionEntity implements Question {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'boolean', name: 'is_free_response', default: false })
  isFreeResponse: boolean = false;

  @Column({ type: 'varchar', length: 255, name: 'discussion_url' })
  discussionUrl!: string;

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
