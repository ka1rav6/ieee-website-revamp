/**
 * Types mirroring the backend's Pydantic schemas.
 *
 * Kept hand-written rather than generated so the shapes the UI actually
 * consumes stay small and readable; the backend's OpenAPI document at
 * /api/docs is the reference when changing them.
 */

export type TeamCategory = 'faculty' | 'core' | 'executive' | 'mentor';

export type InquiryType =
  | 'general'
  | 'membership'
  | 'industry_collaboration'
  | 'event_sponsorship'
  | 'workshop'
  | 'talk'
  | 'research'
  | 'other';

export type SubmissionStatus = 'new' | 'read' | 'replied' | 'archived';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

/* --- Blogs -------------------------------------------------------------- */

export interface BlogCategory {
  slug: string;
  name: string;
  description: string | null;
  post_count: number;
}

export interface BlogTag {
  slug: string;
  name: string;
}

export interface BlogPostSummary {
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image: string | null;
  cover_image_alt: string | null;
  author_name: string;
  author_subtitle: string | null;
  author_image: string | null;
  category: BlogCategory | null;
  tags: BlogTag[];
  is_featured: boolean;
  published_at: string | null;
  reading_minutes: number | null;
}

export interface BlogPost extends BlogPostSummary {
  /** Already rendered and sanitised by the backend. */
  body_html: string;
  related: BlogPostSummary[];
}

export interface BlogPostAdmin extends BlogPostSummary {
  id: number;
  body: string;
  is_published: boolean;
  category_slug: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlogPostWrite {
  title: string;
  body: string;
  slug?: string | null;
  excerpt?: string | null;
  cover_image?: string | null;
  cover_image_alt?: string | null;
  author_name: string;
  author_subtitle?: string | null;
  author_image?: string | null;
  category_slug?: string | null;
  tags?: string[];
  is_published?: boolean;
  is_featured?: boolean;
  published_at?: string | null;
}

/* --- People ------------------------------------------------------------- */

export interface TeamMember {
  slug: string;
  name: string;
  position: string | null;
  category: TeamCategory;
  photo: string | null;
  department: string | null;
  year: string | null;
  bio: string | null;
  email: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  website_url: string | null;
  term: string | null;
  sort_order: number;
}

export interface TeamMemberAdmin extends TeamMember {
  id: number;
  is_active: boolean;
}

export interface Alumnus {
  slug: string;
  name: string;
  photo: string | null;
  graduation_year: number | null;
  degree: string | null;
  branch: string | null;
  current_role: string | null;
  current_organization: string | null;
  ieee_position: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  website_url: string | null;
  is_featured: boolean;
  sort_order: number;
}

export interface AlumnusAdmin extends Alumnus {
  id: number;
}

/* --- Showcase ----------------------------------------------------------- */

export interface Collaboration {
  slug: string;
  name: string;
  logo: string | null;
  description: string | null;
  collaboration_type: string | null;
  year: number | null;
  website_url: string | null;
  is_featured: boolean;
  sort_order: number;
}

export interface CollaborationAdmin extends Collaboration {
  id: number;
}

export interface SiteEvent {
  slug: string;
  title: string;
  description: string | null;
  poster: string | null;
  event_date: string | null;
  location: string | null;
  category: string | null;
  registration_url: string | null;
  ieee_day_year: number | null;
  is_featured: boolean;
}

export interface SiteEventAdmin extends SiteEvent {
  id: number;
  is_published: boolean;
  sort_order: number;
}

/* --- IEEE Day ----------------------------------------------------------- */

export interface IeeeDayHighlight {
  title: string;
  description: string | null;
  image: string | null;
}

export interface IeeeDayStat {
  label: string;
  value: string;
}

export interface IeeeDayPhoto {
  image: string;
  caption: string | null;
}

export interface IeeeDayEdition {
  year: number;
  theme: string | null;
  tagline: string | null;
  description: string | null;
  celebrated_on: string | null;
  hero_image: string | null;
  is_current: boolean;
  highlights: IeeeDayHighlight[];
  stats: IeeeDayStat[];
  gallery: IeeeDayPhoto[];
  events: SiteEvent[];
}

/* --- Contact ------------------------------------------------------------ */

export interface ContactSubmissionWrite {
  name: string;
  email: string;
  organization?: string | null;
  phone?: string | null;
  inquiry_type: InquiryType;
  subject?: string | null;
  message: string;
}

export interface ContactSubmissionAdmin {
  id: number;
  name: string;
  email: string;
  organization: string | null;
  phone: string | null;
  inquiry_type: InquiryType;
  subject: string | null;
  message: string;
  status: SubmissionStatus;
  admin_notes: string | null;
  created_at: string;
}

/* --- Aggregates --------------------------------------------------------- */

export interface SiteStats {
  members: number;
  events: number;
  blog_posts: number;
  collaborations: number;
  alumni: number;
  years_active: number;
}

export type SiteSettings = Record<string, string>;

export interface LandingPage {
  stats: SiteStats;
  featured_events: SiteEvent[];
  featured_posts: BlogPostSummary[];
  featured_collaborations: Collaboration[];
  featured_alumni: Alumnus[];
  core_team: TeamMember[];
  settings: SiteSettings;
  ieee_day: IeeeDayEdition | null;
}

/* --- Auth --------------------------------------------------------------- */

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_at: string;
}

export interface AdminProfile {
  id: number;
  email: string;
  last_login_at: string | null;
}

export interface Message {
  detail: string;
}
