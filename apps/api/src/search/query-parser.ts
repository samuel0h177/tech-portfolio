export interface TrlFilter {
  in?: number;
  current?: number;
  out?: number;
}

export interface ParsedQuery {
  /** MySQL FULLTEXT BOOLEAN MODE expression, or null when there is no free-text component. */
  booleanExpression: string | null;
  /** Extracted TRL constraints (e.g. "TRLcurrent=5"). */
  trl: TrlFilter;
  /** Whether the query used OR semantics (affects how +/terms combine). */
  usedOr: boolean;
  /** The raw text after TRL tokens were removed (useful for LIKE fallback). */
  residualText: string;
}

const TRL_RE = /"?\s*TRL\s*(in|current|out)\s*=\s*(\d+)\s*"?/gi;

/**
 * Translate the legacy ESTO advanced-search syntax into a MySQL FULLTEXT BOOLEAN MODE
 * expression plus structured TRL filters.
 *
 * Supported operators (mirroring the original site):
 *   +term / -term   include / exclude
 *   term*           prefix wildcard
 *   term?           single-char wildcard (approximated as prefix wildcard)
 *   term~           fuzzy / variations (approximated as prefix wildcard)
 *   a OR b          any-of semantics
 *   "TRLcurrent=5"  technology readiness level filter (extracted, not full-text)
 *   "phrase words"  exact phrase
 */
export function parseQuery(raw: string | undefined | null): ParsedQuery {
  const trl: TrlFilter = {};
  let text = (raw ?? '').trim();

  // 1. Extract TRL filters.
  text = text.replace(TRL_RE, (_m, kind: string, value: string) => {
    const n = parseInt(value, 10);
    if (kind.toLowerCase() === 'in') trl.in = n;
    else if (kind.toLowerCase() === 'current') trl.current = n;
    else if (kind.toLowerCase() === 'out') trl.out = n;
    return ' ';
  });

  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return { booleanExpression: null, trl, usedOr: false, residualText: '' };

  // 2. Detect OR semantics.
  const usedOr = /\bOR\b/i.test(text);

  // 3. Preserve quoted phrases, tokenize the rest.
  const phrases: string[] = [];
  const withPlaceholders = text.replace(/"([^"]+)"/g, (_m, phrase: string) => {
    phrases.push(phrase.trim());
    return ` __PHRASE_${phrases.length - 1}__ `;
  });

  const tokens = withPlaceholders
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length && !/^OR$/i.test(t));

  const parts: string[] = [];
  for (const token of tokens) {
    const phraseMatch = token.match(/^__PHRASE_(\d+)__$/);
    if (phraseMatch) {
      parts.push(`"${phrases[Number(phraseMatch[1])]}"`);
      continue;
    }

    let sign = '';
    let body = token;
    if (body.startsWith('+') || body.startsWith('-')) {
      sign = body[0];
      body = body.slice(1);
    }

    // Approximate fuzzy (~) and single-char (?) wildcards with a prefix wildcard.
    body = body.replace(/[~?]+$/g, '*');
    // Strip characters that are BOOLEAN MODE operators when not intended.
    body = body.replace(/[()<>~@]/g, '');
    if (!body) continue;

    // In AND mode, unmarked terms are required (+). In OR mode, leave them optional.
    if (!sign && !usedOr) sign = '+';
    parts.push(`${sign}${body}`);
  }

  const booleanExpression = parts.length ? parts.join(' ') : null;
  return { booleanExpression, trl, usedOr, residualText: text };
}
