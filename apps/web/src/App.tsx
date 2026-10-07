import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { RequireAuth } from './features/auth/RequireAuth';
import { AssistantPage } from './features/assistant/AssistantPage';
import { AnalyticsPage } from './features/analytics/AnalyticsPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ImportReviewPage } from './features/imports/ImportReviewPage';
import { ImportsPage } from './features/imports/ImportsPage';
import { InsightsPage } from './features/insights/InsightsPage';
import { MoneyPlanPage } from './features/plan/MoneyPlanPage';
import { MonthlyReportPage } from './features/reports/MonthlyReportPage';
import { TransactionsPage } from './features/transactions/TransactionsPage';
import { SettingsPage } from './pages/SettingsPage';

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
