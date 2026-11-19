import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, CircleAlert, MapPinned, X } from 'lucide-react';
import { getPhotoUrl } from '../../services/dataService';
import type { WebsiteDocument } from '../../services/websiteService';
import { invitationSectionId, withLegacyInvitationSections } from '../../utils/invitationSections';
import { invitationTimeline } from '../../utils/invitationTimeline';
import { invitationColors } from '../../utils/invitationColors';
import attireIllustration from '../../assets/images/attire-illustration.svg';
import { submitPublicGroupRsvp, submitPublicGuestRsvp, submitPublicRsvpLookup } from '../../services/rsvpService';
import type { CompanionChoice, PublicGuestMatch, ReservedSeatChoice, RsvpStatus } from '../../services/rsvpService';
import { downloadRsvpReceiptPdf, prepareRsvpReceiptPdf, rsvpStatusLabel } from '../../utils/rsvpReceiptPdf';
import type { RsvpReceipt } from '../../utils/rsvpReceiptPdf';
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

const PublicRsvpLookup = ({ eventId, eventName, buttonLabel, preview, dietaryEnabled = true }: { eventId?: string; eventName: string; buttonLabel: string; preview: boolean; dietaryEnabled?: boolean }) => {
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
  const [reviewOpen, setReviewOpen] = useState(false);
  const [receipt, setReceipt] = useState<RsvpReceipt | null>(null);
  const [pdfReady, setPdfReady] = useState(false);
  const [namedChoices, setNamedChoices] = useState<CompanionChoice[]>([]);
  const [groupChoices, setGroupChoices] = useState<CompanionChoice[]>([]);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dietaryNotes, setDietaryNotes] = useState('');
  const [message, setMessage] = useState('');
  const [errorToast, setErrorToast] = useState<{ id: number; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const showError = useCallback((error: unknown, fallback: string) => {
    const message = error instanceof Error && !(error instanceof TypeError) ? error.message : fallback;
    setErrorToast(current => ({ id: (current?.id ?? 0) + 1, message }));
  }, []);

  useEffect(() => {
    if (!errorToast) return;
    const timeout = window.setTimeout(() => setErrorToast(current => current?.id === errorToast.id ? null : current), 6000);
    return () => window.clearTimeout(timeout);
  }, [errorToast]);

  useEffect(() => {
    if (!receipt) return;
    let active = true;
    prepareRsvpReceiptPdf().then(() => { if (active) setPdfReady(true); })
      .catch(error => { if (active) showError(error, 'Could not load the PDF generator. Please try again.'); });
    return () => { active = false; };
  }, [receipt, showError]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventId || !name.trim()) return;
    setIsSubmitting(true);
    try { const result = await submitPublicRsvpLookup(eventId, name); setMatches(result.matches); setSelectedGuest(null); setNeedsResponse(Boolean(result.needs_response)); setModalOpen(Boolean(result.needs_response)); setStatus('attending'); setPage(1); setReservedSeats([]); setProxy(''); setProxyRequired(false); setDeclineWarningOpen(false); setReviewOpen(false); setReceipt(null); setMessage(''); setErrorToast(null); }
    catch (error) { showError(error, 'Could not search invitations. Check your connection and try again.'); }
    finally { setIsSubmitting(false); }
  };

  const review = (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventId || !selectedGuest) return;
    const attendingCount = namedChoices.filter(choice => choice.status === 'attending').length + reservedSeats.filter(seat => seat.status === 'attending').length;
    if (selectedGuest.group_id) { setMessage(''); setReviewOpen(true); return; }
    if (status === 'declined' && proxyRequired && attendingCount === 0) { showError(null, 'Choose an additional guest to attend as your proxy.'); return; }
    if (status === 'declined' && attendingCount > 0 && !attendingOptions.some(option => option.value === proxy)) { showError(null, 'Choose an attending additional guest as your proxy.'); return; }
    setMessage('');
    setReviewOpen(true);
  };
  const save = async () => {
    if (!eventId || !selectedGuest || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const groupStatus = groupChoices.some(choice => choice.status === 'attending') ? 'attending' : groupChoices.some(choice => choice.status === 'undecided') ? 'undecided' : 'declined';
      const saved = selectedGuest.group_id
        ? await submitPublicGroupRsvp(eventId, selectedGuest, groupChoices, dietaryEnabled ? dietaryNotes : undefined)
        : await submitPublicGuestRsvp(eventId, selectedGuest, { status, namedCompanions: namedChoices, reservedSeats, proxy: status === 'declined' && proxy ? proxy.startsWith('named:') ? { id: proxy.slice(6) } : { index: Number(proxy.slice(5)) } : null, dietaryNotes: dietaryEnabled ? dietaryNotes : undefined });
      setPdfReady(false);
      setReceipt({ kind: 'listed', guestName: selectedGuest.full_name, status: selectedGuest.group_id ? groupStatus : status, companions: companionResponses, proxyName: status === 'declined' && !selectedGuest.group_id ? attendingOptions.find(option => option.value === proxy)?.label : undefined, submittedAt: saved.submitted_at, reference: saved.id });
      setReviewOpen(false); setNeedsResponse(false); setMatches([]); setMessage(''); setErrorToast(null);
    }
    catch (error) { showError(error, 'Could not save RSVP. Check your connection and try again.'); }
    finally { setIsSubmitting(false); }
  };
  const reviewUnmatchedResponse = (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventId || !name.trim()) return;
    setMessage('');
    setReviewOpen(true);
  };
  const submitUnmatchedResponse = async () => {
    if (!eventId || !name.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await submitPublicRsvpLookup(eventId, name, { status, partyCount: status === 'attending' ? 1 : 0, plusOneCount: 0, attendeeNames: [], contactEmail: email, contactPhone: phone, dietaryNotes: dietaryEnabled ? dietaryNotes : undefined });
      setReviewOpen(false);
      setErrorToast(null);
      if (result.matches.length) { setMatches(result.matches); setSelectedGuest(null); setNeedsResponse(false); setModalOpen(false); setMessage('We found an invitation. Please select your name below.'); }
      else { setPdfReady(false); setReceipt({ kind: 'pending', guestName: name.trim(), status, companions: [], submittedAt: new Date().toISOString() }); setNeedsResponse(false); setMessage(''); }
    }
    catch (error) { showError(error, 'Could not send RSVP. Check your connection and try again.'); }
    finally { setIsSubmitting(false); }
  };
  const openGuest = (guest: PublicGuestMatch) => {
    setSelectedGuest(guest);
    setReviewOpen(false); setReceipt(null);
    setStatus(guest.response_status ?? 'attending');
    setDeclineWarningOpen(false);
    setNamedChoices(guest.companions.map(companion => ({ id: companion.id, status: companion.status ?? 'undecided' })));
    setGroupChoices((guest.members ?? []).map(member => ({ id: member.id, status: member.status ?? 'undecided' })));
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
  const setAllSeats = (next: RsvpStatus) => {
    setStatus(next);
    setNamedChoices(current => current.map(choice => ({ ...choice, status: next })));
    setReservedSeats(current => current.map(seat => ({ ...seat, status: next })));
    setGroupChoices(current => current.map(choice => ({ ...choice, status: next })));
    setProxy('');
    setProxyRequired(false);
    setMessage('');
  };
  const additionalCount = selectedGuest?.group_id ? (selectedGuest.members?.length ?? 0) : (selectedGuest?.plus_limit ?? 0);
  const attendingOptions = [
    ...(selectedGuest?.companions ?? []).filter((_, index) => namedChoices[index]?.status === 'attending').map(companion => ({ value: `named:${companion.id}`, label: companion.full_name })),
    ...reservedSeats.map((seat, index) => ({ value: `seat:${index}`, label: seat.name.trim() || `${selectedGuest?.full_name ?? name.trim()} friend #${index + 1}`, status: seat.status })).filter(seat => seat.status === 'attending'),
  ];
  const companionResponses = selectedGuest ? [
    ...(selectedGuest.group_id ? (selectedGuest.members ?? []).map((member, index) => ({ name: member.full_name, status: groupChoices[index]?.status ?? 'undecided' })) : selectedGuest.companions.map((companion, index) => ({ name: companion.full_name, status: namedChoices[index]?.status ?? 'undecided' }))),
    ...reservedSeats.map((seat, index) => ({ name: seat.name.trim() || `${selectedGuest.full_name.slice(0, 230)} friend #${index + 1}`, status: seat.status })),
  ] : [];
  return <div className="public-rsvp-lookup">
    {errorToast && createPortal(<div key={errorToast.id} className="public-rsvp-error-toast" role="alert">
      <CircleAlert size={19} aria-hidden="true" /><span>{errorToast.message}</span>
      <button type="button" aria-label="Dismiss RSVP error" onClick={() => setErrorToast(null)}><X size={17} aria-hidden="true" /></button>
    </div>, document.body)}
    <form onSubmit={preview ? event => event.preventDefault() : submit}><label>Your name or group name<input value={name} onChange={input => { setName(input.target.value); setMessage(''); setMatches([]); setModalOpen(false); setDeclineWarningOpen(false); setReviewOpen(false); setReceipt(null); }} placeholder="Enter your name or group name" readOnly={preview} required={!preview} /></label><button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Searching...' : buttonLabel}</button></form>
    {!preview && matches.length > 0 && <div className="public-rsvp-matches" aria-label="Matching invitations"><p>Select your invitation from the list</p>{matches.map(guest => <button key={guest.id} type="button" onClick={() => openGuest(guest)}>{guest.full_name}{guest.group_id ? ' (group)' : ''}</button>)}</div>}
    {!preview && message && <p role="status">{message}</p>}
    <Modal isOpen={!preview && modalOpen} onClose={() => { if (declineWarningOpen) setDeclineWarningOpen(false); else if (reviewOpen) setReviewOpen(false); else setModalOpen(false); }} className="public-rsvp-modal" ariaLabel="RSVP response">
      <button type="button" className="public-rsvp-close" onClick={() => { setDeclineWarningOpen(false); setModalOpen(false); }} aria-label="Close RSVP"><X size={20} /></button>
      {selectedGuest && !declineWarningOpen && !reviewOpen && !receipt && <form className="public-rsvp-response" onSubmit={review}>
        <h2>RSVP for {selectedGuest.full_name}</h2>
        <p className="public-rsvp-step">Step {page} of {additionalCount > 0 ? 2 : 1}</p>
        {page === 1 ? <>
          <div className="public-rsvp-reserved"><span>Reserved for {selectedGuest.group_id ? 'your group' : 'you'}</span><strong>{selectedGuest.group_id ? additionalCount : additionalCount + 1} {additionalCount === 0 && !selectedGuest.group_id ? 'seat' : 'seats'}</strong>{additionalCount > 0 && !selectedGuest.group_id && <p>Including {additionalCount} {additionalCount === 1 ? 'additional guest' : 'additional guests'}</p>}</div>
          {selectedGuest.group_id ? <button type="button" onClick={() => { setMessage(''); setPage(2); }}>Next: group members</button> : <>
          <label>Will you attend?<select value={status} onChange={input => { const next = input.target.value as RsvpStatus; if (next === 'declined' && additionalCount > 0 && status !== 'declined') { setDeclineWarningOpen(true); return; } setStatus(next); if (next !== 'declined') { setProxyRequired(false); setProxy(''); } }}><option value="attending">Attending</option><option value="declined">Not attending</option><option value="undecided">Still deciding</option></select></label>
          {additionalCount > 0 ? <button type="button" onClick={() => { setMessage(''); setPage(2); }}>Next: additional guests</button> : <>
            {dietaryEnabled && <label>Dietary notes<textarea value={dietaryNotes} onChange={input => setDietaryNotes(input.target.value)} rows={3} /></label>}
            <button type="submit">Review RSVP</button>
          </>}</>}
        </> : <>
          <div className="public-rsvp-bulk"><button type="button" onClick={() => setAllSeats('attending')}>Attend all</button><button type="button" onClick={() => setAllSeats('declined')}>Decline all</button></div>
          <p>Choose an attendance response for each {selectedGuest.group_id ? 'group member' : 'additional seat'}.</p>
          {selectedGuest.group_id && selectedGuest.members?.map((member, index) => <div className="public-rsvp-seat" key={member.id}>
            <strong>{member.full_name}</strong><label>Attendance<select value={groupChoices[index]?.status ?? 'undecided'} onChange={input => setGroupChoices(current => current.map((choice, position) => position === index ? { ...choice, status: input.target.value as RsvpStatus } : choice))}><option value="attending">Attending</option><option value="declined">Not attending</option><option value="undecided">Still deciding</option></select></label>
          </div>)}
          {selectedGuest.companions.map((companion, index) => <div className="public-rsvp-seat" key={companion.id}>
            <strong>{companion.full_name}</strong><label>Attendance<select value={namedChoices[index]?.status ?? 'undecided'} onChange={input => setNamedChoices(current => current.map((choice, position) => position === index ? { ...choice, status: input.target.value as RsvpStatus } : choice))}><option value="attending">Attending</option><option value="declined">Not attending</option><option value="undecided">Still deciding</option></select></label>
          </div>)}
          {reservedSeats.map((seat, index) => <div className="public-rsvp-seat" key={index}>
            <strong>Additional guest #{selectedGuest.companions.length + index + 1}</strong>
            <label>Name (optional)<input maxLength={255} value={seat.name} placeholder={`${selectedGuest.full_name.slice(0, 230)} friend #${index + 1}`} onChange={input => setReservedSeats(current => current.map((choice, position) => position === index ? { ...choice, name: input.target.value } : choice))} /></label>
            <label>Attendance<select value={seat.status} onChange={input => setReservedSeats(current => current.map((choice, position) => position === index ? { ...choice, status: input.target.value as RsvpStatus } : choice))}><option value="attending">Attending</option><option value="declined">Not attending</option><option value="undecided">Still deciding</option></select></label>
          </div>)}
          {!selectedGuest.group_id && status === 'declined' && attendingOptions.length > 0 && <label>Who will be your proxy?<select value={attendingOptions.some(option => option.value === proxy) ? proxy : ''} onChange={input => setProxy(input.target.value)} required><option value="">Choose an attending additional guest</option>{attendingOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
          {!selectedGuest.group_id && status === 'declined' && !proxyRequired && <button type="button" className="public-rsvp-decline-all" onClick={declineAllSeats}>Decline all reserved additional seats</button>}
          {dietaryEnabled && <label>Dietary notes<textarea value={dietaryNotes} onChange={input => setDietaryNotes(input.target.value)} rows={3} /></label>}
          <div className="public-rsvp-actions"><button type="button" onClick={() => { setMessage(''); setPage(1); }}>Back</button><button type="submit">Review RSVP</button></div>
        </>}
        {message && <p role="alert">{message}</p>}
      </form>}
      {needsResponse && !reviewOpen && !receipt && <form className="public-rsvp-response" onSubmit={reviewUnmatchedResponse}><h2>Name not found</h2><p>We couldn't find {name.trim()} on the guest list. You can still send an RSVP request; the host will review it before your attendance is confirmed. Additional guests are not available for unlisted names.</p><label>Your name<input value={name} onChange={input => setName(input.target.value)} required maxLength={255} /></label><label>Will you attend?<select value={status} onChange={input => setStatus(input.target.value as RsvpStatus)}><option value="attending">Attending</option><option value="declined">Not attending</option><option value="undecided">Still deciding</option></select></label><label>Email<input type="email" value={email} onChange={input => setEmail(input.target.value)} /></label><label>Contact number<input type="tel" value={phone} onChange={input => setPhone(input.target.value)} /></label>{dietaryEnabled && <label>Dietary notes<textarea value={dietaryNotes} onChange={input => setDietaryNotes(input.target.value)} rows={3} /></label>}{message && <p role="alert">{message}</p>}<button type="submit">Review request</button></form>}
      {reviewOpen && <div className="public-rsvp-review">
        <p className="public-rsvp-step">Confirm before sending</p>
        <h2>Review your {selectedGuest ? 'RSVP' : 'request'}</h2>
        {!selectedGuest && <p>Your name was not found on the guest list. The host must review this request before it can be confirmed.</p>}
        <div className="public-rsvp-review-summary">
          <p><strong>Event</strong><span>{eventName}</span></p>
          <p><strong>{selectedGuest ? 'Invitation' : 'Requested name'}</strong><span>{selectedGuest?.full_name ?? name.trim()}</span></p>
          <p><strong>{selectedGuest?.group_id ? 'Group response' : 'Your response'}</strong><span>{rsvpStatusLabel(selectedGuest?.group_id ? groupChoices.some(choice => choice.status === 'attending') ? 'attending' : groupChoices.some(choice => choice.status === 'undecided') ? 'undecided' : 'declined' : status)}</span></p>
          {companionResponses.map((companion, index) => <p key={index}><strong>{companion.name}</strong><span>{rsvpStatusLabel(companion.status)}</span></p>)}
          {selectedGuest && status === 'declined' && proxy && <p><strong>Proxy for {selectedGuest.full_name}</strong><span>{attendingOptions.find(option => option.value === proxy)?.label}</span></p>}
        </div>
        {message && <p role="alert">{message}</p>}
        <div className="public-rsvp-actions"><button type="button" autoFocus disabled={isSubmitting} onClick={() => { setReviewOpen(false); setMessage(''); }}>Edit response</button><button type="button" disabled={isSubmitting} onClick={selectedGuest ? save : submitUnmatchedResponse}>{isSubmitting ? 'Sending...' : selectedGuest ? 'Confirm and save RSVP' : 'Confirm and send to host'}</button></div>
      </div>}
      {receipt && <div className="public-rsvp-receipt" role="status" aria-label={receipt.kind === 'listed' ? 'Guest list RSVP receipt' : 'RSVP request receipt'}>
        <div className="public-rsvp-receipt-card">
          <span className="public-rsvp-receipt-kicker">madeTogether · RSVP receipt</span>
          <h2>{receipt.kind === 'listed' ? 'You are on the guest list' : 'Request sent for host review'}</h2>
          <p className="public-rsvp-receipt-event">{eventName}</p>
          <div className="public-rsvp-review-summary">
            <p><strong>{receipt.kind === 'listed' ? 'Invitation' : 'Requested name'}</strong><span>{receipt.guestName}</span></p>
            <p><strong>{receipt.kind === 'listed' ? 'Your RSVP' : 'Requested response'}</strong><span>{rsvpStatusLabel(receipt.status)}</span></p>
            {receipt.companions.map((companion, index) => <p key={index}><strong>{companion.name}</strong><span>{rsvpStatusLabel(companion.status)}</span></p>)}
            {receipt.proxyName && <p><strong>Proxy of {receipt.guestName}</strong><span>{receipt.proxyName}</span></p>}
            <p><strong>Submitted</strong><time dateTime={receipt.submittedAt}>{new Date(receipt.submittedAt).toLocaleString()}</time></p>
          </div>
          {receipt.reference && <p className="public-rsvp-reference">Reference: {receipt.reference}</p>}
          <p className="public-rsvp-receipt-note">{receipt.kind === 'listed' ? 'Your RSVP is recorded. Download this receipt for your records.' : 'This is proof of your request, not confirmation that you are on the guest list. The host will review it.'}</p>
        </div>
        {message && <p role="alert">{message}</p>}
        <div className="public-rsvp-actions"><button type="button" autoFocus disabled={!pdfReady} onClick={() => {
          try { downloadRsvpReceiptPdf(receipt, eventName); setMessage(''); }
          catch (error) { showError(error, 'Could not download the PDF receipt. Please try again.'); }
        }}>{pdfReady ? 'Download PDF' : 'Preparing PDF...'}</button><button type="button" onClick={() => setModalOpen(false)}>Done</button></div>
      </div>}
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
  const sections = withLegacyInvitationSections(document).sections;
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
      {sections.filter(section => section.visible && section.type !== 'hero').map(section => {
        if (section.type === 'rsvp') return <section className="public-invitation-rsvp is-visible" id={invitationSectionId(section)} tabIndex={-1} key={section.id}><div><p className="public-invitation-rsvp-kicker">Celebrate with us</p><h2>{contentText(section.content, 'title')}</h2><p>Search your name to find your invitation and respond.</p><PublicRsvpLookup eventId={eventId} eventName={names} dietaryEnabled={dietaryEnabled} buttonLabel={contentText(section.content, 'button_label') || 'Respond'} preview={preview} /></div></section>;
        if (section.type === 'story') return <section className="public-invitation-section public-invitation-story" id={invitationSectionId(section)} tabIndex={-1} key={section.id}><p className="public-invitation-section-kicker">{contentText(section.content, 'title')}</p><p>{contentText(section.content, 'body')}</p></section>;
        if (section.type === 'details') {
          const venue = contentText(section.content, 'venue');
          const ceremonyPlace = contentText(section.content, 'ceremony_place');
          const venueDirections = safeDirectionsUrl(contentText(section.content, 'venue_directions_url') || contentText(section.content, 'directions_url'));
          const ceremonyDirections = safeDirectionsUrl(contentText(section.content, 'ceremony_directions_url'));
          const locations = [
            { label: 'Ceremony', place: ceremonyPlace, time: contentText(section.content, 'ceremony_time'), directions: ceremonyDirections },
            { label: 'Venue', place: venue, time: contentText(section.content, 'venue_time'), directions: venueDirections },
          ].filter(location => location.place || location.time);
          return <section className="public-invitation-section public-invitation-details" id={invitationSectionId(section)} tabIndex={-1} key={section.id}>
            <p className="public-invitation-section-kicker">{contentText(section.content, 'title')}</p>
            {locations.length > 0 && <div className="public-invitation-locations">{locations.map(location => {
              const mapEmbedUrl = googleMapsEmbedUrl(location.place);
              return <article key={location.label}>
                <p className="public-location-label">{location.label}</p>
                {location.place && <p className="public-location-place">{location.place}</p>}
                {location.time && <p>{location.time}</p>}
                {mapEmbedUrl && <iframe className="public-invitation-map" title={`Map for ${location.place}`} src={mapEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />}
                {location.directions && <a className="public-invitation-directions" href={location.directions} target="_blank" rel="noreferrer"><MapPinned size={18} aria-hidden="true" /> Get directions</a>}
              </article>;
            })}</div>}
          </section>;
        }
        if (section.type === 'timeline') {
          const entries = invitationTimeline(section.content).filter(entry => entry.time.trim() || entry.title.trim() || entry.details?.trim());
          if (entries.length === 0) return null;
          return <section className="public-invitation-section public-invitation-timeline-section" id={invitationSectionId(section)} tabIndex={-1} key={section.id}>
            <p className="public-invitation-section-kicker">{contentText(section.content, 'title')}</p>
            <ol className="public-invitation-timeline">{entries.map(entry => <li key={entry.id}><div>
              {entry.time.trim() && <span className="public-timeline-time">{entry.time}</span>}
              {entry.title.trim() && <strong>{entry.title}</strong>}
              {entry.details?.trim() && <p className="public-timeline-details">{entry.details}</p>}
            </div></li>)}</ol>
          </section>;
        }
        if (section.type === 'attire') {
          const motif = contentText(section.content, 'motif');
          const note = contentText(section.content, 'color_note');
          const colors = invitationColors(section.content);
          if (!motif.trim() && !note.trim() && colors.length === 0) return null;
          return <section className="public-invitation-section public-invitation-attire" id={invitationSectionId(section)} tabIndex={-1} key={section.id}>
            <p className="public-invitation-section-kicker">{contentText(section.content, 'title')}</p>
            <span className="public-attire-illustration" aria-hidden="true" style={{ maskImage: `url("${attireIllustration}")` }} />
            {motif && <p className="public-attire-motif">{motif}</p>}
            {note && <p>{note}</p>}
            {colors.length > 0 && <div className="public-attire-palette" aria-label="Clothing color palette">{colors.map((color, index) => <div key={index}><span style={{ backgroundColor: color.hex }} role="img" aria-label={color.name.trim() || `Clothing color ${index + 1}`} />{color.name.trim() && <small>{color.name.trim()}</small>}</div>)}</div>}
          </section>;
        }
        if (section.type === 'gifts') {
          const instructions = contentText(section.content, 'instructions');
          if (!instructions.trim()) return null;
          return <section className="public-invitation-section public-invitation-gifts" id={invitationSectionId(section)} tabIndex={-1} key={section.id}>
            <p className="public-invitation-section-kicker">{contentText(section.content, 'title')}</p>
            <p>{instructions}</p>
          </section>;
        }
        if (section.type === 'gallery') {
          const paths = Array.isArray(section.content.photo_paths) ? section.content.photo_paths.filter((path): path is string => typeof path === 'string') : [];
          const selectedLayout = contentText(section.content, 'layout');
          const layout = selectedLayout === 'strip' || selectedLayout === 'carousel' ? selectedLayout : 'grid';
          return <section className="public-invitation-section public-invitation-gallery" id={invitationSectionId(section)} tabIndex={-1} key={section.id}><p className="public-invitation-section-kicker">{contentText(section.content, 'title')}</p><InvitationGallery paths={paths} layout={layout} /></section>;
        }
        if (section.type === 'entourage') {
          const groups = entourageGroups(section.content).map(group => ({ ...group, members: group.members.map(member => member.trim()).filter(Boolean) }));
          const sponsors = groups.find(group => group.id === 'sponsors');
          const party = groups.filter(group => group.id !== 'sponsors' && group.members.length > 0);
          return <section className="public-invitation-section public-invitation-entourage" id={invitationSectionId(section)} tabIndex={-1} key={section.id}>
            {(party.length > 0 || !sponsors?.members.length) && <p className="public-invitation-section-kicker">{contentText(section.content, 'title')}</p>}
            {party.length > 0 && <div className="public-entourage-party">{party.map(group => <article key={group.id}>
              <h2>{group.title}</h2>
              <ul>{group.members.map((member, index) => <li key={`${index}-${member}`}>{member}</li>)}</ul>
            </article>)}</div>}
            {sponsors && sponsors.members.length > 0 && <div className={`public-entourage-sponsors ${party.length > 0 ? 'has-party' : ''}`}>
              <h2 className="public-invitation-section-kicker">{sponsors.title}</h2>
              <ul>{sponsors.members.map((member, index) => <li key={`${index}-${member}`}>{member}</li>)}</ul>
            </div>}
          </section>;
        }
        if (section.type === 'closing') return <section className="public-invitation-section public-invitation-closing" id={invitationSectionId(section)} tabIndex={-1} key={section.id}><p>{contentText(section.content, 'message')}</p></section>;
        return null;
      })}
      <CopyrightFooter className="public-invitation-footer" />
    </div>
  );
};

export default InvitationDocument;