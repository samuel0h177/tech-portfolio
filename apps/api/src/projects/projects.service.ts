import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProgramFlag } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseQuery } from '../search/query-parser';
import { SearchQueryDto } from './dto/search-query.dto';

const VALID_ORG_TYPES = ['ACADEMIA', 'INDUSTRY', 'NASA_CENTER', 'FEDERAL_LAB'];

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build the list of SQL WHERE conditions for a search. `exclude` lets facet
   * counting drop a single dimension so each facet reflects the other filters.
   */
  private buildConditions(dto: SearchQueryDto, exclude: Set<string> = new Set()) {
    const parsed = parseQuery(dto.q);
    const conds: Prisma.Sql[] = [];
    let scoreExpr: Prisma.Sql = Prisma.sql`0`;

    if (parsed.booleanExpression && !exclude.has('text')) {
      scoreExpr = Prisma.sql`MATCH(p.title, p.abstract) AGAINST (${parsed.booleanExpression} IN BOOLEAN MODE)`;
      const like = `%${parsed.residualText}%`;
      conds.push(
        Prisma.sql`(${scoreExpr} OR p.project_code LIKE ${like} OR p.program_name LIKE ${like})`,
      );
    } else if (parsed.booleanExpression) {
      scoreExpr = Prisma.sql`MATCH(p.title, p.abstract) AGAINST (${parsed.booleanExpression} IN BOOLEAN MODE)`;
    }

    if (!exclude.has('program')) {
      if (dto.program === 'ESTO') conds.push(Prisma.sql`p.program_flag = ${ProgramFlag.ESTO}`);
      if (dto.program === 'OTHER') conds.push(Prisma.sql`p.program_flag = ${ProgramFlag.OTHER}`);
    }

    if (!exclude.has('status')) {
      if (dto.status === 'ACTIVE') conds.push(Prisma.sql`p.completed = 0`);
      if (dto.status === 'COMPLETED') conds.push(Prisma.sql`p.completed = 1`);
    }

    if (!exclude.has('category') && dto.categoryIds.length) {
      conds.push(
        Prisma.sql`EXISTS (SELECT 1 FROM project_tech_categories ptc WHERE ptc.project_id = p.id AND ptc.category_id IN (${Prisma.join(
          dto.categoryIds,
        )}))`,
      );
    }

    const orgTypes = dto.orgTypes.filter((t) => VALID_ORG_TYPES.includes(t));
    if (!exclude.has('orgType') && orgTypes.length) {
      conds.push(
        Prisma.sql`p.organization_id IN (SELECT o.id FROM organizations o WHERE o.type IN (${Prisma.join(
          orgTypes,
        )}))`,
      );
    }

    if (dto.pi) {
      const like = `%${dto.pi}%`;
      conds.push(
        Prisma.sql`p.pi_id IN (SELECT pi.id FROM investigators pi WHERE CONCAT(pi.last_name, ', ', pi.first_name) LIKE ${like} OR pi.first_name LIKE ${like} OR pi.last_name LIKE ${like})`,
      );
    }

    if (parsed.trl.in != null) conds.push(Prisma.sql`p.trl_in = ${parsed.trl.in}`);
    if (parsed.trl.current != null) conds.push(Prisma.sql`p.trl_current = ${parsed.trl.current}`);
    if (parsed.trl.out != null) conds.push(Prisma.sql`p.trl_out = ${parsed.trl.out}`);

    const whereSql = conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty;
    return { whereSql, scoreExpr, hasText: !!parsed.booleanExpression };
  }

  async search(dto: SearchQueryDto) {
    const { whereSql, scoreExpr, hasText } = this.buildConditions(dto);

    // Ordering.
    const dir = dto.sortOrder === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    let orderSql: Prisma.Sql;
    switch (dto.sortBy) {
      case 'title':
        orderSql = Prisma.sql`p.title ${dir}`;
        break;
      case 'projectCode':
        orderSql = Prisma.sql`p.project_code ${dir}`;
        break;
      case 'completionFy':
        orderSql = Prisma.sql`p.completion_fy ${dir}, p.title ASC`;
        break;
      case 'program':
        orderSql = Prisma.sql`p.program_name ${dir}, p.title ASC`;
        break;
      case 'pi':
        orderSql = Prisma.sql`pi.last_name ${dir}, pi.first_name ${dir}`;
        break;
      case 'relevance':
      default:
        orderSql = hasText
          ? Prisma.sql`${scoreExpr} DESC, p.title ASC`
          : Prisma.sql`p.program_name ASC, p.title ASC`;
        break;
    }

    const offset = (dto.page - 1) * dto.pageSize;

    const idRows = await this.prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
      SELECT p.id
      FROM projects p
      LEFT JOIN investigators pi ON pi.id = p.pi_id
      ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ${dto.pageSize} OFFSET ${offset}
    `);

    const countRows = await this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM projects p
      LEFT JOIN investigators pi ON pi.id = p.pi_id
      ${whereSql}
    `);
    const total = Number(countRows[0]?.total ?? 0);

    const ids = idRows.map((r) => r.id);
    const rows = ids.length ? await this.hydrate(ids) : [];

    return {
      data: rows,
      total,
      page: dto.page,
      pageSize: dto.pageSize,
      totalPages: Math.ceil(total / dto.pageSize),
    };
  }

  private async hydrate(ids: number[]) {
    const projects = await this.prisma.project.findMany({
      where: { id: { in: ids } },
      include: {
        pi: true,
        organization: true,
        categories: { include: { category: true } },
      },
    });
    const order = new Map(ids.map((id, i) => [id, i]));
    projects.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return projects.map((p) => this.toListItem(p));
  }

  private toListItem(p: any) {
    return {
      id: p.id,
      programFlag: p.programFlag,
      programName: p.programName,
      projectCode: p.projectCode,
      title: p.title,
      completed: p.completed,
      statusText: p.statusText,
      completionFy: p.completionFy,
      quadChartUrl: p.quadChartUrl,
      pi: p.pi
        ? { id: p.pi.id, firstName: p.pi.firstName, lastName: p.pi.lastName, orgCenter: p.pi.orgCenter }
        : null,
      organization: p.organization
        ? { id: p.organization.id, name: p.organization.name, type: p.organization.type }
        : null,
      categories: p.categories
        .map((c: any) => ({ id: c.category.id, name: c.category.name, parentId: c.category.parentId }))
        .filter((c: any) => c.parentId == null),
      subCategories: p.categories
        .map((c: any) => ({ id: c.category.id, name: c.category.name, parentId: c.category.parentId }))
        .filter((c: any) => c.parentId != null),
    };
  }

  /** Contextual facet counts: each dimension excludes its own filter. */
  async facets(dto: SearchQueryDto) {
    // Programs
    const programWhere = this.buildConditions(dto, new Set(['program'])).whereSql;
    const programRows = await this.prisma.$queryRaw<{ program_flag: string; total: bigint }[]>(Prisma.sql`
      SELECT p.program_flag, COUNT(*) AS total FROM projects p ${programWhere} GROUP BY p.program_flag
    `);

    // Status
    const statusWhere = this.buildConditions(dto, new Set(['status'])).whereSql;
    const statusRows = await this.prisma.$queryRaw<{ completed: number; total: bigint }[]>(Prisma.sql`
      SELECT p.completed, COUNT(*) AS total FROM projects p ${statusWhere} GROUP BY p.completed
    `);

    // Organization types
    const orgWhere = this.buildConditions(dto, new Set(['orgType'])).whereSql;
    const orgRows = await this.prisma.$queryRaw<{ type: string | null; total: bigint }[]>(Prisma.sql`
      SELECT o.type, COUNT(*) AS total
      FROM projects p
      JOIN organizations o ON o.id = p.organization_id
      ${orgWhere}
      GROUP BY o.type
    `);

    // Tech categories (counts per category, excluding the category filter)
    const catWhere = this.buildConditions(dto, new Set(['category'])).whereSql;
    const catRows = await this.prisma.$queryRaw<{ category_id: number; total: bigint }[]>(Prisma.sql`
      SELECT ptc.category_id, COUNT(DISTINCT p.id) AS total
      FROM projects p
      JOIN project_tech_categories ptc ON ptc.project_id = p.id
      ${catWhere}
      GROUP BY ptc.category_id
    `);
    const catCounts = new Map(catRows.map((r) => [r.category_id, Number(r.total)]));

    const categories = await this.prisma.techCategory.findMany({ orderBy: { id: 'asc' } });
    const categoryTree = categories
      .filter((c) => c.parentId == null)
      .map((parent) => ({
        id: parent.id,
        name: parent.name,
        count: catCounts.get(parent.id) ?? 0,
        children: categories
          .filter((c) => c.parentId === parent.id)
          .map((child) => ({ id: child.id, name: child.name, count: catCounts.get(child.id) ?? 0 })),
      }));

    const programMap = new Map(programRows.map((r) => [r.program_flag, Number(r.total)]));
    const statusMap = new Map(statusRows.map((r) => [Number(r.completed), Number(r.total)]));

    return {
      programs: [
        { value: 'ESTO', count: programMap.get('ESTO') ?? 0 },
        { value: 'OTHER', count: programMap.get('OTHER') ?? 0 },
      ],
      status: [
        { value: 'ACTIVE', count: statusMap.get(0) ?? 0 },
        { value: 'COMPLETED', count: statusMap.get(1) ?? 0 },
      ],
      orgTypes: ['ACADEMIA', 'INDUSTRY', 'NASA_CENTER', 'FEDERAL_LAB'].map((t) => ({
        value: t,
        count: Number(orgRows.find((r) => r.type === t)?.total ?? 0),
      })),
      categories: categoryTree,
    };
  }

  async findOne(id: number) {
    const p = await this.prisma.project.findUnique({
      where: { id },
      include: {
        pi: true,
        organization: true,
        categories: { include: { category: true } },
        investigators: {
          include: { investigator: true, organization: true },
          orderBy: [{ role: 'asc' }, { id: 'asc' }],
        },
        documents: true,
      },
    });
    if (!p) throw new NotFoundException(`Project ${id} not found`);
    return {
      ...this.toListItem(p),
      abstract: p.abstract,
      trlIn: p.trlIn,
      trlCurrent: p.trlCurrent,
      trlOut: p.trlOut,
      projectAbbrev: p.projectAbbrev,
      budgetCode: p.budgetCode,
      sourceInternalId: p.sourceInternalId,
      investigators: p.investigators.map((link) => ({
        id: link.investigator.id,
        firstName: link.investigator.firstName,
        middleName: link.investigator.middleName,
        lastName: link.investigator.lastName,
        title: link.investigator.title,
        role: link.role,
        organization: link.organization
          ? { id: link.organization.id, name: link.organization.name, type: link.organization.type }
          : null,
      })),
      documents: p.documents.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        fileSize: d.fileSize,
        lastModified: d.lastModified,
        url: d.url,
      })),
    };
  }
}
