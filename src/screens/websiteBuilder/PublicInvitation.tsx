import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublishedWebsite } from '../../services/websiteService';
import type { PublishedWebsite } from '../../services/websiteService';
import './PublicInvitation.css';

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

  if (isLoading) return <main className="public-invitation-state">Loading invitation...</main>;
  if (!website) return <main className="public-invitation-state"><h1>Invitation not found</h1><p>This invitation is unavailable or has not been published yet.</p></main>;

  const hero = website.published_document.sections.find(section => section.type === 'hero');
  const content = hero?.content ?? {};
  const names = typeof content.couple_names === 'string' ? content.couple_names : website.event_name;
  const date = typeof content.date === 'string' ? content.date : '';
  const message = typeof content.message === 'string' ? content.message : '';

  return (
    <main className={`public-invitation public-invitation-${website.published_document.template_id}`}>
      <section className="public-invitation-hero">
        <p className="public-invitation-date">{date}</p>
        <h1>{names}</h1>
        <p className="public-invitation-message">{message}</p>
        <a href="#rsvp">RSVP</a>
      </section>
      <section className="public-invitation-rsvp" id="rsvp">
        <p>RSVP details will be available here.</p>
      </section>
    </main>
  );
};

export default PublicInvitation;