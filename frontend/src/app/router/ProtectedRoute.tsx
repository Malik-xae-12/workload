import { Navigate } from 'react-router-dom';
import { isTokenExpired } from '../../shared/utils/tokenManager';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('access_token');
  const refreshToken = localStorage.getItem('refresh_token');

  // Allow access if we have a valid access token OR a refresh token that can be used
  if (!token && !refreshToken) {
    return <Navigate to="/login" replace />;
  }

  // If access token is expired but we have a refresh token, let the app render —
  // the API clients will handle refreshing automatically on the first request.
  if (token && isTokenExpired(token) && !refreshToken) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
