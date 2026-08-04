import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}

export class SearchContextDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  q?: string;

  @IsOptional()
  @IsString()
  program?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  pi?: string;

  @IsOptional()
  @IsInt()
  total?: number;
}

export class ChatRequestDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SearchContextDto)
  searchContext?: SearchContextDto;
}

export type ApplySearchFilters = {
  q?: string;
  program?: 'ESTO' | 'OTHER' | 'ALL';
  status?: 'ACTIVE' | 'COMPLETED' | 'ALL';
  pi?: string;
  orgTypes?: string[];
  categoryIds?: number[];
};

export type AssistantAction =
  | { type: 'apply_search'; filters: ApplySearchFilters }
  | { type: 'open_project'; projectId: number };

export type ChatResponseDto = {
  message: string;
  actions: AssistantAction[];
};
