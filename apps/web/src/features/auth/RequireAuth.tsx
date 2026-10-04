import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './useAuth';
import { FullPageSpinner } from '../../components/FullPageSpinner';

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
