import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getRsvpResponses, getRsvpVerificationRequests, reviewRsvpVerificationRequest, updateRsvpPlusLimit } from '../services/rsvpService';
import type { RsvpResponse, RsvpStatus, RsvpVerificationRequest } from '../services/rsvpService';
import type { GuestGroup, InvitationGuest } from '../services/guestService';
import { getEvent } from '../services/dataService';
import './RsvpHostPanel.css';

interface RsvpHostPanelProps {
  eventId: string;
  hostCode: string;
  guests: InvitationGuest[];
  groups: GuestGroup[];
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onRosterUpdated: () => Promise<void>;
}

const RsvpHostPanel = ({ eventId, hostCode, guests, groups, onSuccess, onError, onRosterUpdated }: RsvpHostPanelProps) => {
  const [responses, setResponses] = useState<RsvpResponse[]>([]);
  const [requests, setRequests] = useState<RsvpVerificationRequest[]>([]);
  const [selectedGuests, setSelectedGuests] = useState<Record<string, string>>({});
  const [selectedGroups, setSelectedGroups] = useState<Record<string, string>>({});
  const [draftPlusLimit, setDraftPlusLimit] = useState(0);

  const load = async () => {
    try {
      const [loadedResponses, loadedRequests] = await Promise.all([getRsvpResponses(eventId, hostCode), getRsvpVerificationRequests(eventId, hostCode)]);
      setResponses(loadedResponses);
      setRequests(loadedRequests);
    } catch { onError('Could not load RSVP activity.'); }
  };

  useEffect(() => {
    load();
    getEvent(eventId).then(event => setDraftPlusLimit(event.rsvp_plus_limit ?? 0)).catch(() => undefined);
  }, [eventId, hostCode]);

  const count = (status: RsvpStatus) => responses.filter(response => response.status === status).length;
  const confirmedGuestTotal = responses.filter(response => response.status === 'attending').reduce((total, response) => total + Math.max(0, response.party_count - response.plus_one_count), 0);
  const plusTotal = responses.filter(response => response.status === 'attending').reduce((total, response) => total + response.plus_one_count, 0);
  const totalConfirmed = confirmedGuestTotal + plusTotal;

  const savePlusLimit = async () => {
    const value = Math.max(0, Math.min(100, draftPlusLimit));
    try { await updateRsvpPlusLimit(eventId, hostCode, value); setDraftPlusLimit(value); onSuccess(`Additional guest limit set to ${value}.`); } catch { onError('Could not update additional guest limit.'); }
  };
  const review = async (request: RsvpVerificationRequest, status: 'approved' | 'rejected', createGuest = false) => {
    const guestId = selectedGuests[request.id];
    const groupId = selectedGroups[request.id];
    if (status === 'approved' && !guestId && !createGuest) { onError('Choose the verified guest or add this person as a new guest.'); return; }
    try { await reviewRsvpVerificationRequest(eventId, hostCode, request.id, status, guestId, createGuest, groupId); await onRosterUpdated(); onSuccess(createGuest ? 'Guest added and RSVP recorded.' : `Verification request ${status}.`); await load(); } catch { onError('Could not review verification request.'); }
  };

  return <section className="rsvp-host-panel">
    <div className="rsvp-host-heading"><div><p>RSVP</p><h2>Responses</h2></div><div className="rsvp-status-summary"><span className="rsvp-total-confirmed"><b>{totalConfirmed}</b> Total confirmed</span><span><b>{confirmedGuestTotal}</b> Confirmed guests</span><span><b>{plusTotal}</b> Pluses</span><span><b>{count('declined')}</b> Declined</span><span><b>{guests.length - responses.length}</b> Awaiting</span></div></div>
    <section className="rsvp-plus-settings"><div><p>Additional guests</p><span>Set the maximum number of extra guests each RSVP can include.</span></div><label>Maximum<input type="number" min="0" max="100" value={draftPlusLimit} onChange={input => setDraftPlusLimit(Math.max(0, Math.min(100, Number(input.target.value) || 0)))} /></label><button type="button" onClick={savePlusLimit}>Save</button></section>
    {requests.filter(request => request.status === 'pending').length > 0 && <div className="rsvp-request-queue"><h3>Verification requests</h3>{requests.filter(request => request.status === 'pending').map(request => <div key={request.id}><div className="rsvp-request-details"><strong>{request.submitted_name}</strong><span>{request.status_response ?? 'No RSVP status'} | party {request.party_count} | +{request.plus_one_count}</span>{request.contact_phone && <span>{request.contact_phone}</span>}</div><select value={selectedGuests[request.id] ?? ''} onChange={input => setSelectedGuests(current => ({ ...current, [request.id]: input.target.value }))}><option value="">Match to existing guest</option>{guests.map(guest => <option key={guest.id} value={guest.id}>{guest.full_name}</option>)}</select><select value={selectedGroups[request.id] ?? ''} onChange={input => setSelectedGroups(current => ({ ...current, [request.id]: input.target.value }))}><option value="">Individual guest</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select><button type="button" onClick={() => review(request, 'approved')}><Check size={15} aria-hidden="true" /> Match</button><button type="button" onClick={() => review(request, 'approved', true)}>Add guest</button><button type="button" onClick={() => review(request, 'rejected')}><X size={15} aria-hidden="true" /> Reject</button></div>)}</div>}
  </section>;
};

export default RsvpHostPanel;