import { NavLink } from 'react-router-dom';

// links: [{ to, label, end }]
export default function Sidebar({ title, subtitle, links, onLogout, offcanvasId }) {
  const NavLinks = ({ onNavigate }) => (
    <>
      <div className="p-3 border-bottom border-secondary">
        <div className="fw-bold text-white">{title}</div>
        <small>{subtitle}</small>
      </div>
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          onClick={onNavigate}
          className={({ isActive }) => (isActive ? 'active' : '')}
        >
          {l.label}
        </NavLink>
      ))}
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onNavigate?.();
          onLogout();
        }}
      >
        Logout
      </a>
    </>
  );

  return (
    <>
      {/* Mobile top bar with hamburger */}
      <nav className="navbar d-md-none sidebar px-3">
        <button
          className="navbar-toggler text-white border-secondary"
          type="button"
          data-bs-toggle="offcanvas"
          data-bs-target={`#${offcanvasId}`}
          aria-controls={offcanvasId}
        >
          ☰
        </button>
        <span className="text-white ms-3 fw-bold">{title}</span>
      </nav>

      {/* Offcanvas drawer (mobile) */}
      <div className="offcanvas offcanvas-start sidebar" tabIndex="-1" id={offcanvasId}>
        <div className="d-flex justify-content-end p-2">
          <button className="btn-close btn-close-white" data-bs-dismiss="offcanvas"></button>
        </div>
        <NavLinks
          onNavigate={() => {
            const el = document.getElementById(offcanvasId);
            const instance = el && window.bootstrap?.Offcanvas.getInstance(el);
            instance?.hide();
          }}
        />
      </div>

      {/* Fixed sidebar (desktop) */}
      <div className="sidebar sidebar-fixed d-none d-md-block" style={{ width: 240, flexShrink: 0 }}>
        <NavLinks />
      </div>
    </>
  );
}
