import { FilterDimension } from '@castor/shared';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'filter_dimension' })
export class FilterDimensionEntity implements FilterDimension {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ type: 'int', unsigned: true, name: 'category_id' })
  categoryId!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'tinyint', unsigned: true, name: 'sort_order', default: 0 })
  sortOrder!: number;
}
