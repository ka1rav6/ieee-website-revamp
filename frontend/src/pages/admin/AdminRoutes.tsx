/**
 * Admin routing.
 *
 * All of it is one lazy chunk already (the parent router loads this file
 * lazily), so these screens are imported directly rather than lazily again -
 * splitting further would just add round trips inside the dashboard.
 */

import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './AdminLayout';
import AdminOverviewPage from './AdminOverviewPage';
import AdminBlogsPage from './AdminBlogsPage';
import AdminEventsPage from './AdminEventsPage';
import AdminTeamPage from './AdminTeamPage';
import AdminAlumniPage from './AdminAlumniPage';
import AdminCollaborationsPage from './AdminCollaborationsPage';
import AdminIeeeDayPage from './AdminIeeeDayPage';
import AdminSubmissionsPage from './AdminSubmissionsPage';
import AdminSettingsPage from './AdminSettingsPage';

export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<AdminOverviewPage />} />
        <Route path="blogs" element={<AdminBlogsPage />} />
        <Route path="events" element={<AdminEventsPage />} />
        <Route path="team" element={<AdminTeamPage />} />
        <Route path="alumni" element={<AdminAlumniPage />} />
        <Route path="collaborations" element={<AdminCollaborationsPage />} />
        <Route path="ieee-day" element={<AdminIeeeDayPage />} />
        <Route path="submissions" element={<AdminSubmissionsPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
        {/* An unknown admin path is a typo, not a public 404 page. */}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
