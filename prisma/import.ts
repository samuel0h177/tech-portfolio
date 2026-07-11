/**
 * ETL importer: loads the authoritative ESTO `techportfolio` MySQL database into
 * our `esto_portfolio` schema. Idempotent and re-runnable.
 *
 * - Reads the original DB via SOURCE_DATABASE_URL (read-only).
 * - Writes via Prisma into DATABASE_URL.
 * - Project rows are upserted by their source INVESTMENT_ID (sourceInternalId), so
 *   IDs stay stable and previously scraped `project_documents` remain attached.
 * - Taxonomy, investigators, organizations and all link tables are rebuilt from source.
 */
import { InvestigatorRole, OrganizationType, PrismaClient, ProgramFlag } from '@prisma/client';
import mysql, { RowDataPacket } from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const ESTO_BASE_URL = process.env.ESTO_BASE_URL ?? 'https://esto.nasa.gov/TechPortfolio';

/** center_lu root id -> our organization type. */
const ORG_TYPE_BY_ROOT: Record<number, OrganizationType> = {
  6: OrganizationType.ACADEMIA,
  37: OrganizationType.INDUSTRY,
  53: OrganizationType.NASA_CENTER,
  29: OrganizationType.FEDERAL_LAB,
};

function log(...parts: unknown[]) {
  console.log('[import]', ...parts);
}

function toInt(v: unknown): number | null {
  if (v == null) return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Completion fiscal year, derived from the status label ("Project Complete FY12" -> 2012),
 * falling back to the raw YEAR_VALID when the status carries no FY.
 */
function completionFyFrom(statusName: string | undefined, yearValid: unknown): number | null {
  const m = statusName?.match(/FY(\d{2})/i);
  if (m) return 2000 + parseInt(m[1], 10);
  return toInt(yearValid);
}

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  if (!sourceUrl) throw new Error('SOURCE_DATABASE_URL is not set');

  const source = await mysql.createConnection(sourceUrl);
  log('Connected to source database.');

  // ---- 1. Read source tables ----
  const [statusRows] = await source.query<RowDataPacket[]>('SELECT * FROM proj_status_lu');
  const [centerRows] = await source.query<RowDataPacket[]>('SELECT * FROM center_lu');
  const [catRows] = await source.query<RowDataPacket[]>('SELECT * FROM tech_category_lu');
  const [genCatRows] = await source.query<RowDataPacket[]>('SELECT * FROM gen_tech_category_lu');
  const [invRows] = await source.query<RowDataPacket[]>('SELECT * FROM investigator_lu');
  const [projectRows] = await source.query<RowDataPacket[]>('SELECT * FROM investment');
  const [xrefInvestigators] = await source.query<RowDataPacket[]>('SELECT * FROM xref_invest_investigators');
  const [xrefCats] = await source.query<RowDataPacket[]>('SELECT * FROM xref_invest_tech_cat');
  log(
    `Read source: ${projectRows.length} investments, ${invRows.length} investigators, ` +
      `${centerRows.length} centers, ${catRows.length} categories, ` +
      `${xrefInvestigators.length} investigator links, ${xrefCats.length} category links.`,
  );

  const statusById = new Map<number, { name: string; completed: boolean }>();
  for (const s of statusRows) {
    statusById.set(s.PROJ_STATUS_ID, {
      name: s.PROJ_STATUS_NAME,
      completed: s.COMPLETED_FLAG === 'Y',
    });
  }

  // ---- 2. Clear derived/link tables and rebuildable lookups ----
  // Order respects FKs; deleting orgs/investigators nulls project references (SET NULL).
  await prisma.projectInvestigator.deleteMany();
  await prisma.projectTechCategory.deleteMany();
  await prisma.techCategory.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.investigator.deleteMany();
  log('Cleared link tables, categories, organizations, and investigators.');

  // ---- 3. Organizations (children of a type root) ----
  // organization.name is unique under a case-insensitive collation, so de-dupe on a
  // normalized key and point every duplicate source center at the surviving org id.
  const orgIdBySource = new Map<number, number>();
  const orgIdByNameKey = new Map<string, number>();
  for (const c of centerRows) {
    if (!c.CENTER_PARENT_ID || c.CENTER_PARENT_ID === 0) continue;
    const name = String(c.CENTER_NAME ?? '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const sourceId = c.CENTER_LU_ID as number;
    let orgId = orgIdByNameKey.get(key);
    if (orgId == null) {
      const row = await prisma.organization.create({
        data: { sourceId, name, type: ORG_TYPE_BY_ROOT[c.CENTER_PARENT_ID as number] ?? null },
      });
      orgId = row.id;
      orgIdByNameKey.set(key, orgId);
    }
    orgIdBySource.set(sourceId, orgId);
  }
  log(`Loaded ${orgIdByNameKey.size} organizations (${orgIdBySource.size} source centers mapped).`);

  // ---- 4. Investigators ----
  const investigatorIdBySource = new Map<number, number>();
  for (const p of invRows) {
    const row = await prisma.investigator.create({
      data: {
        sourceId: p.INVESTIGATOR_LU_ID,
        firstName: (p.FIRST_NAME ?? '').trim(),
        middleName: p.MIDDLE_NAME ? String(p.MIDDLE_NAME).trim() : null,
        lastName: (p.LAST_NAME ?? '').trim(),
        title: p.TITLE ? String(p.TITLE).trim() : null,
      },
    });
    investigatorIdBySource.set(p.INVESTIGATOR_LU_ID, row.id);
  }
  log(`Loaded ${investigatorIdBySource.size} investigators.`);

  // ---- 5. Tech categories (parents first, then children) ----
  const categoryIdBySource = new Map<number, number>();
  const parents = catRows.filter((c) => !c.TECH_CATEGORY_PARENT_ID || c.TECH_CATEGORY_PARENT_ID === 0);
  const children = catRows.filter((c) => c.TECH_CATEGORY_PARENT_ID && c.TECH_CATEGORY_PARENT_ID !== 0);
  for (const c of parents) {
    const row = await prisma.techCategory.create({
      data: {
        sourceId: c.TECH_CATEGORY_LU_ID,
        name: c.TECH_CATEGORY_NAME,
        description: c.TECH_CATEGORY_DESCRIP ?? null,
        dispOrder: c.DISP_ORDER_ID ?? null,
      },
    });
    categoryIdBySource.set(c.TECH_CATEGORY_LU_ID, row.id);
  }
  for (const c of children) {
    const parentId = categoryIdBySource.get(c.TECH_CATEGORY_PARENT_ID as number) ?? null;
    const row = await prisma.techCategory.create({
      data: {
        sourceId: c.TECH_CATEGORY_LU_ID,
        name: c.TECH_CATEGORY_NAME,
        description: c.TECH_CATEGORY_DESCRIP ?? null,
        dispOrder: c.DISP_ORDER_ID ?? null,
        parentId,
      },
    });
    categoryIdBySource.set(c.TECH_CATEGORY_LU_ID, row.id);
  }
  log(`Loaded ${categoryIdBySource.size} tech categories.`);

  // Helper maps for category linking:
  //  - parent category id per (child) source category
  //  - top-level category id by normalized name (to fold the general category in)
  const normalize = (s: string) => s.trim().toLowerCase().replace(/technologies$/, 'technology');
  const parentCatIdByChildSource = new Map<number, number>();
  for (const c of children) {
    const parentId = categoryIdBySource.get(c.TECH_CATEGORY_PARENT_ID as number);
    if (parentId) parentCatIdByChildSource.set(c.TECH_CATEGORY_LU_ID, parentId);
  }
  const topLevelIdByName = new Map<string, number>();
  for (const c of parents) {
    const id = categoryIdBySource.get(c.TECH_CATEGORY_LU_ID);
    if (id) topLevelIdByName.set(normalize(c.TECH_CATEGORY_NAME), id);
  }
  // gen_tech_category_lu id -> top-level category id (matched by name).
  const genCatIdToCategoryId = new Map<number, number>();
  for (const g of genCatRows) {
    const id = topLevelIdByName.get(normalize(g.GEN_TECH_CATEGORY_NAME));
    if (id) genCatIdToCategoryId.set(g.GEN_TECH_CATEGORY_ID, id);
  }

  // ---- 6. Primary PI (+ org) per investment, from the PI-typed xref rows ----
  const primaryByInvestment = new Map<number, { investigatorSource: number; centerSource: number | null }>();
  for (const x of xrefInvestigators) {
    if (x.INVESTIGATOR_TYPE_LU_ID !== 1 || x.INVESTIGATOR_LU_ID == null) continue;
    const existing = primaryByInvestment.get(x.INVESTMENT_ID);
    // Keep the lowest xref id as the canonical primary PI.
    if (!existing || x.QC_XREF_INVESTIGATOR_ID < (existing as any).xrefId) {
      primaryByInvestment.set(x.INVESTMENT_ID, {
        investigatorSource: x.INVESTIGATOR_LU_ID,
        centerSource: x.CENTER_LU_ID ?? null,
      });
      (primaryByInvestment.get(x.INVESTMENT_ID) as any).xrefId = x.QC_XREF_INVESTIGATOR_ID;
    }
  }

  // ---- 7. Upsert projects (stable IDs via sourceInternalId) ----
  const projectIdBySource = new Map<number, number>();
  let count = 0;
  for (const p of projectRows) {
    const status = p.PROJ_STATUS_ID ? statusById.get(p.PROJ_STATUS_ID) : undefined;
    const primary = primaryByInvestment.get(p.INVESTMENT_ID);
    const piId = primary ? investigatorIdBySource.get(primary.investigatorSource) ?? null : null;
    const organizationId = primary?.centerSource
      ? orgIdBySource.get(primary.centerSource) ?? null
      : null;
    const completionFy = completionFyFrom(status?.name, p.YEAR_VALID);

    const data = {
      sourceInternalId: p.INVESTMENT_ID as number,
      programFlag: p.ESTO_FLAG === 'E' ? ProgramFlag.ESTO : ProgramFlag.OTHER,
      programName: p.PROGRAM_NAME ?? null,
      projectCode: p.projectid ?? null,
      projectAbbrev: p.projectabbrev ?? null,
      budgetCode: p.ESTO_PROJ_NUM ?? null,
      title: p.PROJ_TITLE ?? '',
      completed: status?.completed ?? false,
      statusText: status?.name ?? null,
      yearValid: p.YEAR_VALID ? String(p.YEAR_VALID) : null,
      completionFy,
      trlIn: p.TRLIn ?? null,
      trlCurrent: p.TRLCurrent ?? null,
      trlOut: p.TRLOut ?? null,
      quadChartUrl: `${ESTO_BASE_URL}/pdf/quadCharts/${p.INVESTMENT_ID}.pdf`,
      piId,
      organizationId,
    };

    const row = await prisma.project.upsert({
      where: { sourceInternalId: p.INVESTMENT_ID as number },
      // abstract is intentionally left untouched (source has none).
      update: data,
      create: data,
    });
    projectIdBySource.set(p.INVESTMENT_ID, row.id);
    count++;
    if (count % 200 === 0) log(`Upserted ${count} projects...`);
  }
  log(`Upserted ${count} projects.`);

  // ---- 8. Project <-> category links ----
  // A project linked to a sub-category also belongs to its parent (general) category,
  // and the investment's GEN_TECH_CATEGORY_ID contributes its general category too. This
  // keeps parent-level facet counts and parent filtering accurate.
  const linkKeys = new Set<string>();
  const catLinks: { projectId: number; categoryId: number }[] = [];
  const addLink = (projectId: number | undefined, categoryId: number | undefined) => {
    if (!projectId || !categoryId) return;
    const key = `${projectId}:${categoryId}`;
    if (linkKeys.has(key)) return;
    linkKeys.add(key);
    catLinks.push({ projectId, categoryId });
  };

  for (const x of xrefCats) {
    const projectId = projectIdBySource.get(x.INVESTMENT_ID);
    const categoryId = categoryIdBySource.get(x.TECH_CATEGORY_LU_ID);
    addLink(projectId, categoryId);
    addLink(projectId, parentCatIdByChildSource.get(x.TECH_CATEGORY_LU_ID));
  }
  for (const p of projectRows) {
    if (p.GEN_TECH_CATEGORY_ID == null) continue;
    addLink(projectIdBySource.get(p.INVESTMENT_ID), genCatIdToCategoryId.get(p.GEN_TECH_CATEGORY_ID));
  }
  if (catLinks.length) {
    await prisma.projectTechCategory.createMany({ data: catLinks, skipDuplicates: true });
  }
  log(`Linked ${catLinks.length} project-category rows.`);

  // ---- 9. Project <-> investigator links (all roles) ----
  const invLinks: {
    sourceXrefId: number;
    projectId: number;
    investigatorId: number;
    role: InvestigatorRole;
    organizationId: number | null;
  }[] = [];
  for (const x of xrefInvestigators) {
    const projectId = projectIdBySource.get(x.INVESTMENT_ID);
    const investigatorId = x.INVESTIGATOR_LU_ID != null ? investigatorIdBySource.get(x.INVESTIGATOR_LU_ID) : undefined;
    if (!projectId || !investigatorId) continue;
    invLinks.push({
      sourceXrefId: x.QC_XREF_INVESTIGATOR_ID,
      projectId,
      investigatorId,
      role: x.INVESTIGATOR_TYPE_LU_ID === 2 ? InvestigatorRole.CO_INVESTIGATOR : InvestigatorRole.PRINCIPAL,
      organizationId: x.CENTER_LU_ID ? orgIdBySource.get(x.CENTER_LU_ID) ?? null : null,
    });
  }
  if (invLinks.length) {
    await prisma.projectInvestigator.createMany({ data: invLinks, skipDuplicates: true });
  }
  log(`Linked ${invLinks.length} project-investigator rows.`);

  await source.end();
  log('Import complete.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
