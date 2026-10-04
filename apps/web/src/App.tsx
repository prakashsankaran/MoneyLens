import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { RequireAuth } from './features/auth/RequireAuth';
import { DashboardPage } from './features/dashboard/DashboardPage';
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
          <Route
            path="transactions"
            element={
              <PlannedFeaturePage
                title="Transactions"
                phase={2}
                purpose="Every transaction you have imported, searchable and editable."
                plannedCapabilities={[
                  'Search, and filter by date, category, merchant, amount, type, recurring and source',
                  'Transaction detail with masked UPI ID and reference',
                  'Edit category, merchant and notes; delete a transaction',
                ]}
              />
            }
          />
          <Route
            path="analytics"
            element={
              <PlannedFeaturePage
                title="Analytics"
                phase={4}
                purpose="Explain why your spending changed, not just how much it was."
                plannedCapabilities={[
                  'Month vs previous month, 3-month and 6-month averages, quarter and year-to-date',
                  'Category and merchant trends, weekday vs weekend spending',
                  'Recurring payments and spending volatility',
                ]}
              />
            }
          />
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
          <Route
            path="insights"
            element={
              <PlannedFeaturePage
                title="Insights"
                phase={4}
                purpose="Patterns in your spending, each backed by the transactions behind it."
                plannedCapabilities={[
                  'Spending, saving, behaviour, recurring, anomaly and planning insights',
                  'Potential saving opportunities with the evidence for each',
                ]}
              />
            }
          />
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
          <Route
            path="imports"
            element={
              <PlannedFeaturePage
                title="Imports"
                phase={2}
                purpose="Bring in statements and review every row before anything is saved."
                plannedCapabilities={[
                  'CSV and XLSX import (phase 2), Google Pay PDF statements (phase 3)',
                  'Review screen with duplicate detection and explicit confirmation',
                  'Import history with delete',
                ]}
              />
            }
          />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
