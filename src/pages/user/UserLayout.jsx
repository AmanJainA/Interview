import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Sidebar from '../../components/Sidebar';
import ActivityTracker from '../../components/ActivityTracker';

export default function UserLayout() {
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
        subtitle={profile?.email}
        offcanvasId="userSidebar"
        onLogout={handleLogout}
        links={[
          { to: '/dashboard', label: 'Dashboard', end: true },
          { to: '/dashboard/assessment', label: 'Assessment' },
        ]}
      />
      <div className="flex-grow-1 p-3 p-md-4" style={{ minWidth: 0 }}>
        <Outlet />
      </div>
    </div>
  );
}
