/** Formatting helpers shared across pages. */

const LONG_DATE = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const SHORT_DATE = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const MONTH_YEAR = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' });

/**
 * Parse an API date. Dates arrive as plain `YYYY-MM-DD` strings, which are
 * read as UTC midnight; constructing from parts avoids the off-by-one day
 * that a timezone behind UTC would otherwise produce.
 */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value: string | null | undefined): string | null {
  const date = parseDate(value);
  return date ? LONG_DATE.format(date) : null;
}

export function formatShortDate(value: string | null | undefined): string | null {
  const date = parseDate(value);
  return date ? SHORT_DATE.format(date) : null;
}

export function formatMonthYear(value: string | null | undefined): string | null {
  const date = parseDate(value);
  return date ? MONTH_YEAR.format(date) : null;
}

export function getYear(value: string | null | undefined): number | null {
  return parseDate(value)?.getFullYear() ?? null;
}

/** True when the date is today or later, for separating upcoming from past. */
export function isUpcoming(value: string | null | undefined): boolean {
  const date = parseDate(value);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

/** Initials for an avatar placeholder when someone has no photo. */
export function initials(name: string): string {
  const parts = name
    .replace(/^(Dr\.?|Prof\.?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
}

/** "12" -> "12", "1200" -> "1.2k". For stat tiles. */
export function compactNumber(value: number): string {
  if (value < 1000) return String(value);
  return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
}

/** Join class names, dropping anything falsy. */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/** Strip a URL down to its hostname, for displaying a link's destination. */
export function displayHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export const TEAM_CATEGORY_LABELS: Record<string, string> = {
  faculty: 'Faculty & Advisors',
  core: 'Executive Board',
  executive: 'Executive Committee',
  mentor: 'Mentors',
};

export const TEAM_CATEGORY_BLURBS: Record<string, string> = {
  faculty: 'The faculty who guide the branch and its sub-chapters.',
  core: 'The office bearers who run the student branch.',
  executive: 'The committee that makes every event happen.',
  mentor: 'Former office bearers who still lend a hand.',
};

/** Display order of team sections on /team. */
export const TEAM_CATEGORY_ORDER = ['faculty', 'core', 'executive', 'mentor'] as const;

export const INQUIRY_TYPE_LABELS: Record<string, string> = {
  general: 'General question',
  membership: 'Joining IEEE IIITD',
  industry_collaboration: 'Industry collaboration',
  event_sponsorship: 'Event sponsorship',
  workshop: 'Technical workshop',
  talk: 'Talk or speaker session',
  research: 'Research collaboration',
  other: 'Something else',
};

export const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  new: 'New',
  read: 'Read',
  replied: 'Replied',
  archived: 'Archived',
};
