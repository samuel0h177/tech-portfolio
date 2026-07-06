import * as dotenv from 'dotenv';
import * as path from 'node:path';

// Load the repo-root .env (two levels up from apps/scraper)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const BASE_URL = process.env.ESTO_BASE_URL ?? 'https://esto.nasa.gov/TechPortfolio';

/** Politeness delay between HTTP requests (ms). */
export const REQUEST_DELAY_MS = Number(process.env.SCRAPER_DELAY_MS ?? 250);

/** Sub-categories addressable via the legacy tech_category_id param (`gen_sub`). */
export const SUBCATEGORIES: Array<{ param: string; genId: number; subId: number }> = [
  { param: '1_5', genId: 1, subId: 5 },
  { param: '1_6', genId: 1, subId: 6 },
  { param: '1_7', genId: 1, subId: 7 },
  { param: '1_8', genId: 1, subId: 8 },
  { param: '1_15', genId: 1, subId: 15 },
  { param: '5_9', genId: 5, subId: 9 },
  { param: '5_10', genId: 5, subId: 10 },
  { param: '5_11', genId: 5, subId: 11 },
  { param: '5_12', genId: 5, subId: 12 },
  { param: '5_13', genId: 5, subId: 13 },
];

/** General categories addressable via gen_tech_category_id. */
export const GEN_CATEGORIES: Array<{ genId: number; name: string }> = [
  { genId: 1, name: 'Sensors' },
  { genId: 5, name: 'Information Systems' },
  { genId: 2, name: 'Platforms' },
  { genId: 3, name: 'Computational Technology' },
  { genId: 7, name: 'FireSense Technology' },
  { genId: 6, name: 'Flight Validation' },
];

/** Legacy center_lu_id -> OrganizationType enum. */
export const ORG_TYPE_FACETS: Array<{ centerLuId: number; type: 'ACADEMIA' | 'INDUSTRY' | 'NASA_CENTER' | 'FEDERAL_LAB' }> = [
  { centerLuId: 6, type: 'ACADEMIA' },
  { centerLuId: 37, type: 'INDUSTRY' },
  { centerLuId: 53, type: 'NASA_CENTER' },
  { centerLuId: 29, type: 'FEDERAL_LAB' },
];
