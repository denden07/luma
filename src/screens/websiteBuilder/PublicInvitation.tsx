import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublishedWebsite } from '../../services/websiteService';
import type { PublishedWebsite } from '../../services/websiteService';
import InvitationDocument from './InvitationDocument';

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
    <main><InvitationDocument document={website.published_document} eventName={website.event_name} /></main>
  );
};

export default PublicInvitation;