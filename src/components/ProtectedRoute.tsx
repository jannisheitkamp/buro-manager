import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { FullScreenLoader } from './FullScreenLoader';

export const ProtectedRoute = () => {
  const user = useStore((state) => state.user);
  const loading = useStore((state) => state.loading);
  const location = useLocation();

  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
};
