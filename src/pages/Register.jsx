import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', stream: '', location: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function set(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(form);
      navigate('/login');
    } catch (err) {
      setError(err.message || 'Could not register.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="d-flex align-items-center justify-content-center px-3 py-4" style={{ minHeight: '100vh' }}>
      <div className="card shadow-sm p-4 w-100" style={{ maxWidth: 420 }}>
        <h4 className="mb-3">Create your account</h4>
        {error && <div className="alert alert-danger py-2">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Full name</label>
            <input className="form-control" required value={form.name} onChange={set('name')} />
          </div>
          <div className="mb-3">
            <label className="form-label">Email</label>
            <input type="email" className="form-control" required value={form.email} onChange={set('email')} />
          </div>
          <div className="mb-3">
            <label className="form-label">Password</label>
            <input type="password" className="form-control" required minLength={6} value={form.password} onChange={set('password')} />
          </div>
          <div className="row">
            <div className="col-md-6 mb-3">
              <label className="form-label">Stream</label>
              <input className="form-control" value={form.stream} onChange={set('stream')} />
            </div>
            <div className="col-md-6 mb-3">
              <label className="form-label">Location</label>
              <input className="form-control" value={form.location} onChange={set('location')} />
            </div>
          </div>
          <button className="btn btn-primary w-100" disabled={busy}>
            {busy ? 'Creating…' : 'Register'}
          </button>
        </form>
        <p className="text-center mt-3 mb-0">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
