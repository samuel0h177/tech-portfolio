export interface CategoryRef {
  id: number;
  name: string;
  parentId?: number | null;
}

export interface PiRef {
  id: number;
  firstName: string;
  lastName: string;
  orgCenter: string | null;
}

export interface OrgRef {
  id: number;
  name: string;
  type: string | null;
}

export interface ProjectListItem {
  id: number;
  programFlag: 'ESTO' | 'OTHER';
  programName: string | null;
  projectCode: string | null;
  title: string;
  completed: boolean;
  statusText: string | null;
  completionFy: number | null;
  quadChartUrl: string | null;
  pi: PiRef | null;
  organization: OrgRef | null;
  categories: CategoryRef[];
  subCategories: CategoryRef[];
}

export interface ProjectDocument {
  id: number;
  fileName: string;
  fileSize: number | null;
  lastModified: string | null;
  url: string;
}

export type InvestigatorRole = 'PRINCIPAL' | 'CO_INVESTIGATOR';

export interface ProjectInvestigator {
  id: number;
  firstName: string;
  middleName: string | null;
  lastName: string;
  title: string | null;
  role: InvestigatorRole;
  organization: OrgRef | null;
}

export interface ProjectDetail extends ProjectListItem {
  abstract: string | null;
  trlIn: number | null;
  trlCurrent: number | null;
  trlOut: number | null;
  projectAbbrev: string | null;
  budgetCode: string | null;
  sourceInternalId: number | null;
  investigators: ProjectInvestigator[];
  documents: ProjectDocument[];
}

export interface SearchResponse {
  data: ProjectListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface FacetCount {
  value: string;
  count: number;
}

export interface CategoryFacet {
  id: number;
  name: string;
  count: number;
  children: { id: number; name: string; count: number }[];
}

export interface Facets {
  programs: FacetCount[];
  status: FacetCount[];
  orgTypes: FacetCount[];
  categories: CategoryFacet[];
}

export interface PiOption {
  id: number;
  firstName: string;
  lastName: string;
  orgCenter: string | null;
  label: string;
  projectCount: number;
}

export const ORG_TYPE_LABELS: Record<string, string> = {
  ACADEMIA: 'Academia',
  INDUSTRY: 'Industry',
  NASA_CENTER: 'NASA Centers',
  FEDERAL_LAB: 'Federal Labs',
};
