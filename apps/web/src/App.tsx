import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { RequireAuth } from './features/auth/RequireAuth';
import { AnalyticsPage } from './features/analytics/AnalyticsPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ImportReviewPage } from './features/imports/ImportReviewPage';
import { ImportsPage } from './features/imports/ImportsPage';
import { InsightsPage } from './features/insights/InsightsPage';
import { MonthlyReportPage } from './features/reports/MonthlyReportPage';
import { TransactionsPage } from './features/transactions/TransactionsPage';
import { PlannedFeaturePage } from './pages/PlannedFeaturePage';
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
          <Route
            path="plan"
            element={
              <PlannedFeaturePage
                title="Money Plan"
                phase={5}
                purpose="An educational spending plan built from your income and commitments."
                plannedCapabilities={[
                  'Income, fixed commitments, essentials, lifestyle and investments',
                  'Budgets per category',
                  'What-if simulator with clearly stated assumptions',
                ]}
              />
            }
          />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="reports" element={<MonthlyReportPage />} />
          <Route
            path="assistant"
            element={
              <PlannedFeaturePage
                title="MoneyLens AI"
                phase={6}
                purpose="Ask questions about your money, answered from your calculated figures."
                plannedCapabilities={[
                  'Answers grounded in structured analytics, never raw documents',
                  'Clear labels separating facts from AI interpretation',
                  'Says so when there is not enough data to answer',
                ]}
              />
            }
          />
          <Route path="imports" element={<ImportsPage />} />
          <Route path="imports/:id" element={<ImportReviewPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
