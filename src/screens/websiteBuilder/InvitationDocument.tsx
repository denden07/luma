import { useState } from 'react';
import { ChevronLeft, ChevronRight, MapPinned, X } from 'lucide-react';
import { getPhotoUrl } from '../../services/dataService';
import type { WebsiteDocument } from '../../services/websiteService';
import { invitationSectionId } from '../../utils/invitationSections';
import { submitPublicGuestRsvp, submitPublicRsvpLookup } from '../../services/rsvpService';
import type { PublicGuestMatch, RsvpStatus } from '../../services/rsvpService';
import './PublicInvitation.css';

type EntourageGroup = { id: string; title: string; members: string[] };

const contentText = (content: Record<string, unknown> | undefined, field: string) => typeof content?.[field] === 'string' ? content[field] as string : '';
const safeDirectionsUrl = (value: string): string | null => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const googleMapsEmbedUrl = (venue: string): string | null => {
  const query = venue.trim();
  if (!query) return null;
  return `https://www.google.com/maps?${new URLSearchParams({ q: query, output: 'embed' }).toString()}`;
};
const entourageGroups = (content: Record<string, unknown>): EntourageGroup[] => Array.isArray(content.groups)
  ? content.groups.filter((group): group is Record<string, unknown> => typeof group === 'object' && group !== null).map(group => ({
    id: typeof group.id === 'string' ? group.id : crypto.randomUUID(),
    title: typeof group.title === 'string' ? group.title : 'Wedding Party',
    members: Array.isArray(group.members) ? group.members.filter((member): member is string => typeof member === 'string') : [],
  }))
  : [];

interface InvitationDocumentProps {
  document: WebsiteDocument;
  eventName: string;
  eventId?: string;
  rsvpPlusLimit?: number;
  preview?: boolean;
}

const PublicRsvpLookup = ({ eventId, buttonLabel, preview, rsvpPlusLimit = 0 }: { eventId?: string; buttonLabel: string; preview: boolean; rsvpPlusLimit?: number }) => {
  const [name, setName] = useState('');
  const [matches, setMatches] = useState<PublicGuestMatch[]>([]);
  const [selectedGuest, setSelectedGuest] = useState<PublicGuestMatch | null>(null);
  const [status, setStatus] = useState<RsvpStatus>('attending');
  const [needsResponse, setNeedsResponse] = useState(false);
  const partyCount = 1;
  const [plusOneCount, setPlusOneCount] = useState(0);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dietaryNotes, setDietaryNotes] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventId || !name.trim()) return;
    setIsSubmitting(true);
    try { const result = await submitPublicRsvpLookup(eventId, name); setMatches(result.matches); setNeedsResponse(Boolean(result.needs_response)); setMessage(result.message ?? ''); }
    catch { setMessage('Your RSVP request has been sent to the host for verification.'); }
    finally { setIsSubmitting(false); }
  };

  const save = async () => {
    if (!eventId || !selectedGuest) return;
    setIsSubmitting(true);
    try { await submitPublicGuestRsvp(eventId, selectedGuest.id, selectedGuest.full_name, { status, plusOneCount, dietaryNotes }); setMessage('Your RSVP has been saved.'); setMatches([]); setSelectedGuest(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save RSVP.'); }
    finally { setIsSubmitting(false); }
  };
  const submitUnmatchedResponse = async () => {
    if (!eventId || !name.trim()) return;
    setIsSubmitting(true);
    try { const result = await submitPublicRsvpLookup(eventId, name, { status, partyCount: status === 'attending' ? partyCount : 0, plusOneCount: status === 'attending' ? plusOneCount : 0, contactEmail: email, contactPhone: phone, dietaryNotes }); setMessage(result.message ?? 'Your RSVP has been sent to the host for review.'); setNeedsResponse(false); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not send RSVP.'); }
    finally { setIsSubmitting(false); }
  };
  if (preview) return <div className="public-rsvp-lookup"><label>Your name<input placeholder="Search your invitation name" readOnly /></label><button type="button">{buttonLabel}</button></div>;
  return <div className="public-rsvp-lookup"><form onSubmit={submit}><label>Your name<input value={name} onChange={input => { setName(input.target.value); setMessage(''); setMatches([]); setSelectedGuest(null); setNeedsResponse(false); }} placeholder="Enter your invitation name" required /></label><button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Searching...' : 'Search name'}</button></form>{matches.length > 0 && <div className="public-rsvp-matches"><p>Select your name</p>{matches.map(guest => <button key={guest.id} type="button" onClick={() => { setSelectedGuest(guest); setMatches([]); }}>{guest.full_name}</button>)}</div>}{selectedGuest && <div className="public-rsvp-response"><strong>{selectedGuest.full_name}</strong><label>Will you attend?<select value={status} onChange={input => setStatus(input.target.value as RsvpStatus)}><option value="attending">Attending</option><option value="declined">Declined</option><option value="undecided">Undecided</option></select></label>{status === 'attending' && rsvpPlusLimit > 0 && <label>Additional guests<select value={plusOneCount} onChange={input => setPlusOneCount(Number(input.target.value))}>{Array.from({ length: rsvpPlusLimit + 1 }, (_, index) => <option key={index} value={index}>{index}</option>)}</select></label>}<label>Dietary notes<textarea value={dietaryNotes} onChange={input => setDietaryNotes(input.target.value)} rows={3} /></label><button type="button" onClick={save} disabled={isSubmitting}>Save RSVP</button></div>}{needsResponse && <div className="public-rsvp-response"><strong>Send RSVP for review</strong><label>Will you attend?<select value={status} onChange={input => setStatus(input.target.value as RsvpStatus)}><option value="attending">Attending</option><option value="declined">Declined</option><option value="undecided">Undecided</option></select></label>{status === 'attending' && <><label>Additional guests<select value={plusOneCount} onChange={input => setPlusOneCount(Number(input.target.value))}>{Array.from({ length: rsvpPlusLimit + 1 }, (_, index) => <option key={index} value={index}>{index}</option>)}</select></label></>}<label>Email<input type="email" value={email} onChange={input => setEmail(input.target.value)} /></label><label>Contact number<input type="tel" value={phone} onChange={input => setPhone(input.target.value)} /></label><label>Dietary notes<textarea value={dietaryNotes} onChange={input => setDietaryNotes(input.target.value)} rows={3} /></label><button type="button" onClick={submitUnmatchedResponse} disabled={isSubmitting}>Send RSVP to host</button></div>}{message && <p role="status">{message}</p>}</div>;
};

const InvitationGallery = ({ paths, layout }: { paths: string[]; layout: 'grid' | 'strip' | 'carousel' }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const galleryLimit = layout === 'grid' ? 6 : 5;
  const galleryPaths = paths.slice(0, galleryLimit);
  if (galleryPaths.length === 0) return <p>Photos from the celebration will appear here.</p>;

  const movePreview = (direction: -1 | 1) => setPreviewIndex(current => current === null ? null : (current + direction + galleryPaths.length) % galleryPaths.length);
  const openPreview = (index: number) => setPreviewIndex(index);
  const renderLightbox = () => previewIndex !== null && <div className="invitation-gallery-lightbox" role="dialog" aria-modal="true" aria-label={`Gallery image ${previewIndex + 1} of ${galleryPaths.length}`}>
    <button type="button" className="gallery-lightbox-close" onClick={() => setPreviewIndex(null)} aria-label="Close image preview"><X size={22} aria-hidden="true" /></button>
    {galleryPaths.length > 1 && <button type="button" className="gallery-lightbox-previous" onClick={() => movePreview(-1)} aria-label="Previous image"><ChevronLeft size={28} aria-hidden="true" /></button>}
    <img src={getPhotoUrl(galleryPaths[previewIndex])} alt={`Celebration memory ${previewIndex + 1} of ${galleryPaths.length}`} />
    {galleryPaths.length > 1 && <button type="button" className="gallery-lightbox-next" onClick={() => movePreview(1)} aria-label="Next image"><ChevronRight size={28} aria-hidden="true" /></button>}
    <p>{previewIndex + 1} / {galleryPaths.length}</p>
  </div>;

  if (layout !== 'carousel') {
    return <><div className={`public-gallery-${layout}`}>{galleryPaths.map((path, index) => <button type="button" key={path} onClick={() => openPreview(index)} aria-label={`Preview gallery image ${index + 1}`}><img src={getPhotoUrl(path)} alt="Celebration memory" /></button>)}</div>{renderLightbox()}</>;
  }

  const activePath = galleryPaths[activeIndex] ?? galleryPaths[0];
  const move = (direction: -1 | 1) => setActiveIndex(current => (current + direction + galleryPaths.length) % galleryPaths.length);
  return (
    <div className="public-gallery-carousel">
      <button type="button" className="gallery-carousel-image" onClick={() => openPreview(activeIndex)} aria-label={`Preview gallery image ${activeIndex + 1}`}><img key={activePath} src={getPhotoUrl(activePath)} alt={`Celebration memory ${activeIndex + 1} of ${galleryPaths.length}`} /></button>
      {galleryPaths.length > 1 && <>
        <button type="button" className="gallery-carousel-previous" onClick={() => move(-1)} aria-label="Previous gallery photo"><ChevronLeft size={22} aria-hidden="true" /></button>
        <button type="button" className="gallery-carousel-next" onClick={() => move(1)} aria-label="Next gallery photo"><ChevronRight size={22} aria-hidden="true" /></button>
        <div className="gallery-carousel-dots" aria-label={`Photo ${activeIndex + 1} of ${galleryPaths.length}`}>{galleryPaths.map((path, index) => <button type="button" key={path} onClick={() => setActiveIndex(index)} className={index === activeIndex ? 'active' : ''} aria-label={`Show gallery photo ${index + 1}`} aria-current={index === activeIndex} />)}</div>
      </>}
      {renderLightbox()}</div>
  );
};

const InvitationDocument = ({ document, eventName, eventId, rsvpPlusLimit = 0, preview = false }: InvitationDocumentProps) => {
  const hero = document.sections.find(section => section.type === 'hero');
  const heroContent = hero?.content ?? {};
  const names = contentText(heroContent, 'couple_names') || eventName;
  const date = contentText(heroContent, 'date');
  const message = contentText(heroContent, 'message');
  const coverPhotoPath = contentText(heroContent, 'cover_photo_path');
  const coverPhotoUrl = coverPhotoPath ? getPhotoUrl(coverPhotoPath) : undefined;
  const coverPosition = contentText(heroContent, 'cover_position') || 'center';

  return (
    <div key={`${document.template_id}-${document.theme.palette_id}-${document.theme.font_pair_id}`} className={`public-invitation public-invitation-${document.template_id} palette-${document.theme.palette_id} font-${document.theme.font_pair_id} ${preview ? 'invitation-document-preview' : ''}`}>
      {hero?.visible && <section id={invitationSectionId(hero)} tabIndex={-1} className={`public-invitation-hero ${coverPhotoUrl ? 'has-cover' : ''}`}>
        {coverPhotoUrl && <img className="public-invitation-cover-media" src={coverPhotoUrl} alt="" style={{ objectPosition: coverPosition }} />}
        <p className="public-invitation-date">{date}</p><h1>{names}</h1><p className="public-invitation-message">{message}</p><a href="#rsvp" className="public-invitation-rsvp-link">RSVP</a>
      </section>}
      {document.sections.filter(section => section.visible && section.type !== 'hero').map(section => {
        if (section.type === 'rsvp') return <section className="public-invitation-rsvp is-visible" id={invitationSectionId(section)} tabIndex={-1} key={section.id}><div><p className="public-invitation-rsvp-kicker">Celebrate with us</p><h2>{contentText(section.content, 'title')}</h2><p>Search your name to find your invitation and respond.</p><PublicRsvpLookup eventId={eventId} rsvpPlusLimit={rsvpPlusLimit} buttonLabel={contentText(section.content, 'button_label') || 'Respond'} preview={preview} /></div></section>;
        if (section.type === 'story') return <section className="public-invitation-section public-invitation-story" id={invitationSectionId(section)} tabIndex={-1} key={section.id}><p className="public-invitation-section-kicker">{contentText(section.content, 'title')}</p><p>{contentText(section.content, 'body')}</p></section>;
        if (section.type === 'details') {
          const venue = contentText(section.content, 'venue');
          const ceremonyPlace = contentText(section.content, 'ceremony_place');
          const venueDirections = safeDirectionsUrl(contentText(section.content, 'venue_directions_url') || contentText(section.content, 'directions_url'));
          const ceremonyDirections = safeDirectionsUrl(contentText(section.content, 'ceremony_directions_url'));
          const locations = [
            { label: 'Venue', place: venue, time: contentText(section.content, 'venue_time'), directions: venueDirections },
            { label: 'Ceremony', place: ceremonyPlace, time: contentText(section.content, 'ceremony_time'), directions: ceremonyDirections },
          ].filter(location => location.place || location.time);
          return <section className="public-invitation-section public-invitation-details" id={invitationSectionId(section)} tabIndex={-1} key={section.id}><p className="public-invitation-section-kicker">{contentText(section.content, 'title')}</p><div className="public-invitation-locations">{locations.map(location => { const mapEmbedUrl = googleMapsEmbedUrl(location.place); return <article key={location.label}><p className="public-location-label">{location.label}</p>{location.place && <p className="public-location-place">{location.place}</p>}{location.time && <p>{location.time}</p>}{mapEmbedUrl && <iframe className="public-invitation-map" title={`Map for ${location.place}`} src={mapEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />}{location.directions && <a className="public-invitation-directions" href={location.directions} target="_blank" rel="noreferrer"><MapPinned size={18} aria-hidden="true" /> Get directions</a>}</article>; })}</div></section>;
        }
        if (section.type === 'gallery') {
          const paths = Array.isArray(section.content.photo_paths) ? section.content.photo_paths.filter((path): path is string => typeof path === 'string') : [];
          const selectedLayout = contentText(section.content, 'layout');
          const layout = selectedLayout === 'strip' || selectedLayout === 'carousel' ? selectedLayout : 'grid';
          return <section className="public-invitation-section public-invitation-gallery" id={invitationSectionId(section)} tabIndex={-1} key={section.id}><p className="public-invitation-section-kicker">{contentText(section.content, 'title')}</p><InvitationGallery paths={paths} layout={layout} /></section>;
        }
        if (section.type === 'entourage') return <section className="public-invitation-section public-invitation-entourage" id={invitationSectionId(section)} tabIndex={-1} key={section.id}><p className="public-invitation-section-kicker">{contentText(section.content, 'title')}</p><div>{entourageGroups(section.content).map(group => { const members = group.members.map(member => member.trim()).filter(Boolean); return <article key={group.id}><h2>{group.title}</h2>{members.length > 0 && <ul>{members.map(member => <li key={member}>{member}</li>)}</ul>}</article>; })}</div></section>;
        if (section.type === 'closing') return <section className="public-invitation-section public-invitation-closing" id={invitationSectionId(section)} tabIndex={-1} key={section.id}><p>{contentText(section.content, 'message')}</p></section>;
        return null;
      })}
    </div>
  );
};

export default InvitationDocument;