import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import type { Role } from './api/types';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const FarmsPage = lazy(() => import('./pages/FarmsPage'));
const FarmDetailPage = lazy(() => import('./pages/FarmDetailPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const ScreeningPage = lazy(() => import('./pages/ScreeningPage'));
const IotConceptPage = lazy(() => import('./pages/IotConceptPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const NoticesPage = lazy(() => import('./pages/NoticesPage'));
const StatisticsPage = lazy(() => import('./pages/StatisticsPage'));

function RequireAuth({ children, roles }: { children: JSX.Element; roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // UI-level guard only; the backend enforces every permission independently.
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <a href="/dashboard" className="mt-2 inline-block text-sm text-brand-700 underline">Go to the dashboard</a>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="farms" element={<FarmsPage />} />
              <Route path="farms/:farmId" element={<FarmDetailPage />} />
              <Route path="alerts" element={<AlertsPage />} />
              <Route path="screening" element={<ScreeningPage />} />
              <Route path="notices" element={<NoticesPage />} />
              <Route path="statistics" element={<StatisticsPage />} />
              <Route path="iot" element={<IotConceptPage />} />
              <Route path="users" element={<RequireAuth roles={['admin']}><UsersPage /></RequireAuth>} />
              <Route path="about" element={<AboutPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
