import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { getPublishedWebsite } from '../../services/websiteService';
import type { PublishedWebsite, WebsiteDocument } from '../../services/websiteService';
import { invitationSectionId, invitationSectionLabel, visibleInvitationSections } from '../../utils/invitationSections';
import InvitationDocument from './InvitationDocument';

const PublishedSectionMenu = ({ publishedDocument }: { publishedDocument: WebsiteDocument }) => {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sections = visibleInvitationSections(publishedDocument);

  useEffect(() => {
    const hero = document.querySelector<HTMLElement>('#published-invitation .public-invitation-hero');
    const update = () => {
      const pastHero = hero ? hero.getBoundingClientRect().bottom <= 0 : Math.max(window.scrollY, document.body.scrollTop) > 48;
      setVisible(pastHero);
      if (!pastHero) setOpen(false);
    };
    const frame = window.requestAnimationFrame(update);
    window.addEventListener('scroll', update, { passive: true });
    document.body.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      document.body.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [publishedDocument]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const scrollBehavior = (): ScrollBehavior =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  const goToSection = (id: string) => {
    const target = document.getElementById(id);
    if (!target) {
      console.error('Published invitation section is unavailable:', id);
      return;
    }
    setOpen(false);
    target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    target.focus({ preventScroll: true });
  };

  const backToTop = () => {
    setOpen(false);
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
    document.body.scrollTo({ top: 0, behavior: scrollBehavior() });
    document.getElementById('published-invitation')?.focus({ preventScroll: true });
  };

  if (!visible) return null;
  return <div className="published-section-navigation" ref={menuRef}>
    <nav id="published-section-links" aria-label="Invitation sections" hidden={!open}>
      {sections.map(section => <a key={section.id} href={`#${encodeURIComponent(invitationSectionId(section))}`} onClick={event => { event.preventDefault(); goToSection(invitationSectionId(section)); }}>{invitationSectionLabel(section)}</a>)}
      <a href="#published-invitation" onClick={event => { event.preventDefault(); backToTop(); }}>Back to top</a>
    </nav>
    <button ref={toggleRef} type="button" aria-label={open ? 'Close invitation sections' : 'Open invitation sections'} aria-expanded={open} aria-controls="published-section-links" onClick={() => setOpen(current => !current)}>
      {open ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
    </button>
  </div>;
};

const PublicInvitation = () => {
  const { slug } = useParams<{ slug: string }>();
  const [website, setWebsite] = useState<PublishedWebsite | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    getPublishedWebsite(slug)
      .then(setWebsite)
      .catch(() => setWebsite(null))
      .finally(() => setIsLoading(false));
  }, [slug]);

  const metadataName = website?.published_document.sections.find(section => section.type === 'hero')?.content.couple_names;
  useEffect(() => {
    if (typeof metadataName !== 'string' || !metadataName) return;
    const previousTitle = document.title;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]') ?? document.head.appendChild(document.createElement('link'));
    canonical.rel = 'canonical';
    canonical.href = window.location.href;
    document.title = `${metadataName} | madeTogether`;
    return () => { document.title = previousTitle; };
  }, [metadataName]);

  if (isLoading) return <main className="public-invitation-state">Loading invitation...</main>;
  if (!website) return <main className="public-invitation-state"><h1>Invitation not found</h1><p>This invitation is unavailable or has not been published yet.</p></main>;

  return (
    <main id="published-invitation" tabIndex={-1} aria-label="Published invitation">
      <InvitationDocument document={website.published_document} eventName={website.event_name} eventId={website.event_id} rsvpPlusLimit={website.rsvp_plus_limit} />
      <PublishedSectionMenu publishedDocument={website.published_document} />
    </main>
  );
};

export default PublicInvitation;