import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Sidebar from '../../components/Sidebar';
import ActivityTracker from '../../components/ActivityTracker';

export default function AdminLayout() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="d-flex flex-column flex-md-row"><ActivityTracker profile={profile} />
      <Sidebar
        title={profile?.name}
        subtitle="Admin"
        offcanvasId="adminSidebar"
        onLogout={handleLogout}
        links={[
          { to: '/admin', label: 'Dashboard', end: true },
          { to: '/admin/results', label: 'Results' },
          { to: '/admin/tracking', label: 'Manage Tracking' },
          { to: '/admin/about', label: 'About Company' },
          { to: '/admin/instructions', label: 'Instructions' },
          { to: '/admin/questions', label: 'MCQ Questions' },
          { to: '/admin/settings', label: 'Assessment Timer' },
        ]}
      />
      <div className="flex-grow-1 p-3 p-md-4" style={{ minWidth: 0 }}>
        <Outlet />
      </div>
    </div>
  );
}
