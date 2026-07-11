/**
 * Documents refresher.
 *
 * Core portfolio data (projects, investigators, organizations, taxonomy) is loaded
 * from the authoritative `techportfolio` database by the ETL importer (prisma/import.ts).
 * The original database has no documents table, so this tool refreshes the supporting
 * documents / quad-chart attachments for existing projects by crawling the live NASA site.
 *
 * Usage: npm run scrape [-- --limit=50 --dry-run]
 */
import { PrismaClient } from '@prisma/client';
import { getQuadChartInfo } from './estoClient';
import { parseDocuments } from './parser';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

function log(...parts: unknown[]) {
  console.log('[docs]', ...parts);
}

async function main() {
  log(`Refreshing documents${DRY_RUN ? ' (dry run)' : ''}. limit=${LIMIT}`);

  const projects = await prisma.project.findMany({
    where: { sourceInternalId: { not: null } },
    select: { id: true, sourceInternalId: true },
    orderBy: { id: 'asc' },
  });
  log(`Found ${projects.length} projects with a source id.`);

  let processed = 0;
  let docCount = 0;
  for (const project of projects) {
    if (processed >= LIMIT) break;
    const internalId = project.sourceInternalId as number;
    const html = await getQuadChartInfo(internalId);
    const docs = parseDocuments(html);

    if (!DRY_RUN && docs.length) {
      await prisma.projectDocument.deleteMany({ where: { projectId: project.id } });
      await prisma.projectDocument.createMany({
        data: docs.map((d) => ({
          projectId: project.id,
          fileName: d.fileName,
          fileSize: d.fileSize,
          lastModified: d.lastModified,
          url: d.url,
        })),
      });
    }
    docCount += docs.length;
    processed++;
    if (processed % 100 === 0) log(`Processed ${processed}/${projects.length} projects, ${docCount} docs`);
  }

  log(`Done. ${docCount} documents across ${processed} projects.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
