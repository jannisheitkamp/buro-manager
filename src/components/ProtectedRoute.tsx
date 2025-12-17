import { Navigate, Outlet } from 'react-router-dom';
import { useStore } from '@/store/useStore';

export const ProtectedRoute = () => {
  const user = useStore((state) => state.user);
  const loading = useStore((state) => state.loading);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Laden...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};
