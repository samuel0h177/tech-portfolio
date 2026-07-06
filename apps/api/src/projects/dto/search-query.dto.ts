import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const toIntArray = ({ value }: { value: unknown }): number[] => {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : String(value).split(',');
  return arr.map((v) => parseInt(String(v), 10)).filter((n) => !Number.isNaN(n));
};

const toStringArray = ({ value }: { value: unknown }): string[] => {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : String(value).split(',');
  return arr.map((v) => String(v).trim()).filter((v) => v.length);
};

export type ProgramFilter = 'ESTO' | 'OTHER' | 'ALL';
export type StatusFilter = 'ACTIVE' | 'COMPLETED' | 'ALL';
export type SortBy = 'relevance' | 'title' | 'projectCode' | 'completionFy' | 'program' | 'pi';
export type SortOrder = 'asc' | 'desc';

export class SearchQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(['ESTO', 'OTHER', 'ALL'])
  program: ProgramFilter = 'ALL';

  @IsOptional()
  @IsIn(['ACTIVE', 'COMPLETED', 'ALL'])
  status: StatusFilter = 'ALL';

  @IsOptional()
  @IsArray()
  @Transform(toIntArray)
  categoryIds: number[] = [];

  @IsOptional()
  @IsArray()
  @Transform(toStringArray)
  orgTypes: string[] = [];

  @IsOptional()
  @IsString()
  pi?: string;

  @IsOptional()
  @IsIn(['relevance', 'title', 'projectCode', 'completionFy', 'program', 'pi'])
  sortBy: SortBy = 'relevance';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: SortOrder = 'asc';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(String(value), 10) || 1)
  page = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(String(value), 10) || 25)
  pageSize = 25;
}
