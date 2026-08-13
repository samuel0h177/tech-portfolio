import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { ProjectsService } from '../projects/projects.service';
import { PrismaService } from '../prisma/prisma.service';
import type { SearchQueryDto } from '../projects/dto/search-query.dto';
import type {
  ApplySearchFilters,
  AssistantAction,
  AssistantProgress,
  ChatRequestDto,
  ChatResponseDto,
} from './dto/chat.dto';

const MAX_TOOL_ROUNDS = 6;
/** Keep chat short — local models often have 4k–8k context once tools are included. */
const MAX_HISTORY_MESSAGES = 6;
/** Soft cap on serialized tool results pushed back into the prompt. */
const MAX_TOOL_RESULT_CHARS = 2800;
/** Approx char budget for message bodies (tools schema is extra). Override with LM_STUDIO_MAX_CONTEXT_CHARS. */
const DEFAULT_CONTEXT_CHARS = 12_000;

// const SYSTEM_INSTRUCTION = `You are the ESTO Technology Portfolio Help Agent for NASA's Earth Science Technology Office demo site.

// You help visitors explore sensor, information system, platform, and computational technology projects.

// Rules:
// - Use tools to look up real portfolio data. Never invent project IDs, titles, PIs, or counts.
// - When the user wants to browse or filter results on the site, call apply_search so the UI updates, then briefly explain what you applied.
// - When the user asks about a specific project, use get_project (or search_projects first), then answer from the returned data. Use open_project when they want to view it on the site.
// - If a "current project" context is provided, prefer answering about that project unless the user clearly asks about something else.
// - Prefer concise, plain-language answers. Mention project codes and titles when listing matches.
// - If search returns zero results, say so and suggest broader keywords or clearing filters.
// - You only know this portfolio — decline unrelated requests politely.`;
const SYSTEM_INSTRUCTION = 'You are a very old and wise scientist who has worked for Edison and wants to share his knowledge with the world. You will speak poetically and in a way that is easy to understand.'

/** OpenAI-compatible tool definitions for LM Studio (/v1/chat/completions). */
const TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_projects',
      description:
        'Search the ESTO technology portfolio. Returns matching project summaries and total count.',
      parameters: {
        type: 'object',
        properties: {
          q: {
            type: 'string',
            description:
              'Keyword query. Supports +term, -term, term*, OR, and "phrases". Example: lidar OR radar',
          },
          program: {
            type: 'string',
            description: 'ESTO, OTHER, or ALL',
            enum: ['ESTO', 'OTHER', 'ALL'],
          },
          status: {
            type: 'string',
            description: 'ACTIVE, COMPLETED, or ALL',
            enum: ['ACTIVE', 'COMPLETED', 'ALL'],
          },
          pi: {
            type: 'string',
            description: 'Principal investigator name fragment, e.g. "Mlynczak" or "Smith, John"',
          },
          orgTypes: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['ACADEMIA', 'INDUSTRY', 'NASA_CENTER', 'FEDERAL_LAB'],
            },
            description: 'Organization type filters',
          },
          categoryIds: {
            type: 'array',
            items: { type: 'integer' },
            description: 'Technology category IDs from list_categories',
          },
          categoryNames: {
            type: 'array',
            items: { type: 'string' },
            description: 'Category name fragments to resolve via list_categories',
          },
          pageSize: {
            type: 'integer',
            description: 'How many project summaries to return (max 8)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_project',
      description: 'Fetch full details for one project by numeric id (includes abstract and team).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer', description: 'Project id' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_categories',
      description: 'List technology categories and sub-categories with ids for filtering.',
      parameters: {
        type: 'object',
        properties: {
          q: {
            type: 'string',
            description: 'Optional name filter, e.g. "lidar" or "instrument"',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_search',
      description:
        'Update the on-site search UI with these filters so the visitor sees matching results. Call this when the user asks to search, show, filter, or find projects on the page.',
      parameters: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Keyword query to put in the search box' },
          program: {
            type: 'string',
            enum: ['ESTO', 'OTHER', 'ALL'],
          },
          status: {
            type: 'string',
            enum: ['ACTIVE', 'COMPLETED', 'ALL'],
          },
          pi: {
            type: 'string',
            description: 'PI filter text, ideally "Last, First"',
          },
          orgTypes: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['ACADEMIA', 'INDUSTRY', 'NASA_CENTER', 'FEDERAL_LAB'],
            },
          },
          categoryIds: {
            type: 'array',
            items: { type: 'integer' },
          },
          categoryNames: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_project',
      description: 'Open a project detail page in the UI for the visitor.',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'integer' },
        },
        required: ['projectId'],
      },
    },
  },
];

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private client: OpenAI | null = null;

  constructor(
    private readonly projects: ProjectsService,
    private readonly prisma: PrismaService,
  ) {}

  private getProvider(): string {
    return (process.env.LLM_PROVIDER || 'lmstudio').trim().toLowerCase();
  }

  private getModel(): string {
    const model = process.env.LM_STUDIO_MODEL?.trim();
    if (!model) {
      throw new ServiceUnavailableException(
        'Help agent is not configured. Set LM_STUDIO_MODEL to the model id loaded in LM Studio.',
      );
    }
    return model;
  }

  private getClient(): OpenAI {
    const provider = this.getProvider();
    if (provider !== 'lmstudio') {
      throw new ServiceUnavailableException(
        `Unsupported LLM_PROVIDER="${provider}". Use LLM_PROVIDER=lmstudio with a local LM Studio server.`,
      );
    }

    if (!this.client) {
      const baseURL = process.env.LM_STUDIO_BASE_URL?.trim() || 'http://127.0.0.1:1234/v1';
      const apiKey = process.env.LM_STUDIO_API_TOKEN?.trim() || 'lm-studio';
      this.logger.log(`LM Studio client ready (baseURL=${baseURL}, model=${this.getModel()})`);
      this.client = new OpenAI({
        baseURL,
        apiKey,
        timeout: 420_000,
      });
    }
    return this.client;
  }

  private isAbortError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const name = 'name' in err ? String((err as { name: unknown }).name) : '';
    return name === 'AbortError' || name === 'APIUserAbortError';
  }

  private formatLlmError(err: unknown): string {
    if (!(err instanceof Error)) return String(err);
    const parts = [err.message];
    const anyErr = err as Error & { cause?: unknown; code?: string; status?: number };
    if (anyErr.code) parts.push(`code=${anyErr.code}`);
    if (anyErr.status) parts.push(`status=${anyErr.status}`);
    const cause = anyErr.cause;
    if (cause instanceof Error) {
      parts.push(`cause=${cause.message}`);
      const code = (cause as NodeJS.ErrnoException).code;
      if (code) parts.push(`causeCode=${code}`);
    } else if (cause != null) {
      parts.push(`cause=${String(cause)}`);
    }
    return parts.join(' | ');
  }

  async chat(
    dto: ChatRequestDto,
    onProgress?: AssistantProgress,
    signal?: AbortSignal,
  ): Promise<ChatResponseDto> {
    if (!dto.messages?.length) {
      throw new BadRequestException('messages required');
    }
    const last = dto.messages[dto.messages.length - 1];
    if (last.role !== 'user') {
      throw new BadRequestException('Last message must be from the user');
    }

    const emit: AssistantProgress = (event) => {
      try {
        onProgress?.(event);
      } catch (err) {
        this.logger.warn(`progress listener failed: ${err instanceof Error ? err.message : err}`);
      }
    };

    const model = this.getModel();
    const client = this.getClient();
    const actions: AssistantAction[] = [];
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      ...this.buildContextMessages(dto),
      ...this.toChatMessages(dto),
    ];
    this.fitMessagesToBudget(messages);
    emit({ type: 'status', message: 'Reading your question…' });

    const abortedResult = (): ChatResponseDto => ({ message: '', actions });

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (signal?.aborted) {
        this.logger.log('chat aborted by client');
        return abortedResult();
      }
      this.fitMessagesToBudget(messages);
      const est = this.estimateMessageChars(messages);
      this.logger.log(
        `LM Studio round ${round + 1}/${MAX_TOOL_ROUNDS} messages=${messages.length} ~chars=${est}`,
      );
      emit({
        type: 'status',
        message:
          round === 0
            ? 'Asking the local model…'
            : `Continuing with tool results (step ${round + 1})…`,
      });

      let assembled: Awaited<ReturnType<AssistantService['streamCompletion']>>;
      try {
        assembled = await this.streamCompletion(client, model, messages, emit, signal);
      } catch (err) {
        if (signal?.aborted || this.isAbortError(err)) {
          this.logger.log('chat aborted by client');
          return abortedResult();
        }
        const detail = this.formatLlmError(err);
        this.logger.error(`LM Studio chat.completions failed: ${detail}`, err instanceof Error ? err.stack : undefined);
        const unreachable =
          /ECONNREFUSED|ENOTFOUND|fetch failed|Connect Timeout|Connection error|ECONNRESET/i.test(
            detail,
          );
        if (unreachable) {
          throw new ServiceUnavailableException(
            `Cannot reach LM Studio at ${process.env.LM_STUDIO_BASE_URL || 'http://127.0.0.1:1234/v1'}. ` +
              'Start the server (lms server start), load a tool-capable model, and set LM_STUDIO_MODEL. ' +
              `Details: ${detail}`,
          );
        }
        if (/Context size has been exceeded/i.test(detail)) {
          if (round === 0 && messages.length > 2) {
            this.logger.warn('Context exceeded — retrying with system + latest user message only');
            emit({ type: 'status', message: 'Context was full — retrying with a shorter prompt…' });
            const latestUser = [...messages].reverse().find((m) => m.role === 'user');
            messages.length = 0;
            messages.push(
              { role: 'system', content: SYSTEM_INSTRUCTION },
              latestUser ?? { role: 'user', content: last.content },
            );
            round -= 1;
            continue;
          }
          throw new BadGatewayException(
            'The conversation is too long for this model’s context window. ' +
              'Clear the chat or load a model with a larger context in LM Studio. ' +
              `Details: ${detail}`,
          );
        }
        throw new BadGatewayException(`LM Studio API call failed: ${detail}`);
      }

      if (signal?.aborted) {
        this.logger.log('chat aborted by client');
        return abortedResult();
      }

      const { content, toolCalls } = assembled;

      if (!toolCalls.length) {
        const text = content.trim() || 'Sorry — I could not generate a response.';
        this.logger.log(`LM Studio finished with text (${text.length} chars), actions=${actions.length}`);
        const result = { message: text, actions };
        emit({ type: 'message', ...result });
        emit({ type: 'done' });
        return result;
      }

      this.logger.log(`LM Studio requested tools: ${toolCalls.map((t) => t.function.name).join(', ')}`);
      messages.push({
        role: 'assistant',
        content: content || null,
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        if (signal?.aborted) {
          this.logger.log('chat aborted by client');
          return abortedResult();
        }
        const name = call.function.name ?? '';
        let args: Record<string, unknown> = {};
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          args = {};
        }
        const label = this.toolStartLabel(name, args);
        emit({ type: 'tool_start', name, label, args });
        this.logger.debug(`tool ${name} args=${JSON.stringify(args)}`);
        let result: unknown;
        try {
          result = await this.executeTool(name, args, actions);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Tool ${name} failed: ${msg}`);
          result = { error: msg };
        }
        emit({ type: 'tool_done', name, summary: this.toolDoneSummary(name, result) });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: this.stringifyToolResult(result),
        });
      }
    }

    const fallback = {
      message:
        'I found relevant data but hit the tool-call limit. Try asking a more specific question.',
      actions,
    };
    emit({ type: 'message', ...fallback });
    emit({ type: 'done' });
    return fallback;
  }

  /**
   * Stream one LM Studio completion. Emits token/thinking_delta as chunks arrive.
   * If tool calls appear after content was streamed, emits reply_reset so the UI
   * can move the draft into the reasoning trace.
   */
  private async streamCompletion(
    client: OpenAI,
    model: string,
    messages: ChatCompletionMessageParam[],
    emit: AssistantProgress,
    signal?: AbortSignal,
  ): Promise<{
    content: string;
    reasoning: string;
    toolCalls: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
  }> {
    const stream = await client.chat.completions.create(
      {
        model,
        messages,
        tools: TOOLS,
        temperature: 0.3,
        stream: true,
      },
      { signal },
    );

    let content = '';
    let reasoning = '';
    let resetForTools = false;
    const toolAcc = new Map<number, { id: string; name: string; arguments: string }>();

    for await (const chunk of stream) {
      signal?.throwIfAborted();
      const delta = chunk.choices?.[0]?.delta as
        | {
            content?: string | null;
            reasoning_content?: string | null;
            reasoning?: string | null;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          }
        | undefined;
      if (!delta) continue;

      const reasoningPiece = delta.reasoning_content ?? delta.reasoning;
      if (reasoningPiece) {
        reasoning += reasoningPiece;
        emit({ type: 'thinking_delta', text: reasoningPiece });
      }

      if (delta.tool_calls?.length) {
        if (!resetForTools && content) {
          emit({ type: 'reply_reset' });
          resetForTools = true;
        }
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const cur = toolAcc.get(idx) ?? { id: '', name: '', arguments: '' };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.arguments += tc.function.arguments;
          toolAcc.set(idx, cur);
        }
      }

      if (delta.content) {
        content += delta.content;
        if (toolAcc.size > 0 || resetForTools) {
          emit({ type: 'thinking_delta', text: delta.content });
        } else {
          emit({ type: 'token', text: delta.content });
        }
      }
    }

    const toolCalls = [...toolAcc.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, t], i) => ({
        id: t.id || `call_${i}_${Date.now()}`,
        type: 'function' as const,
        function: { name: t.name, arguments: t.arguments },
      }));

    // Tools arrived only after a full content stream with no mid-stream tool deltas.
    if (toolCalls.length && content && !resetForTools) {
      emit({ type: 'reply_reset' });
    }

    return { content, reasoning, toolCalls };
  }

  private toolStartLabel(name: string, args: Record<string, unknown>): string {
    switch (name) {
      case 'search_projects': {
        const q = typeof args.q === 'string' && args.q.trim() ? ` for “${args.q.trim()}”` : '';
        return `Searching the portfolio${q}…`;
      }
      case 'get_project':
        return `Opening project details (#${args.id})…`;
      case 'list_categories': {
        const q = typeof args.q === 'string' && args.q.trim() ? ` matching “${args.q.trim()}”` : '';
        return `Listing technology categories${q}…`;
      }
      case 'apply_search':
        return 'Updating the search filters on the page…';
      case 'open_project':
        return `Opening project #${args.projectId} in the UI…`;
      default:
        return `Running ${name}…`;
    }
  }

  private toolDoneSummary(name: string, result: unknown): string {
    if (result && typeof result === 'object' && 'error' in result) {
      return `Failed: ${String((result as { error: unknown }).error)}`;
    }
    switch (name) {
      case 'search_projects': {
        const total =
          result && typeof result === 'object' && 'total' in result
            ? Number((result as { total: unknown }).total)
            : NaN;
        return Number.isFinite(total) ? `Found ${total} matching project(s)` : 'Search finished';
      }
      case 'get_project': {
        const title =
          result && typeof result === 'object' && 'title' in result
            ? String((result as { title: unknown }).title ?? '')
            : '';
        return title ? `Loaded “${title.slice(0, 80)}”` : 'Loaded project';
      }
      case 'list_categories': {
        const n = Array.isArray(result) ? result.length : 0;
        return `Got ${n} categor${n === 1 ? 'y' : 'ies'}`;
      }
      case 'apply_search':
        return 'Search UI update queued';
      case 'open_project':
        return 'Navigation queued';
      default:
        return 'Done';
    }
  }

  private getContextCharBudget(): number {
    const raw = process.env.LM_STUDIO_MAX_CONTEXT_CHARS?.trim();
    const n = raw ? Number(raw) : DEFAULT_CONTEXT_CHARS;
    return Number.isFinite(n) && n >= 4000 ? n : DEFAULT_CONTEXT_CHARS;
  }

  private estimateMessageChars(messages: ChatCompletionMessageParam[]): number {
    let n = 0;
    for (const m of messages) {
      if (typeof m.content === 'string') n += m.content.length;
      else if (m.content != null) n += JSON.stringify(m.content).length;
      if ('tool_calls' in m && m.tool_calls) n += JSON.stringify(m.tool_calls).length;
    }
    // Tool schemas also consume context in LM Studio.
    n += JSON.stringify(TOOLS).length;
    return n;
  }

  /** Drop oldest non-system turns until under budget (keeps assistant↔tool groups intact). */
  private fitMessagesToBudget(messages: ChatCompletionMessageParam[]): void {
    const budget = this.getContextCharBudget();
    while (messages.length > 2 && this.estimateMessageChars(messages) > budget) {
      // Always keep index 0 (system). Remove the next complete turn.
      const i = 1;
      const role = messages[i]?.role;
      if (role === 'assistant' && 'tool_calls' in messages[i] && messages[i].tool_calls?.length) {
        let j = i + 1;
        while (j < messages.length && messages[j].role === 'tool') j += 1;
        messages.splice(i, j - i);
        continue;
      }
      // user / plain assistant / context prelude
      messages.splice(i, 1);
    }
  }

  private stringifyToolResult(result: unknown): string {
    const raw = JSON.stringify(result);
    if (raw.length <= MAX_TOOL_RESULT_CHARS) return raw;
    return `${raw.slice(0, MAX_TOOL_RESULT_CHARS - 24)}…[truncated for context]`;
  }

  private toChatMessages(dto: ChatRequestDto): ChatCompletionMessageParam[] {
    const window = dto.messages.slice(-MAX_HISTORY_MESSAGES);
    return window.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));
  }

  /** Lightweight page hints only — full project bodies come from get_project when needed. */
  private buildContextMessages(dto: ChatRequestDto): ChatCompletionMessageParam[] {
    const blocks: string[] = [];

    if (dto.searchContext) {
      this.logger.debug(`searchContext=${JSON.stringify(dto.searchContext)}`);
      blocks.push(
        `[Current search UI context — not a user message]\n${JSON.stringify(dto.searchContext)}`,
      );
    }

    if (dto.projectContext?.id != null) {
      this.logger.debug(`projectContext id=${dto.projectContext.id}`);
      blocks.push(
        `[Current project the visitor is viewing — not a user message]\n` +
          JSON.stringify({
            id: dto.projectContext.id,
            title: dto.projectContext.title,
            projectCode: dto.projectContext.projectCode,
            hint: 'Call get_project for abstract/team if needed.',
          }),
      );
    }

    if (!blocks.length) return [];

    return [
      { role: 'user', content: blocks.join('\n\n') },
      {
        role: 'assistant',
        content: 'Understood. I will use tools against the live portfolio data and respect the current page context.',
      },
    ];
  }

  private async executeTool(
    name: string,
    args: Record<string, unknown>,
    actions: AssistantAction[],
  ): Promise<unknown> {
    switch (name) {
      case 'search_projects':
        return this.toolSearchProjects(args);
      case 'get_project':
        return this.toolGetProject(Number(args.id));
      case 'list_categories':
        return this.toolListCategories(typeof args.q === 'string' ? args.q : undefined);
      case 'apply_search':
        return this.toolApplySearch(args, actions);
      case 'open_project':
        return this.toolOpenProject(Number(args.projectId), actions);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  private async resolveCategoryIds(
    categoryIds?: unknown,
    categoryNames?: unknown,
  ): Promise<number[]> {
    const ids = new Set<number>();
    if (Array.isArray(categoryIds)) {
      for (const id of categoryIds) {
        const n = Number(id);
        if (Number.isFinite(n)) ids.add(n);
      }
    }
    if (Array.isArray(categoryNames) && categoryNames.length) {
      const cats = await this.prisma.techCategory.findMany({
        select: { id: true, name: true },
      });
      for (const raw of categoryNames) {
        const needle = String(raw).trim().toLowerCase();
        if (!needle) continue;
        for (const c of cats) {
          if (c.name.toLowerCase().includes(needle)) ids.add(c.id);
        }
      }
    }
    return [...ids];
  }

  private async toolSearchProjects(args: Record<string, unknown>) {
    const categoryIds = await this.resolveCategoryIds(args.categoryIds, args.categoryNames);
    const pageSize = Math.min(Math.max(Number(args.pageSize) || 5, 1), 8);
    const dto = {
      q: typeof args.q === 'string' ? args.q : undefined,
      program: (args.program as SearchQueryDto['program']) || 'ALL',
      status: (args.status as SearchQueryDto['status']) || 'ALL',
      pi: typeof args.pi === 'string' ? args.pi : undefined,
      orgTypes: Array.isArray(args.orgTypes) ? (args.orgTypes as string[]) : [],
      categoryIds,
      sortBy: 'relevance' as const,
      sortOrder: 'asc' as const,
      page: 1,
      pageSize,
    };
    const result = await this.projects.search(dto);
    return {
      total: result.total,
      pageSize: result.pageSize,
      projects: result.data.map((p) => ({
        id: p.id,
        projectCode: p.projectCode,
        title: p.title,
        program: p.programName || p.programFlag,
        status: p.completed ? 'COMPLETED' : 'ACTIVE',
        completionFy: p.completionFy,
        pi: p.pi ? `${p.pi.lastName}, ${p.pi.firstName}` : null,
        organization: p.organization?.name ?? null,
        categories: [...p.categories, ...p.subCategories].map((c) => c.name),
      })),
    };
  }

  private async toolGetProject(id: number) {
    if (!Number.isFinite(id)) return { error: 'Invalid project id' };
    const p = await this.projects.findOne(id);
    const abstract =
      p.abstract && p.abstract.length > 700
        ? `${p.abstract.slice(0, 700)}…`
        : p.abstract;
    return {
      id: p.id,
      projectCode: p.projectCode,
      title: p.title,
      program: p.programName || p.programFlag,
      status: p.completed ? 'COMPLETED' : 'ACTIVE',
      completionFy: p.completionFy,
      trlIn: p.trlIn,
      trlCurrent: p.trlCurrent,
      trlOut: p.trlOut,
      abstract,
      pi: p.pi ? `${p.pi.lastName}, ${p.pi.firstName}` : null,
      organization: p.organization
        ? { name: p.organization.name, type: p.organization.type }
        : null,
      categories: [...p.categories, ...p.subCategories].map((c) => c.name),
      investigators: p.investigators.map((i) => ({
        name: `${i.lastName}, ${i.firstName}`,
        role: i.role,
        organization: i.organization?.name ?? null,
      })),
    };
  }

  private async toolListCategories(q?: string) {
    const cats = await this.prisma.techCategory.findMany({
      orderBy: [{ parentId: 'asc' }, { dispOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, parentId: true, description: true },
    });
    const needle = q?.trim().toLowerCase();
    const filtered = needle
      ? cats.filter(
          (c) =>
            c.name.toLowerCase().includes(needle) ||
            (c.description ?? '').toLowerCase().includes(needle),
        )
      : cats;
    return filtered.slice(0, 40).map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
    }));
  }

  private async toolApplySearch(args: Record<string, unknown>, actions: AssistantAction[]) {
    const categoryIds = await this.resolveCategoryIds(args.categoryIds, args.categoryNames);
    const filters: ApplySearchFilters = {
      q: typeof args.q === 'string' ? args.q : '',
      program: (args.program as ApplySearchFilters['program']) || 'ALL',
      status: (args.status as ApplySearchFilters['status']) || 'ALL',
      pi: typeof args.pi === 'string' ? args.pi : '',
      orgTypes: Array.isArray(args.orgTypes) ? (args.orgTypes as string[]) : [],
      categoryIds,
    };

    actions.push({ type: 'apply_search', filters });
    return { applied: true, filters };
  }

  private toolOpenProject(projectId: number, actions: AssistantAction[]) {
    if (!Number.isFinite(projectId)) return { error: 'Invalid project id' };
    actions.push({ type: 'open_project', projectId });
    return { opened: true, projectId };
  }
}
