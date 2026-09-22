import { createContext, useContext, useEffect, useState } from 'react';
import { db, rpc } from '../supabaseClient';

const AuthContext = createContext(null);
const STORAGE_KEY = 'interview_portal_session';

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null); // { id, name, email, stream, location, usertype, created_date }
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on first load, then re-check
  // against the database so a deleted/changed account can't linger.
  useEffect(() => {
    async function restore() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          const { data, error } = await db('users')
            .select('id, name, email, stream, location, usertype, created_date')
            .eq('id', saved.id)
            .single();
          if (!error && data) setProfile(data);
          else localStorage.removeItem(STORAGE_KEY);
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
      setLoading(false);
    }
    restore();
  }, []);

  async function register({ name, email, password, stream, location }) {
    const { data, error } = await rpc('register_user', {
      p_name: name,
      p_email: email,
      p_password: password,
      p_stream: stream || null,
      p_location: location || null,
    });
    if (error) throw error;
    return data?.[0];
  }

  async function login({ email, password }) {
    const { data, error } = await rpc('login_user', { p_email: email, p_password: password });
    if (error) throw error;
    const user = data?.[0];
    if (!user) throw new Error('Incorrect email or password.');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: user.id }));
    setProfile(user);
    return user;
  }

  async function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setProfile(null);
  }

  async function refreshProfile() {
    if (!profile) return;
    const { data } = await db('users')
      .select('id, name, email, stream, location, usertype, created_date')
      .eq('id', profile.id)
      .single();
    if (data) setProfile(data);
  }

  const value = { session: profile, profile, loading, register, login, logout, refreshProfile };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
