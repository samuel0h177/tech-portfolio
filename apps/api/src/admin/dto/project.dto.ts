import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class UpsertProjectDto {
  @IsIn(['ESTO', 'OTHER'])
  programFlag!: 'ESTO' | 'OTHER';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  programName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  projectCode?: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  abstract?: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @IsString()
  statusText?: string;

  @IsOptional()
  @IsInt()
  completionFy?: number;

  @IsOptional()
  @IsInt()
  trlIn?: number;

  @IsOptional()
  @IsInt()
  trlCurrent?: number;

  @IsOptional()
  @IsInt()
  trlOut?: number;

  @IsOptional()
  @IsString()
  quadChartUrl?: string;

  @IsOptional()
  @IsInt()
  piId?: number | null;

  @IsOptional()
  @IsInt()
  organizationId?: number | null;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  categoryIds?: number[];
}

export class AddDocumentDto {
  @IsString()
  fileName!: string;

  @IsUrl({ require_tld: false })
  url!: string;

  @IsOptional()
  @IsInt()
  fileSize?: number;
}
