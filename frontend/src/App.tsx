/**
 * Routing and the provider stack.
 *
 * Public pages are lazily loaded, and the whole admin area is one chunk, so
 * a visitor reading a blog post never downloads the dashboard.
 */

import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import { SiteSettingsProvider } from '@/hooks/useSiteSettings';
import { ThemeProvider } from '@/hooks/useTheme';
import { PublicLayout } from '@/layouts/PublicLayout';
import { PageLoader } from '@/components/ui/States';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// The landing page is what most visitors arrive on, so it is part of the
// initial bundle rather than a second round trip.
import HomePage from '@/pages/HomePage';

const AboutPage = lazy(() => import('@/pages/AboutPage'));
const TeamPage = lazy(() => import('@/pages/TeamPage'));
const EventsPage = lazy(() => import('@/pages/EventsPage'));
const BlogListPage = lazy(() => import('@/pages/BlogListPage'));
const BlogPostPage = lazy(() => import('@/pages/BlogPostPage'));
const IeeeDayPage = lazy(() => import('@/pages/IeeeDayPage'));
const CollaborationsPage = lazy(() => import('@/pages/CollaborationsPage'));
const AlumniPage = lazy(() => import('@/pages/AlumniPage'));
const ContactPage = lazy(() => import('@/pages/ContactPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const AdminRoutes = lazy(() => import('@/pages/admin/AdminRoutes'));

export default function App() {
  return (
    <ThemeProvider>
      <SiteSettingsProvider>
        <AuthProvider>
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route element={<PublicLayout />}>
                  <Route index element={<HomePage />} />
                  <Route path="about" element={<AboutPage />} />
                  <Route path="team" element={<TeamPage />} />
                  <Route path="events" element={<EventsPage />} />
                  <Route path="blogs" element={<BlogListPage />} />
                  <Route path="blogs/:slug" element={<BlogPostPage />} />
                  <Route path="ieee-day" element={<IeeeDayPage />} />
                  <Route path="ieee-day/:year" element={<IeeeDayPage />} />
                  <Route path="collaborations" element={<CollaborationsPage />} />
                  <Route path="alumni" element={<AlumniPage />} />
                  <Route path="contact" element={<ContactPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>

                {/* The admin area has its own layout, so it sits outside the
                    public one rather than inheriting the marketing header. */}
                <Route path="admin/*" element={<AdminRoutes />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </AuthProvider>
      </SiteSettingsProvider>
    </ThemeProvider>
  );
}
