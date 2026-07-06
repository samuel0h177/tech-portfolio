import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class UpsertPiDto {
  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsString()
  orgCenter?: string;
}

export class UpsertOrganizationDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsIn(['ACADEMIA', 'INDUSTRY', 'NASA_CENTER', 'FEDERAL_LAB'])
  type?: 'ACADEMIA' | 'INDUSTRY' | 'NASA_CENTER' | 'FEDERAL_LAB';
}

export class UpsertCategoryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  parentId?: number | null;
}
