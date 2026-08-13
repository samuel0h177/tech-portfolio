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

export class ProjectContextDto {
  @Type(() => Number)
  @IsInt()
  id!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  projectCode?: string;
}

export class ChatRequestDto {
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SearchContextDto)
  searchContext?: SearchContextDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProjectContextDto)
  projectContext?: ProjectContextDto;
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

/** Server-sent events from POST /assistant/chat/stream */
export type AssistantStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'thinking'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'token'; text: string }
  | { type: 'reply_reset' }
  | { type: 'tool_start'; name: string; label: string; args?: Record<string, unknown> }
  | { type: 'tool_done'; name: string; summary: string }
  | { type: 'message'; message: string; actions: AssistantAction[] }
  | { type: 'error'; message: string }
  | { type: 'done' };

export type AssistantProgress = (event: AssistantStreamEvent) => void;
