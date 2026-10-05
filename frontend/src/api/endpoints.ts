/**
 * Typed wrappers for every endpoint the UI uses.
 *
 * Components call these rather than `request()` directly, so a change to a
 * path or parameter name is a one-line edit here.
 */

import { request } from './client';
import type {
  AdminProfile,
  Alumnus,
  AlumnusAdmin,
  BlogCategory,
  BlogPost,
  BlogPostAdmin,
  BlogPostSummary,
  BlogPostWrite,
  BlogTag,
  Collaboration,
  CollaborationAdmin,
  ContactSubmissionAdmin,
  ContactSubmissionWrite,
  IeeeDayEdition,
  LandingPage,
  Message,
  Page,
  SiteEvent,
  SiteEventAdmin,
  SiteSettings,
  SiteStats,
  SubmissionStatus,
  TeamCategory,
  TeamMember,
  TeamMemberAdmin,
  TokenResponse,
} from '@/types/api';

/* --- Public ------------------------------------------------------------- */

export const publicApi = {
  landing: (signal?: AbortSignal) => request<LandingPage>('/landing', { signal }),

  settings: (signal?: AbortSignal) => request<SiteSettings>('/settings', { signal }),

  stats: (signal?: AbortSignal) => request<SiteStats>('/stats', { signal }),

  blogs: (
    params: {
      page?: number;
      per_page?: number;
      category?: string | null;
      tag?: string | null;
      search?: string | null;
      featured?: boolean | null;
    } = {},
    signal?: AbortSignal,
  ) => request<Page<BlogPostSummary>>('/blogs', { query: params, signal }),

  blog: (slug: string, signal?: AbortSignal) =>
    request<BlogPost>(`/blogs/${encodeURIComponent(slug)}`, { signal }),

  blogCategories: (signal?: AbortSignal) =>
    request<BlogCategory[]>('/blogs/categories', { signal }),

  blogTags: (signal?: AbortSignal) => request<BlogTag[]>('/blogs/tags', { signal }),

  team: (params: { category?: TeamCategory; term?: string } = {}, signal?: AbortSignal) =>
    request<TeamMember[]>('/team', { query: params, signal }),

  alumni: (params: { year?: number | null; search?: string | null } = {}, signal?: AbortSignal) =>
    request<Alumnus[]>('/alumni', { query: params, signal }),

  collaborations: (params: { year?: number | null } = {}, signal?: AbortSignal) =>
    request<Collaboration[]>('/collaborations', { query: params, signal }),

  events: (
    params: {
      page?: number;
      per_page?: number;
      upcoming?: boolean | null;
      year?: number | null;
      search?: string | null;
    } = {},
    signal?: AbortSignal,
  ) => request<Page<SiteEvent>>('/events', { query: params, signal }),

  ieeeDayEditions: (signal?: AbortSignal) => request<IeeeDayEdition[]>('/ieee-day', { signal }),

  ieeeDayEdition: (year: number, signal?: AbortSignal) =>
    request<IeeeDayEdition>(`/ieee-day/${year}`, { signal }),

  submitContact: (payload: ContactSubmissionWrite) =>
    request<{ id: number; created_at: string }>('/contact', { method: 'POST', body: payload }),
};

/* --- Authentication ----------------------------------------------------- */

export const authApi = {
  login: (email: string, password: string) =>
    request<TokenResponse>('/auth/login', { method: 'POST', body: { email, password } }),

  me: (signal?: AbortSignal) => request<AdminProfile>('/auth/me', { auth: true, signal }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<Message>('/auth/password', {
      method: 'POST',
      auth: true,
      body: { current_password: currentPassword, new_password: newPassword },
    }),

  logout: () => request<Message>('/auth/logout', { method: 'POST', auth: true }),
};

/* --- Admin -------------------------------------------------------------- */

const adminRequest = <T>(path: string, options: Parameters<typeof request>[1] = {}) =>
  request<T>(`/admin${path}`, { ...options, auth: true });

export const adminApi = {
  blogs: {
    list: (
      params: {
        page?: number;
        per_page?: number;
        published?: boolean | null;
        search?: string;
      } = {},
      signal?: AbortSignal,
    ) => adminRequest<Page<BlogPostAdmin>>('/blogs', { query: params, signal }),

    read: (id: number, signal?: AbortSignal) =>
      adminRequest<BlogPostAdmin>(`/blogs/${id}`, { signal }),

    create: (payload: BlogPostWrite) =>
      adminRequest<BlogPostAdmin>('/blogs', { method: 'POST', body: payload }),

    update: (id: number, payload: Partial<BlogPostWrite>) =>
      adminRequest<BlogPostAdmin>(`/blogs/${id}`, { method: 'PATCH', body: payload }),

    setPublished: (id: number, published: boolean) =>
      adminRequest<BlogPostAdmin>(`/blogs/${id}/publish`, {
        method: 'POST',
        query: { published },
      }),

    remove: (id: number) => adminRequest<Message>(`/blogs/${id}`, { method: 'DELETE' }),

    categories: (signal?: AbortSignal) =>
      adminRequest<BlogCategory[]>('/blogs/categories', { signal }),

    createCategory: (payload: { name: string; slug?: string; description?: string | null }) =>
      adminRequest<BlogCategory>('/blogs/categories', { method: 'POST', body: payload }),

    removeCategory: (slug: string) =>
      adminRequest<Message>(`/blogs/categories/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
  },

  team: {
    list: (signal?: AbortSignal) => adminRequest<TeamMemberAdmin[]>('/team', { signal }),
    create: (payload: Partial<TeamMemberAdmin> & { name: string; category: TeamCategory }) =>
      adminRequest<TeamMemberAdmin>('/team', { method: 'POST', body: payload }),
    update: (id: number, payload: Partial<TeamMemberAdmin>) =>
      adminRequest<TeamMemberAdmin>(`/team/${id}`, { method: 'PATCH', body: payload }),
    remove: (id: number) => adminRequest<Message>(`/team/${id}`, { method: 'DELETE' }),
    reorder: (ids: number[]) =>
      adminRequest<Message>('/team/reorder', { method: 'POST', body: { ids } }),
  },

  alumni: {
    list: (signal?: AbortSignal) => adminRequest<AlumnusAdmin[]>('/alumni', { signal }),
    create: (payload: Partial<AlumnusAdmin> & { name: string }) =>
      adminRequest<AlumnusAdmin>('/alumni', { method: 'POST', body: payload }),
    update: (id: number, payload: Partial<AlumnusAdmin>) =>
      adminRequest<AlumnusAdmin>(`/alumni/${id}`, { method: 'PATCH', body: payload }),
    remove: (id: number) => adminRequest<Message>(`/alumni/${id}`, { method: 'DELETE' }),
    reorder: (ids: number[]) =>
      adminRequest<Message>('/alumni/reorder', { method: 'POST', body: { ids } }),
  },

  collaborations: {
    list: (signal?: AbortSignal) =>
      adminRequest<CollaborationAdmin[]>('/collaborations', { signal }),
    create: (payload: Partial<CollaborationAdmin> & { name: string }) =>
      adminRequest<CollaborationAdmin>('/collaborations', { method: 'POST', body: payload }),
    update: (id: number, payload: Partial<CollaborationAdmin>) =>
      adminRequest<CollaborationAdmin>(`/collaborations/${id}`, { method: 'PATCH', body: payload }),
    remove: (id: number) => adminRequest<Message>(`/collaborations/${id}`, { method: 'DELETE' }),
    reorder: (ids: number[]) =>
      adminRequest<Message>('/collaborations/reorder', { method: 'POST', body: { ids } }),
  },

  events: {
    list: (
      params: { page?: number; per_page?: number; search?: string } = {},
      signal?: AbortSignal,
    ) => adminRequest<Page<SiteEventAdmin>>('/events', { query: params, signal }),
    create: (payload: Partial<SiteEventAdmin> & { title: string }) =>
      adminRequest<SiteEventAdmin>('/events', { method: 'POST', body: payload }),
    update: (id: number, payload: Partial<SiteEventAdmin>) =>
      adminRequest<SiteEventAdmin>(`/events/${id}`, { method: 'PATCH', body: payload }),
    remove: (id: number) => adminRequest<Message>(`/events/${id}`, { method: 'DELETE' }),
  },

  ieeeDay: {
    list: (signal?: AbortSignal) => adminRequest<IeeeDayEdition[]>('/ieee-day', { signal }),
    save: (year: number, payload: Omit<IeeeDayEdition, 'events'>) =>
      adminRequest<IeeeDayEdition>(`/ieee-day/${year}`, { method: 'PUT', body: payload }),
    remove: (year: number) => adminRequest<Message>(`/ieee-day/${year}`, { method: 'DELETE' }),
  },

  submissions: {
    list: (
      params: { page?: number; per_page?: number; status?: SubmissionStatus | null } = {},
      signal?: AbortSignal,
    ) => adminRequest<Page<ContactSubmissionAdmin>>('/submissions', { query: params, signal }),
    read: (id: number) => adminRequest<ContactSubmissionAdmin>(`/submissions/${id}`),
    update: (id: number, payload: { status?: SubmissionStatus; admin_notes?: string }) =>
      adminRequest<ContactSubmissionAdmin>(`/submissions/${id}`, {
        method: 'PATCH',
        body: payload,
      }),
    remove: (id: number) => adminRequest<Message>(`/submissions/${id}`, { method: 'DELETE' }),
    unreadCount: (signal?: AbortSignal) =>
      adminRequest<{ unread: number }>('/submissions/unread-count', { signal }),
  },

  settings: {
    read: (signal?: AbortSignal) => adminRequest<SiteSettings>('/settings', { signal }),
    update: (values: SiteSettings) =>
      adminRequest<SiteSettings>('/settings', { method: 'PUT', body: { values } }),
  },

  uploads: {
    create: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return adminRequest<{ url: string; width: number; height: number; size_bytes: number }>(
        '/uploads',
        { method: 'POST', formData },
      );
    },
    remove: (url: string) =>
      adminRequest<Message>('/uploads', { method: 'DELETE', query: { url } }),
  },
};
