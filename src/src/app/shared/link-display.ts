export interface LinkDisplay {
  domain: string;
  segment: string | null;
}

const MAX_SEGMENT_LENGTH = 28;

export function parseLinkDisplay(url: string): LinkDisplay {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { domain: url, segment: null };
  }

  const domain = parsed.hostname.replace(/^www\./i, '');
  const pathSegments = parsed.pathname.split('/').filter(Boolean);
  const lastPathSegment = pathSegments[pathSegments.length - 1];

  const segment = lastPathSegment ? formatPathSegment(lastPathSegment) : formatQuery(parsed.search.slice(1));

  return { domain, segment };
}

function formatPathSegment(raw: string): string | null {
  const spaced = safeDecode(raw).replace(/[-_]+/g, ' ').trim();
  if (!spaced) return null;
  const titled = spaced.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
  return truncate(titled);
}

function formatQuery(raw: string): string | null {
  const trimmed = safeDecode(raw).trim();
  return trimmed ? truncate(trimmed) : null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function truncate(text: string): string {
  if (text.length <= MAX_SEGMENT_LENGTH) return text;
  return `${text.slice(0, MAX_SEGMENT_LENGTH - 1).trimEnd()}…`;
}
