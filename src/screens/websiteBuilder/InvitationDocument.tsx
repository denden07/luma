import { useState } from 'react';
import { ChevronLeft, ChevronRight, MapPinned, X } from 'lucide-react';
import { getPhotoUrl } from '../../services/dataService';
import type { WebsiteDocument } from '../../services/websiteService';
import { invitationSectionId } from '../../utils/invitationSections';
import { submitPublicGuestRsvp, submitPublicRsvpLookup } from '../../services/rsvpService';
import type { CompanionChoice, PublicGuestMatch, ReservedSeatChoice, RsvpStatus } from '../../services/rsvpService';
import CopyrightFooter from '../../components/CopyrightFooter';
import Modal from '../../components/Modal';
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
  dietaryEnabled?: boolean;
  preview?: boolean;
}

const PublicRsvpLookup = ({ eventId, buttonLabel, preview, dietaryEnabled = true }: { eventId?: string; buttonLabel: string; preview: boolean; dietaryEnabled?: boolean }) => {
  const [name, setName] = useState('');
  const [matches, setMatches] = useState<PublicGuestMatch[]>([]);
  const [selectedGuest, setSelectedGuest] = useState<PublicGuestMatch | null>(null);
  const [status, setStatus] = useState<RsvpStatus>('attending');
  const [needsResponse, setNeedsResponse] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [page, setPage] = useState<1 | 2>(1);
  const [reservedSeats, setReservedSeats] = useState<ReservedSeatChoice[]>([]);
  const [proxy, setProxy] = useState('');
  const [declineWarningOpen, setDeclineWarningOpen] = useState(false);
  const [proxyRequired, setProxyRequired] = useState(false);
  const [namedChoices, setNamedChoices] = useState<CompanionChoice[]>([]);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dietaryNotes, setDietaryNotes] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventId || !name.trim()) return;
    setIsSubmitting(true);
    try { const result = await submitPublicRsvpLookup(eventId, name); setMatches(result.matches); setSelectedGuest(null); setNeedsResponse(Boolean(result.needs_response)); setModalOpen(Boolean(result.needs_response)); setStatus('attending'); setPage(1); setReservedSeats([]); setProxy(''); setProxyRequired(false); setDeclineWarningOpen(false); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not search invitations.'); }
    finally { setIsSubmitting(false); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventId || !selectedGuest) return;
    const attendingCount = namedChoices.filter(choice => choice.status === 'attending').length + reservedSeats.filter(seat => seat.status === 'attending').length;
    if (status === 'declined' && proxyRequired && attendingCount === 0) { setMessage('Choose an additional guest to attend as your proxy.'); return; }
    if (status === 'declined' && attendingCount > 0 && !proxy) { setMessage('Choose an attending additional guest as your proxy.'); return; }
    setIsSubmitting(true);
    try { await submitPublicGuestRsvp(eventId, selectedGuest, { status, namedCompanions: namedChoices, reservedSeats, proxy: status === 'declined' && proxy ? proxy.startsWith('named:') ? { id: proxy.slice(6) } : { index: Number(proxy.slice(5)) } : null, dietaryNotes: dietaryEnabled ? dietaryNotes : undefined }); setMessage('Your RSVP has been saved.'); setModalOpen(false); setMatches([]); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save RSVP.'); }
    finally { setIsSubmitting(false); }
  };
  const submitUnmatchedResponse = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventId || !name.trim()) return;
    setIsSubmitting(true);
    try { const result = await submitPublicRsvpLookup(eventId, name, { status, partyCount: status === 'attending' ? 1 : 0, plusOneCount: 0, attendeeNames: [], contactEmail: email, contactPhone: phone, dietaryNotes: dietaryEnabled ? dietaryNotes : undefined }); if (result.matches.length) { setMatches(result.matches); setSelectedGuest(null); setNeedsResponse(false); setModalOpen(false); setMessage('We found an invitation. Please select your name below.'); } else { setMessage(result.message ?? 'Your RSVP has been sent to the host for review.'); setModalOpen(false); } }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not send RSVP.'); }
    finally { setIsSubmitting(false); }
  };
  const openGuest = (guest: PublicGuestMatch) => {
    setSelectedGuest(guest);
    setStatus(guest.response_status ?? 'attending');
    setDeclineWarningOpen(false);
    setNamedChoices(guest.companions.map(companion => ({ id: companion.id, status: companion.status ?? 'undecided' })));
    const count = Math.max(0, guest.plus_limit - guest.companions.length);
    setReservedSeats(Array.from({ length: count }, (_, index) => guest.reserved_seats?.[index] ?? { name: '', status: 'undecided' }));
    const proxyNamed = guest.companions.find(companion => companion.is_proxy);
    const proxySeat = guest.reserved_seats?.findIndex(seat => seat.is_proxy) ?? -1;
    setProxy(proxySeat >= 0 ? `seat:${proxySeat}` : proxyNamed ? `named:${proxyNamed.id}` : '');
    setProxyRequired(guest.response_status === 'declined' && (proxySeat >= 0 || Boolean(proxyNamed)));
    setPage(1); setModalOpen(true); setMessage('');
  };
  const declineAllSeats = () => {
    setStatus('declined');
    setNamedChoices(current => current.map(choice => ({ ...choice, status: 'declined' })));
    setReservedSeats(current => current.map(seat => ({ ...seat, status: 'declined' })));
    setProxy('');
    setProxyRequired(false);
    setDeclineWarningOpen(false);
    setMessage('');
    setPage(2);
  };
  const additionalCount = selectedGuest?.plus_limit ?? 0;
  const attendingOptions = [
    ...(selectedGuest?.companions ?? []).filter((_, index) => namedChoices[index]?.status === 'attending').map(companion => ({ value: `named:${companion.id}`, label: companion.full_name })),
    ...reservedSeats.map((seat, index) => ({ value: `seat:${index}`, label: seat.name.trim() || `${selectedGuest?.full_name ?? name.trim()} friend #${index + 1}`, status: seat.status })).filter(seat => seat.status === 'attending'),
  ];
  return <div className="public-rsvp-lookup">
    <form onSubmit={preview ? event => event.preventDefault() : submit}><label>Your name<input value={name} onChange={input => { setName(input.target.value); setMessage(''); setMatches([]); setModalOpen(false); setDeclineWarningOpen(false); }} placeholder="Enter your invitation name" readOnly={preview} required={!preview} /></label><button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Searching...' : buttonLabel}</button></form>
    {!preview && matches.length > 0 && <div className="public-rsvp-matches" aria-label="Matching invitations"><p>Select your name from the list</p>{matches.map(guest => <button key={guest.id} type="button" onClick={() => openGuest(guest)}>{guest.full_name}</button>)}</div>}
    {!preview && message && <p role="status">{message}</p>}
    <Modal isOpen={!preview && modalOpen} onClose={() => { if (declineWarningOpen) setDeclineWarningOpen(false); else setModalOpen(false); }} className="public-rsvp-modal" ariaLabel="RSVP response">
      <button type="button" className="public-rsvp-close" onClick={() => { setDeclineWarningOpen(false); setModalOpen(false); }} aria-label="Close RSVP"><X size={20} /></button>
      {selectedGuest && !declineWarningOpen && <form className="public-rsvp-response" onSubmit={save}>
        <h2>RSVP for {selectedGuest.full_name}</h2>
        <p className="public-rsvp-step">Step {page} of {additionalCount > 0 ? 2 : 1}</p>
        {page === 1 ? <>
          <div className="public-rsvp-reserved"><span>Reserved for you</span><strong>{additionalCount + 1} {additionalCount === 0 ? 'seat' : 'seats'}</strong>{additionalCount > 0 && <p>Including {additionalCount} {additionalCount === 1 ? 'additional guest' : 'additional guests'}</p>}</div>
          <label>Will you attend?<select value={status} onChange={input => { const next = input.target.value as RsvpStatus; if (next === 'declined' && additionalCount > 0 && status !== 'declined') { setDeclineWarningOpen(true); return; } setStatus(next); if (next !== 'declined') { setProxyRequired(false); setProxy(''); } }}><option value="attending">Attending</option><option value="declined">Not attending</option><option value="undecided">Still deciding</option></select></label>
          {additionalCount > 0 ? <button type="button" onClick={() => { setMessage(''); setPage(2); }}>Next: additional guests</button> : <>
            {dietaryEnabled && <label>Dietary notes<textarea value={dietaryNotes} onChange={input => setDietaryNotes(input.target.value)} rows={3} /></label>}
            <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save RSVP'}</button>
          </>}
        </> : <>
          <p>Choose an attendance response for each additional seat.</p>
          {selectedGuest.companions.map((companion, index) => <div className="public-rsvp-seat" key={companion.id}>
            <strong>{companion.full_name}</strong><label>Attendance<select value={namedChoices[index]?.status ?? 'undecided'} onChange={input => setNamedChoices(current => current.map((choice, position) => position === index ? { ...choice, status: input.target.value as RsvpStatus } : choice))}><option value="attending">Attending</option><option value="declined">Not attending</option><option value="undecided">Still deciding</option></select></label>
          </div>)}
          {reservedSeats.map((seat, index) => <div className="public-rsvp-seat" key={index}>
            <strong>Additional guest #{selectedGuest.companions.length + index + 1}</strong>
            <label>Name (optional)<input maxLength={255} value={seat.name} placeholder={`${selectedGuest.full_name.slice(0, 230)} friend #${index + 1}`} onChange={input => setReservedSeats(current => current.map((choice, position) => position === index ? { ...choice, name: input.target.value } : choice))} /></label>
            <label>Attendance<select value={seat.status} onChange={input => setReservedSeats(current => current.map((choice, position) => position === index ? { ...choice, status: input.target.value as RsvpStatus } : choice))}><option value="attending">Attending</option><option value="declined">Not attending</option><option value="undecided">Still deciding</option></select></label>
          </div>)}
          {status === 'declined' && attendingOptions.length > 0 && <label>Who will be your proxy?<select value={attendingOptions.some(option => option.value === proxy) ? proxy : ''} onChange={input => setProxy(input.target.value)} required><option value="">Choose an attending additional guest</option>{attendingOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
          {status === 'declined' && !proxyRequired && <button type="button" className="public-rsvp-decline-all" onClick={declineAllSeats}>Decline all reserved additional seats</button>}
          {dietaryEnabled && <label>Dietary notes<textarea value={dietaryNotes} onChange={input => setDietaryNotes(input.target.value)} rows={3} /></label>}
          <div className="public-rsvp-actions"><button type="button" onClick={() => { setMessage(''); setPage(1); }}>Back</button><button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save RSVP'}</button></div>
        </>}
        {message && <p role="alert">{message}</p>}
      </form>}
      {needsResponse && <form className="public-rsvp-response" onSubmit={submitUnmatchedResponse}><h2>Name not found</h2><p>We couldn't find {name.trim()} on the guest list. You can still send an RSVP request; the host will review it before your attendance is confirmed. Additional guests are not available for unlisted names.</p><label>Your name<input value={name} onChange={input => setName(input.target.value)} required maxLength={255} /></label><label>Will you attend?<select value={status} onChange={input => setStatus(input.target.value as RsvpStatus)}><option value="attending">Attending</option><option value="declined">Not attending</option><option value="undecided">Still deciding</option></select></label><label>Email<input type="email" value={email} onChange={input => setEmail(input.target.value)} /></label><label>Contact number<input type="tel" value={phone} onChange={input => setPhone(input.target.value)} /></label>{dietaryEnabled && <label>Dietary notes<textarea value={dietaryNotes} onChange={input => setDietaryNotes(input.target.value)} rows={3} /></label>}{message && <p role="alert">{message}</p>}<button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Sending...' : 'Send RSVP to host'}</button></form>}
      {selectedGuest && declineWarningOpen && <div className="public-rsvp-warning-backdrop">
        <div className="public-rsvp-warning" role="alertdialog" aria-modal="true" aria-labelledby="public-rsvp-warning-title" aria-describedby="public-rsvp-warning-description">
          <h3 id="public-rsvp-warning-title">You won't be attending?</h3>
          <p id="public-rsvp-warning-description">You have {additionalCount} reserved additional {additionalCount === 1 ? 'seat' : 'seats'}. Choose an attending additional guest as your proxy, or decline every reserved additional seat. Nothing will be saved until you submit your RSVP.</p>
          <button type="button" autoFocus onClick={() => { setStatus('declined'); setProxyRequired(true); setDeclineWarningOpen(false); setMessage(''); setPage(2); }}>Choose a proxy</button>
          <button type="button" onClick={declineAllSeats}>Decline all additional seats</button>
          <button type="button" onClick={() => setDeclineWarningOpen(false)}>Keep my response</button>
        </div>
      </div>}
    </Modal>
  </div>;
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

const InvitationDocument = ({ document, eventName, eventId, dietaryEnabled = true, preview = false }: InvitationDocumentProps) => {
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
        <span className="public-invitation-ornament" aria-hidden="true" />
        <p className="public-invitation-date">{date}</p><h1>{names}</h1><p className="public-invitation-message">{message}</p><a href="#rsvp" className="public-invitation-rsvp-link">RSVP</a>
      </section>}
      {document.sections.filter(section => section.visible && section.type !== 'hero').map(section => {
        if (section.type === 'rsvp') return <section className="public-invitation-rsvp is-visible" id={invitationSectionId(section)} tabIndex={-1} key={section.id}><div><p className="public-invitation-rsvp-kicker">Celebrate with us</p><h2>{contentText(section.content, 'title')}</h2><p>Search your name to find your invitation and respond.</p><PublicRsvpLookup eventId={eventId} dietaryEnabled={dietaryEnabled} buttonLabel={contentText(section.content, 'button_label') || 'Respond'} preview={preview} /></div></section>;
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
      <CopyrightFooter className="public-invitation-footer" />
    </div>
  );
};

export default InvitationDocument;