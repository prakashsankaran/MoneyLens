import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { RequireAuth } from './features/auth/RequireAuth';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { TransactionsPage } from './features/transactions/TransactionsPage';

// The dashboard and transactions load with the app; other sections are
// fetched the first time they are opened.
const AssistantPage = lazy(() =>
  import('./features/assistant/AssistantPage').then((m) => ({ default: m.AssistantPage })),
);
const AnalyticsPage = lazy(() =>
  import('./features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
);
const ImportReviewPage = lazy(() =>
  import('./features/imports/ImportReviewPage').then((m) => ({ default: m.ImportReviewPage })),
);
const ImportsPage = lazy(() =>
  import('./features/imports/ImportsPage').then((m) => ({ default: m.ImportsPage })),
);
const InsightsPage = lazy(() =>
  import('./features/insights/InsightsPage').then((m) => ({ default: m.InsightsPage })),
);
const MoneyPlanPage = lazy(() =>
  import('./features/plan/MoneyPlanPage').then((m) => ({ default: m.MoneyPlanPage })),
);
const MonthlyReportPage = lazy(() =>
  import('./features/reports/MonthlyReportPage').then((m) => ({ default: m.MonthlyReportPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="plan" element={<MoneyPlanPage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="reports" element={<MonthlyReportPage />} />
          <Route path="assistant" element={<AssistantPage />} />
          <Route path="imports" element={<ImportsPage />} />
          <Route path="imports/:id" element={<ImportReviewPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
