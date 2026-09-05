import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { loginAdmin } from '../services/adminService';
import './AdminLogin.css';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await loginAdmin(email, password);
      navigate(location.state?.from?.pathname ?? '/admin', { replace: true });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="admin-login">
      <form className="admin-login-panel" onSubmit={handleSubmit}>
        <p className="admin-login-kicker">Madetogether</p>
        <h1>Administrator access</h1>
        <p className="admin-login-intro">Sign in to manage event availability, host codes, and billing.</p>
        <label htmlFor="admin-email">Email</label>
        <input id="admin-email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required disabled={isSubmitting} />
        <label htmlFor="admin-password">Password</label>
        <input id="admin-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" minLength={12} required disabled={isSubmitting} />
        {error && <p className="admin-login-error" role="alert">{error}</p>}
        <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in...' : 'Sign in'}</button>
      </form>
    </main>
  );
}