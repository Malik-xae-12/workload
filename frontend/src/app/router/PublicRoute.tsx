import { Navigate } from 'react-router-dom';

export function PublicRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('access_token');
  if (token) {
    return <Navigate to="/setup" replace />;
  }
  return <>{children}</>;
}
