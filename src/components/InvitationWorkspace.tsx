import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Armchair, Check, CircleAlert, Globe2, Menu, UsersRound, X } from 'lucide-react';
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import type { InvitationNoticeActions } from './useInvitationNotice';
import './InvitationWorkspace.css';

type InvitationNotice = { id: number; kind: 'success' | 'error'; message: string };
const InvitationWorkspace = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const { pathname } = useLocation();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const menuOpen = openedAt === pathname;
  const menuButton = useRef<HTMLButtonElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const base = `/host/events/${eventId}`;
  const [notice, setNotice] = useState<InvitationNotice | null>(null);
  const success = useCallback((message: string) => setNotice(current => ({ id: (current?.id ?? 0) + 1, kind: 'success', message })), []);
  const error = useCallback((message: string) => setNotice(current => ({ id: (current?.id ?? 0) + 1, kind: 'error', message })), []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(current => current?.id === notice.id ? null : current), notice.kind === 'error' ? 6000 : 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const closeOnHistory = () => setOpenedAt(null);
    window.addEventListener('popstate', closeOnHistory);
    return () => window.removeEventListener('popstate', closeOnHistory);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const media = window.matchMedia('(max-width: 760px)');
    const closeOnDesktop = () => { if (!media.matches) setOpenedAt(null); };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!media.matches) return;
      if (event.key === 'Escape') {
        setOpenedAt(null);
        menuButton.current?.focus();
      }
      if (event.key !== 'Tab') return;
      const focusable = navigation.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    if (media.matches) {
      document.body.style.overflow = 'hidden';
      navigation.current?.querySelector<HTMLElement>('a[href]')?.focus();
    }
    document.addEventListener('keydown', onKeyDown);
    media.addEventListener('change', closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      media.removeEventListener('change', closeOnDesktop);
    };
  }, [menuOpen]);

  const closeMenu = () => setOpenedAt(null);

  return <div className="invitation-workspace">
    <div className="invitation-mobile-bar">
      <button ref={menuButton} type="button" aria-label="Open invitation navigation" aria-controls="invitation-navigation" aria-expanded={menuOpen} onClick={() => setOpenedAt(pathname)}><Menu size={22} aria-hidden="true" /></button>
      <strong>Invitation management</strong>
    </div>
    {menuOpen && <button className="invitation-drawer-backdrop" aria-label="Close invitation navigation" type="button" onClick={closeMenu} />}
    <aside ref={navigation} id="invitation-navigation" className={`invitation-navigation${menuOpen ? ' open' : ''}`} aria-label="Invitation navigation">
      <div className="invitation-navigation-heading"><strong>Invitation management</strong><button type="button" aria-label="Close invitation navigation" onClick={() => { closeMenu(); menuButton.current?.focus(); }}><X size={20} aria-hidden="true" /></button></div>
      <nav aria-label="Invitation sections">
        <NavLink to={`${base}/website`} onClick={closeMenu} className={({ isActive }) => isActive ? 'active' : ''} end><Globe2 size={20} aria-hidden="true" /> Website</NavLink>
        <NavLink to={`${base}/guests`} onClick={closeMenu} className={({ isActive }) => isActive ? 'active' : ''} end><UsersRound size={20} aria-hidden="true" /> Guest list</NavLink>
        <NavLink to={`${base}/seating`} onClick={closeMenu} className={({ isActive }) => isActive ? 'active' : ''} end><Armchair size={20} aria-hidden="true" /> Seating plan</NavLink>
      </nav>
      <NavLink className="invitation-dashboard-link" to={`/host/dashboard/${eventId}`} onClick={closeMenu}><ArrowLeft size={18} aria-hidden="true" /> Event dashboard</NavLink>
    </aside>
    <div className="invitation-workspace-content"><Outlet context={{ success, error } satisfies InvitationNoticeActions} /></div>
    {notice && <div key={notice.id} className={`invitation-notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
      {notice.kind === 'error' ? <CircleAlert size={19} aria-hidden="true" /> : <Check size={19} aria-hidden="true" />}
      <span>{notice.message}</span>
      <button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={17} aria-hidden="true" /></button>
    </div>}
  </div>;
};

export default InvitationWorkspace;
