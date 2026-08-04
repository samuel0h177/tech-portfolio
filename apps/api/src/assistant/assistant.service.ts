import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GoogleGenAI, Type } from '@google/genai';
import type { Content, FunctionDeclaration, Part } from '@google/genai';
import { ProjectsService } from '../projects/projects.service';
import { PrismaService } from '../prisma/prisma.service';
import type { SearchQueryDto } from '../projects/dto/search-query.dto';
import type {
  ApplySearchFilters,
  AssistantAction,
  ChatRequestDto,
  ChatResponseDto,
} from './dto/chat.dto';

const MODEL = 'gemini-3.6-flash';
const MAX_TOOL_ROUNDS = 6;

const SYSTEM_INSTRUCTION = `You are the ESTO Technology Portfolio Help Agent for NASA's Earth Science Technology Office demo site.

You help visitors explore sensor, information system, platform, and computational technology projects.

Rules:
- Use tools to look up real portfolio data. Never invent project IDs, titles, PIs, or counts.
- When the user wants to browse or filter results on the site, call apply_search so the UI updates, then briefly explain what you applied.
- When the user asks about a specific project, use get_project (or search_projects first), then answer from the returned data. Use open_project when they want to view it on the site.
- Prefer concise, plain-language answers. Mention project codes and titles when listing matches.
- If search returns zero results, say so and suggest broader keywords or clearing filters.
- You only know this portfolio — decline unrelated requests politely.`;

const TOOLS: FunctionDeclaration[] = [
  {
    name: 'search_projects',
    description:
      'Search the ESTO technology portfolio. Returns matching project summaries and total count.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        q: {
          type: Type.STRING,
          description:
            'Keyword query. Supports +term, -term, term*, OR, and "phrases". Example: lidar OR radar',
        },
        program: {
          type: Type.STRING,
          description: 'ESTO, OTHER, or ALL',
          enum: ['ESTO', 'OTHER', 'ALL'],
        },
        status: {
          type: Type.STRING,
          description: 'ACTIVE, COMPLETED, or ALL',
          enum: ['ACTIVE', 'COMPLETED', 'ALL'],
        },
        pi: {
          type: Type.STRING,
          description: 'Principal investigator name fragment, e.g. "Mlynczak" or "Smith, John"',
        },
        orgTypes: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            enum: ['ACADEMIA', 'INDUSTRY', 'NASA_CENTER', 'FEDERAL_LAB'],
          },
          description: 'Organization type filters',
        },
        categoryIds: {
          type: Type.ARRAY,
          items: { type: Type.INTEGER },
          description: 'Technology category IDs from list_categories',
        },
        categoryNames: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Category name fragments to resolve via list_categories',
        },
        pageSize: {
          type: Type.INTEGER,
          description: 'How many project summaries to return (max 15)',
        },
      },
    },
  },
  {
    name: 'get_project',
    description: 'Fetch full details for one project by numeric id (includes abstract and team).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.INTEGER, description: 'Project id' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_categories',
    description: 'List technology categories and sub-categories with ids for filtering.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        q: {
          type: Type.STRING,
          description: 'Optional name filter, e.g. "lidar" or "instrument"',
        },
      },
    },
  },
  {
    name: 'apply_search',
    description:
      'Update the on-site search UI with these filters so the visitor sees matching results. Call this when the user asks to search, show, filter, or find projects on the page.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        q: { type: Type.STRING, description: 'Keyword query to put in the search box' },
        program: {
          type: Type.STRING,
          enum: ['ESTO', 'OTHER', 'ALL'],
        },
        status: {
          type: Type.STRING,
          enum: ['ACTIVE', 'COMPLETED', 'ALL'],
        },
        pi: {
          type: Type.STRING,
          description: 'PI filter text, ideally "Last, First"',
        },
        orgTypes: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            enum: ['ACADEMIA', 'INDUSTRY', 'NASA_CENTER', 'FEDERAL_LAB'],
          },
        },
        categoryIds: {
          type: Type.ARRAY,
          items: { type: Type.INTEGER },
        },
        categoryNames: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
    },
  },
  {
    name: 'open_project',
    description: 'Open a project detail page in the UI for the visitor.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        projectId: { type: Type.INTEGER },
      },
      required: ['projectId'],
    },
  },
];

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private client: GoogleGenAI | null = null;

  constructor(
    private readonly projects: ProjectsService,
    private readonly prisma: PrismaService,
  ) {}

  private getClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      this.logger.error('GEMINI_API_KEY is missing or empty');
      throw new ServiceUnavailableException(
        'Help agent is not configured. Set GEMINI_API_KEY in the environment.',
      );
    }
    if (!this.client) {
      this.logger.log(
        `Gemini client ready (model=${MODEL}, keyLen=${apiKey.length}, keyPrefix=${apiKey.slice(0, 4)}…)`,
      );
      this.client = new GoogleGenAI({
        apiKey,
        // Default undici connect timeout is short; flaky routes to Google need more headroom.
        httpOptions: { timeout: 60_000 },
      });
    }
    return this.client;
  }

  private formatGeminiError(err: unknown): string {
    if (!(err instanceof Error)) return String(err);
    const parts = [err.message];
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) {
      parts.push(`cause=${cause.message}`);
      const code = (cause as NodeJS.ErrnoException).code;
      if (code) parts.push(`code=${code}`);
    } else if (cause != null) {
      parts.push(`cause=${String(cause)}`);
    }
    return parts.join(' | ');
  }

  async chat(dto: ChatRequestDto): Promise<ChatResponseDto> {
    if (!dto.messages?.length) {
      throw new BadRequestException('messages required');
    }
    const last = dto.messages[dto.messages.length - 1];
    if (last.role !== 'user') {
      throw new BadRequestException('Last message must be from the user');
    }

    const ai = this.getClient();
    const actions: AssistantAction[] = [];
    const contents: Content[] = this.toGeminiContents(dto);

    if (dto.searchContext) {
      this.logger.debug(`searchContext=${JSON.stringify(dto.searchContext)}`);
      contents.unshift({
        role: 'user',
        parts: [
          {
            text:
              `[Current search UI context — not a user message]\n` +
              JSON.stringify(dto.searchContext),
          },
        ],
      });
      contents.splice(1, 0, {
        role: 'model',
        parts: [{ text: 'Understood. I will use tools against the live portfolio data.' }],
      });
    }

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      this.logger.log(`Gemini round ${round + 1}/${MAX_TOOL_ROUNDS} contents=${contents.length}`);
      let response;
      try {
        response = await ai.models.generateContent({
          model: MODEL,
          contents,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: [{ functionDeclarations: TOOLS }],
            temperature: 0.3,
          },
        });
      } catch (err) {
        const detail = this.formatGeminiError(err);
        this.logger.error(`Gemini generateContent failed: ${detail}`, err instanceof Error ? err.stack : undefined);
        throw new BadGatewayException(
          `Gemini API call failed: ${detail}. Outbound HTTPS to generativelanguage.googleapis.com may be blocked or timing out.`,
        );
      }

      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const functionCalls = parts.filter((p) => p.functionCall?.name);

      if (!functionCalls.length) {
        const text =
          parts
            .map((p) => p.text)
            .filter(Boolean)
            .join('\n')
            .trim() ||
          response.text?.trim() ||
          'Sorry — I could not generate a response.';
        this.logger.log(`Gemini finished with text (${text.length} chars), actions=${actions.length}`);
        return { message: text, actions };
      }

      this.logger.log(
        `Gemini requested tools: ${functionCalls.map((p) => p.functionCall?.name).join(', ')}`,
      );
      contents.push({ role: 'model', parts });

      const functionResponseParts: Part[] = [];
      for (const part of functionCalls) {
        const call = part.functionCall!;
        const name = call.name!;
        const args = (call.args ?? {}) as Record<string, unknown>;
        this.logger.debug(`tool ${name} args=${JSON.stringify(args)}`);
        try {
          const result = await this.executeTool(name, args, actions);
          functionResponseParts.push({
            functionResponse: {
              name,
              id: call.id,
              response: { result },
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Tool ${name} failed: ${message}`);
          functionResponseParts.push({
            functionResponse: {
              name,
              id: call.id,
              response: { error: message },
            },
          });
        }
      }
      contents.push({ role: 'user', parts: functionResponseParts });
    }

    return {
      message:
        'I found relevant data but hit the tool-call limit. Try asking a more specific question.',
      actions,
    };
  }

  private toGeminiContents(dto: ChatRequestDto): Content[] {
    // Keep a short window to control tokens.
    const window = dto.messages.slice(-12);
    return window.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
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
    const pageSize = Math.min(Math.max(Number(args.pageSize) || 8, 1), 15);
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
      p.abstract && p.abstract.length > 1200
        ? `${p.abstract.slice(0, 1200)}…`
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
    return filtered.slice(0, 80).map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      description: c.description
        ? c.description.length > 160
          ? `${c.description.slice(0, 160)}…`
          : c.description
        : null,
    }));
  }

  private async toolApplySearch(args: Record<string, unknown>, actions: AssistantAction[]) {
    const categoryIds = await this.resolveCategoryIds(args.categoryIds, args.categoryNames);
    // Full replacement so a new topical search does not leave stale facet filters.
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
