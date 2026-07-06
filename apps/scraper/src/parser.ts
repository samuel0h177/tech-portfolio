import * as cheerio from 'cheerio';
import { absoluteUrl } from './estoClient';

export interface ResultRow {
  internalId: number | null;
  programName: string | null;
  projectCode: string | null;
  firstName: string | null;
  lastName: string | null;
  title: string;
  orgCenter: string | null;
  techCategory: string | null;
  statusText: string | null;
  completed: boolean;
  completionFy: number | null;
  quadChartUrl: string | null;
}

export interface DocumentInfo {
  fileName: string;
  fileSize: number | null;
  lastModified: Date | null;
  url: string;
}

const clean = (s: string | undefined | null): string | null => {
  if (s == null) return null;
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length ? t : null;
};

/** Parse "Active" / "Project Complete FY15" into a completed flag + fiscal year. */
function parseStatus(statusText: string | null): { completed: boolean; completionFy: number | null } {
  if (!statusText) return { completed: false, completionFy: null };
  const m = statusText.match(/FY\s*'?(\d{2,4})/i);
  if (m) {
    let year = parseInt(m[1], 10);
    if (year < 100) year += year >= 90 ? 1900 : 2000;
    return { completed: true, completionFy: year };
  }
  const completed = /complete|closed/i.test(statusText);
  return { completed, completionFy: null };
}

export function parseResultsRows(html: string): ResultRow[] {
  const $ = cheerio.load(html);
  const rows: ResultRow[] = [];

  $('#search-table tr').each((_, tr) => {
    const $tr = $(tr);
    const cells = $tr.find('td');
    // Data rows carry <font face="arial"> cells; header row does not.
    if ($tr.find('td font[face="arial"]').length < 6) return;

    const text = (idx: number) => clean($(cells[idx]).text());

    const actionCell = $tr.find('td').last();
    const infoHref = actionCell.find('a[href*="getQuadChartInfo"]').attr('href') ?? '';
    const idMatch = infoHref.match(/ID=(\d+)/);
    const quadHref = actionCell.find('a[href*="quadCharts"]').attr('href') ?? '';
    const quadMatch = quadHref.match(/'([^']+\.pdf)'/i) ?? quadHref.match(/(pdf\/quadCharts\/[^'"\)]+)/i);
    const quadPath = quadMatch ? quadMatch[1] : null;
    const quadIdMatch = quadPath?.match(/(\d+)\.pdf/i);

    const internalId = idMatch
      ? parseInt(idMatch[1], 10)
      : quadIdMatch
        ? parseInt(quadIdMatch[1], 10)
        : null;

    const statusText = text(7);
    const { completed, completionFy } = parseStatus(statusText);

    rows.push({
      internalId,
      programName: text(0),
      projectCode: text(1),
      firstName: text(2),
      lastName: text(3),
      title: text(4) ?? '',
      orgCenter: text(5),
      techCategory: text(6),
      statusText,
      completed,
      completionFy,
      quadChartUrl: quadPath ? absoluteUrl(quadPath) : null,
    });
  });

  return rows;
}

export function parseRecordCount(html: string): number | null {
  const m = html.match(/There are\s+(\d+)\s+record\(s\)\s+found/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Parse the getQuadChartInfo popup: a table of file name / size / modified date, each linking to a live PDF. */
export function parseDocuments(html: string): DocumentInfo[] {
  const $ = cheerio.load(html);
  const docs: DocumentInfo[] = [];

  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 1) return;
    const anchor = $(cells[0]).find('a[href]');
    const href = anchor.attr('href');
    const fileName = clean(anchor.text()) ?? clean($(cells[0]).text());
    if (!href || !fileName || !/\.\w{2,4}$/.test(fileName)) return;

    const sizeRaw = cells.length > 1 ? clean($(cells[1]).text()) : null;
    const modifiedRaw = cells.length > 2 ? clean($(cells[2]).text()) : null;
    const fileSize = sizeRaw && /^\d+$/.test(sizeRaw) ? parseInt(sizeRaw, 10) : null;
    const lastModified = modifiedRaw ? new Date(modifiedRaw) : null;

    docs.push({
      fileName,
      fileSize,
      lastModified: lastModified && !isNaN(lastModified.getTime()) ? lastModified : null,
      url: absoluteUrl(href),
    });
  });

  return docs;
}
