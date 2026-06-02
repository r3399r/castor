import { FilterDimension, FilterOption } from '@castor/shared';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FilterDimensionEntity } from './FilterDimensionEntity';

@Entity({ name: 'filter_option' })
export class FilterOptionEntity implements FilterOption {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @ManyToOne(() => FilterDimensionEntity)
  @JoinColumn({ name: 'dimension_id' })
  dimension!: FilterDimension;

  @Column({ type: 'int', unsigned: true, name: 'parent_id', default: null })
  parentId!: number | null;

  @Column({ type: 'varchar', length: 255 })
  name!: string;
}
