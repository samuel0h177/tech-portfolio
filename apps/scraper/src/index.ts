import { PrismaClient, ProgramFlag, OrganizationType } from '@prisma/client';
import { GEN_CATEGORIES, ORG_TYPE_FACETS, SUBCATEGORIES } from './config';
import { getQuadChartInfo, postSearch } from './estoClient';
import { parseDocuments, parseRecordCount, parseResultsRows, ResultRow } from './parser';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_DOCS = args.includes('--skip-docs');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

const SEARCH_EVENT = 'ehQuadChart.search';

function log(...parts: unknown[]) {
  console.log(`[scraper]`, ...parts);
}

/** Full catalog crawl for a given ESTO flag. */
async function crawlFlag(flag: 'E' | 'O'): Promise<ResultRow[]> {
  const html = await postSearch(SEARCH_EVENT, {
    ESTO_search_flag: flag,
    project_status: 'B',
    sortby: 'program_name',
    sortOrder: 'ASC',
  });
  const count = parseRecordCount(html);
  const rows = parseResultsRows(html);
  log(`flag=${flag}: site reports ${count} records, parsed ${rows.length} rows`);
  return rows;
}

async function crawlCategory(param: { gen?: number; sub?: string }): Promise<number[]> {
  const params: Record<string, string | string[]> = {
    ESTO_search_flag: 'B',
    project_status: 'B',
    sortby: 'program_name',
    sortOrder: 'ASC',
  };
  if (param.sub) params.tech_category_id = param.sub;
  if (param.gen) params.gen_tech_category_id = String(param.gen);
  const html = await postSearch(SEARCH_EVENT, params);
  return uniqueInternalIds(parseResultsRows(html));
}

async function crawlOrgType(centerLuId: number): Promise<number[]> {
  const html = await postSearch(SEARCH_EVENT, {
    ESTO_search_flag: 'B',
    project_status: 'B',
    center_lu_id: String(centerLuId),
    sortby: 'program_name',
    sortOrder: 'ASC',
  });
  return uniqueInternalIds(parseResultsRows(html));
}

function uniqueInternalIds(rows: ResultRow[]): number[] {
  const set = new Set<number>();
  for (const r of rows) if (r.internalId != null) set.add(r.internalId);
  return [...set];
}

async function upsertOrganization(name: string | null): Promise<number | null> {
  if (!name) return null;
  const org = await prisma.organization.upsert({
    where: { name },
    update: {},
    create: { name },
  });
  return org.id;
}

async function upsertPi(row: ResultRow): Promise<number | null> {
  if (!row.firstName && !row.lastName) return null;
  const pi = await prisma.principalInvestigator.upsert({
    where: {
      pi_identity: {
        firstName: row.firstName ?? '',
        lastName: row.lastName ?? '',
        orgCenter: row.orgCenter ?? '',
      },
    },
    update: {},
    create: {
      firstName: row.firstName ?? '',
      lastName: row.lastName ?? '',
      orgCenter: row.orgCenter,
    },
  });
  return pi.id;
}

async function upsertProject(row: ResultRow, flag: ProgramFlag): Promise<number> {
  const [piId, organizationId] = await Promise.all([upsertPi(row), upsertOrganization(row.orgCenter)]);

  const data = {
    sourceInternalId: row.internalId,
    programFlag: flag,
    programName: row.programName,
    projectCode: row.projectCode,
    title: row.title,
    completed: row.completed,
    statusText: row.statusText,
    completionFy: row.completionFy,
    quadChartUrl: row.quadChartUrl,
    piId,
    organizationId,
  };

  const project = await prisma.project.upsert({
    where: {
      project_identity: {
        projectCode: row.projectCode ?? '',
        sourceInternalId: row.internalId ?? 0,
      },
    },
    update: data,
    create: data,
  });
  return project.id;
}

async function main() {
  log(`Starting crawl${DRY_RUN ? ' (dry run)' : ''}. limit=${LIMIT}, skipDocs=${SKIP_DOCS}`);

  // 1. Full catalog by flag (also establishes ESTO vs OTHER).
  const estoRows = await crawlFlag('E');
  const otherRows = await crawlFlag('O');

  // internalId -> { row, flag } (last write wins; distinct internalIds are distinct records)
  const byId = new Map<number, { row: ResultRow; flag: ProgramFlag }>();
  for (const row of estoRows) if (row.internalId != null) byId.set(row.internalId, { row, flag: ProgramFlag.ESTO });
  for (const row of otherRows) if (row.internalId != null && !byId.has(row.internalId)) byId.set(row.internalId, { row, flag: ProgramFlag.OTHER });

  log(`Total distinct projects: ${byId.size}`);

  if (DRY_RUN) {
    const sample = [...byId.values()].slice(0, 5).map((v) => v.row);
    console.dir(sample, { depth: null });
    await prisma.$disconnect();
    return;
  }

  // Load tech categories for mapping.
  const categories = await prisma.techCategory.findMany();
  const topLevelByName = new Map<string, number>();
  const byLegacy = new Map<string, number>();
  for (const c of categories) {
    if (c.parentId == null && c.legacyGenId != null) topLevelByName.set(c.name.toLowerCase(), c.id);
    if (c.legacyGenId != null && c.legacySubId != null) byLegacy.set(`${c.legacyGenId}_${c.legacySubId}`, c.id);
  }

  // 2. Upsert projects (+ PI, org, top-level category).
  const internalToProjectId = new Map<number, number>();
  let processed = 0;
  for (const [internalId, { row, flag }] of byId) {
    if (processed >= LIMIT) break;
    const projectId = await upsertProject(row, flag);
    internalToProjectId.set(internalId, projectId);

    if (row.techCategory) {
      for (const name of row.techCategory.split(',').map((s) => s.trim().toLowerCase())) {
        const catId = topLevelByName.get(name);
        if (catId) {
          await prisma.projectTechCategory.upsert({
            where: { projectId_categoryId: { projectId, categoryId: catId } },
            update: {},
            create: { projectId, categoryId: catId },
          });
        }
      }
    }
    processed++;
    if (processed % 100 === 0) log(`Upserted ${processed} projects...`);
  }
  log(`Upserted ${processed} projects.`);

  // 3. Sub-category enrichment.
  for (const sub of SUBCATEGORIES) {
    const catId = byLegacy.get(sub.param);
    if (!catId) continue;
    const ids = await crawlCategory({ sub: sub.param });
    let linked = 0;
    for (const internalId of ids) {
      const projectId = internalToProjectId.get(internalId);
      if (!projectId) continue;
      await prisma.projectTechCategory.upsert({
        where: { projectId_categoryId: { projectId, categoryId: catId } },
        update: {},
        create: { projectId, categoryId: catId },
      });
      // ensure parent is linked too
      const parentId = byLegacy.get(`${sub.genId}_0`) ?? topLevelByNameForGen(categories, sub.genId);
      if (parentId) {
        await prisma.projectTechCategory.upsert({
          where: { projectId_categoryId: { projectId, categoryId: parentId } },
          update: {},
          create: { projectId, categoryId: parentId },
        });
      }
      linked++;
    }
    log(`Sub-category ${sub.param}: linked ${linked} projects.`);
  }

  // 4. General-category enrichment (covers projects whose leaf wasn't captured).
  for (const gen of GEN_CATEGORIES) {
    const catId = byLegacy.get(`${gen.genId}_0`);
    if (!catId) continue;
    const ids = await crawlCategory({ gen: gen.genId });
    let linked = 0;
    for (const internalId of ids) {
      const projectId = internalToProjectId.get(internalId);
      if (!projectId) continue;
      await prisma.projectTechCategory.upsert({
        where: { projectId_categoryId: { projectId, categoryId: catId } },
        update: {},
        create: { projectId, categoryId: catId },
      });
      linked++;
    }
    log(`Gen-category ${gen.name}: linked ${linked} projects.`);
  }

  // 5. Organization-type enrichment.
  for (const facet of ORG_TYPE_FACETS) {
    const ids = await crawlOrgType(facet.centerLuId);
    const orgIds = new Set<number>();
    for (const internalId of ids) {
      const projectId = internalToProjectId.get(internalId);
      if (!projectId) continue;
      const project = await prisma.project.findUnique({ where: { id: projectId }, select: { organizationId: true } });
      if (project?.organizationId) orgIds.add(project.organizationId);
    }
    if (orgIds.size) {
      await prisma.organization.updateMany({
        where: { id: { in: [...orgIds] } },
        data: { type: facet.type as OrganizationType },
      });
    }
    log(`Org type ${facet.type}: tagged ${orgIds.size} organizations.`);
  }

  // 6. Supporting documents per project.
  if (!SKIP_DOCS) {
    let docCount = 0;
    let done = 0;
    for (const [internalId, projectId] of internalToProjectId) {
      const html = await getQuadChartInfo(internalId);
      const docs = parseDocuments(html);
      if (docs.length) {
        await prisma.projectDocument.deleteMany({ where: { projectId } });
        await prisma.projectDocument.createMany({
          data: docs.map((d) => ({
            projectId,
            fileName: d.fileName,
            fileSize: d.fileSize,
            lastModified: d.lastModified,
            url: d.url,
          })),
        });
        docCount += docs.length;
      }
      done++;
      if (done % 100 === 0) log(`Documents: processed ${done}/${internalToProjectId.size} projects, ${docCount} docs`);
    }
    log(`Documents: ${docCount} total across ${internalToProjectId.size} projects.`);
  }

  log('Crawl complete.');
  await prisma.$disconnect();
}

function topLevelByNameForGen(
  categories: { id: number; parentId: number | null; legacyGenId: number | null; legacySubId: number | null }[],
  genId: number,
): number | undefined {
  return categories.find((c) => c.parentId == null && c.legacyGenId === genId && c.legacySubId === 0)?.id;
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
