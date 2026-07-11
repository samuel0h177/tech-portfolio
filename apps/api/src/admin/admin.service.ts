import { Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationType, ProgramFlag } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddDocumentDto, UpsertProjectDto } from './dto/project.dto';
import { UpsertCategoryDto, UpsertOrganizationDto, UpsertPiDto } from './dto/reference.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Projects ----
  async listProjects(page = 1, pageSize = 25, q?: string) {
    const where = q
      ? { OR: [{ title: { contains: q } }, { projectCode: { contains: q } }] }
      : undefined;
    const [total, data] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { pi: true, organization: true, categories: { include: { category: true } } },
      }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  private projectData(dto: UpsertProjectDto) {
    return {
      programFlag: dto.programFlag as ProgramFlag,
      programName: dto.programName ?? null,
      projectCode: dto.projectCode ?? null,
      title: dto.title,
      abstract: dto.abstract ?? null,
      completed: dto.completed ?? false,
      statusText: dto.statusText ?? null,
      completionFy: dto.completionFy ?? null,
      trlIn: dto.trlIn ?? null,
      trlCurrent: dto.trlCurrent ?? null,
      trlOut: dto.trlOut ?? null,
      quadChartUrl: dto.quadChartUrl ?? null,
      piId: dto.piId ?? null,
      organizationId: dto.organizationId ?? null,
    };
  }

  async createProject(dto: UpsertProjectDto) {
    const project = await this.prisma.project.create({ data: this.projectData(dto) });
    if (dto.categoryIds?.length) await this.setCategories(project.id, dto.categoryIds);
    return this.prisma.project.findUnique({
      where: { id: project.id },
      include: { pi: true, organization: true, categories: { include: { category: true } } },
    });
  }

  async updateProject(id: number, dto: UpsertProjectDto) {
    await this.ensureProject(id);
    await this.prisma.project.update({ where: { id }, data: this.projectData(dto) });
    if (dto.categoryIds) await this.setCategories(id, dto.categoryIds);
    return this.prisma.project.findUnique({
      where: { id },
      include: { pi: true, organization: true, categories: { include: { category: true } }, documents: true },
    });
  }

  private async setCategories(projectId: number, categoryIds: number[]) {
    await this.prisma.projectTechCategory.deleteMany({ where: { projectId } });
    if (categoryIds.length) {
      await this.prisma.projectTechCategory.createMany({
        data: categoryIds.map((categoryId) => ({ projectId, categoryId })),
        skipDuplicates: true,
      });
    }
  }

  async deleteProject(id: number) {
    await this.ensureProject(id);
    await this.prisma.project.delete({ where: { id } });
    return { deleted: true, id };
  }

  private async ensureProject(id: number) {
    const exists = await this.prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException(`Project ${id} not found`);
  }

  // ---- Documents ----
  async addDocument(projectId: number, dto: AddDocumentDto) {
    await this.ensureProject(projectId);
    return this.prisma.projectDocument.create({
      data: { projectId, fileName: dto.fileName, url: dto.url, fileSize: dto.fileSize ?? null },
    });
  }

  async deleteDocument(id: number) {
    await this.prisma.projectDocument.delete({ where: { id } });
    return { deleted: true, id };
  }

  // ---- Investigators ----
  listPis() {
    return this.prisma.investigator.findMany({ orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
  }

  createPi(dto: UpsertPiDto) {
    return this.prisma.investigator.create({
      data: { firstName: dto.firstName, lastName: dto.lastName, orgCenter: dto.orgCenter ?? null },
    });
  }

  updatePi(id: number, dto: UpsertPiDto) {
    return this.prisma.investigator.update({
      where: { id },
      data: { firstName: dto.firstName, lastName: dto.lastName, orgCenter: dto.orgCenter ?? null },
    });
  }

  async deletePi(id: number) {
    await this.prisma.investigator.delete({ where: { id } });
    return { deleted: true, id };
  }

  // ---- Organizations ----
  listOrganizations() {
    return this.prisma.organization.findMany({ orderBy: { name: 'asc' } });
  }

  createOrganization(dto: UpsertOrganizationDto) {
    return this.prisma.organization.create({
      data: { name: dto.name, type: (dto.type as OrganizationType) ?? null },
    });
  }

  updateOrganization(id: number, dto: UpsertOrganizationDto) {
    return this.prisma.organization.update({
      where: { id },
      data: { name: dto.name, type: (dto.type as OrganizationType) ?? null },
    });
  }

  async deleteOrganization(id: number) {
    await this.prisma.organization.delete({ where: { id } });
    return { deleted: true, id };
  }

  // ---- Categories ----
  listCategories() {
    return this.prisma.techCategory.findMany({ orderBy: { id: 'asc' } });
  }

  createCategory(dto: UpsertCategoryDto) {
    return this.prisma.techCategory.create({
      data: { name: dto.name, parentId: dto.parentId ?? null },
    });
  }

  updateCategory(id: number, dto: UpsertCategoryDto) {
    return this.prisma.techCategory.update({
      where: { id },
      data: { name: dto.name, parentId: dto.parentId ?? null },
    });
  }

  async deleteCategory(id: number) {
    await this.prisma.techCategory.delete({ where: { id } });
    return { deleted: true, id };
  }
}
