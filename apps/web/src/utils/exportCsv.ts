/** Escape a cell for RFC 4180 CSV. */
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Resolve an API path to a full URL (handles relative `/api` bases in dev/production). */
export function toAbsoluteApiUrl(apiBase: string, path: string): string {
  const normalized = `${apiBase.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `${window.location.origin}${normalized.startsWith('/') ? normalized : `/${normalized}`}`;
}

/** Build a CSV string (with UTF-8 BOM for Excel) and trigger a browser download. */
export function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const lines = [
    headers.map(escapeCsvField).join(','),
    ...rows.map((row) => row.map((cell) => escapeCsvField(cell ?? '')).join(',')),
  ];
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
