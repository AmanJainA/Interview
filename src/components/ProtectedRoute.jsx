import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// role: 'user' | 'admin' | undefined (any signed-in user)
export default function ProtectedRoute({ children, role }) {
  const { session, profile, loading } = useAuth();

  if (loading) return <div className="text-center mt-5">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (role && profile?.usertype !== role) return <Navigate to="/login" replace />;

  return children;
}
