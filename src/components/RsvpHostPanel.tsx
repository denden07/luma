import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getRsvpResponses, getRsvpVerificationRequests, reviewRsvpVerificationRequest, updateRsvpDietaryEnabled, updateRsvpUnlistedEnabled } from '../services/rsvpService';
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
  const [dietaryEnabled, setDietaryEnabled] = useState(true);
  const [unlistedEnabled, setUnlistedEnabled] = useState(true);
  const [requestFilter, setRequestFilter] = useState<'pending' | 'all'>('pending');

  const load = async () => {
    try {
      const [loadedResponses, loadedRequests] = await Promise.all([getRsvpResponses(eventId, hostCode), getRsvpVerificationRequests(eventId, hostCode)]);
      setResponses(loadedResponses);
      setRequests(loadedRequests);
    } catch { onError('Could not load RSVP activity.'); }
  };

  useEffect(() => {
    load();
    getEvent(eventId).then(event => { setDietaryEnabled(event.rsvp_dietary_notes_enabled); setUnlistedEnabled(event.rsvp_unlisted_requests_enabled); }).catch(() => onError('Could not load RSVP settings.'));
  }, [eventId, hostCode]);

  const count = (status: RsvpStatus) => responses.filter(response => response.status === status).length;
  const confirmedGuestTotal = responses.filter(response => response.status === 'attending').reduce((total, response) => total + Math.max(0, response.party_count - response.plus_one_count), 0);
  const plusTotal = responses.filter(response => response.status === 'attending').reduce((total, response) => total + response.plus_one_count, 0);
  const totalConfirmed = confirmedGuestTotal + plusTotal;

  const setDietary = async (enabled: boolean) => {
    try { await updateRsvpDietaryEnabled(eventId, hostCode, enabled); setDietaryEnabled(enabled); onSuccess(enabled ? 'Dietary notes enabled.' : 'Dietary notes disabled.'); } catch { onError('Could not update dietary notes setting.'); }
  };
  const setUnlisted = async (enabled: boolean) => {
    try { await updateRsvpUnlistedEnabled(eventId, hostCode, enabled); setUnlistedEnabled(enabled); onSuccess(enabled ? 'Unlisted RSVP requests allowed.' : 'Unlisted RSVP requests blocked.'); }
    catch (error) { onError(error instanceof Error ? error.message : 'Could not update unlisted RSVP setting.'); }
  };
  const review = async (request: RsvpVerificationRequest, status: 'approved' | 'rejected', createGuest = false) => {
    const guestId = selectedGuests[request.id];
    const groupId = selectedGroups[request.id];
    if (status === 'approved' && !guestId && !createGuest) { onError('Choose the verified guest or add this person as a new guest.'); return; }
    try { await reviewRsvpVerificationRequest(eventId, hostCode, request.id, status, guestId, createGuest, groupId); await onRosterUpdated(); onSuccess(createGuest ? 'Guest added and RSVP recorded.' : `Verification request ${status}.`); await load(); } catch (error) { onError(error instanceof Error ? error.message : 'Could not review verification request.'); }
  };

  return <section className="rsvp-host-panel">
    <div className="rsvp-host-heading"><div><p>RSVP</p><h2>Responses</h2></div><div className="rsvp-status-summary"><span className="rsvp-total-confirmed"><b>{totalConfirmed}</b> Total confirmed</span><span><b>{confirmedGuestTotal}</b> Confirmed guests</span><span><b>{plusTotal}</b> Pluses</span><span><b>{count('declined')}</b> Declined</span><span><b>{guests.filter(guest => !guest.rsvp_status).length}</b> Awaiting</span></div></div>
    <section className="rsvp-plus-settings"><div><p>RSVP settings</p><span>Additional guests are available only when you set an allowance for that guest in the roster. Giving an allowance lets them add people to your guest list when they RSVP.</span></div><label>Unlisted RSVP requests<select value={unlistedEnabled ? 'on' : 'off'} onChange={input => void setUnlisted(input.target.value === 'on')}><option value="on">Allow host-review requests</option><option value="off">Guest list only</option></select></label><label>Dietary notes<select value={dietaryEnabled ? 'on' : 'off'} onChange={input => void setDietary(input.target.value === 'on')}><option value="on">Enabled</option><option value="off">Disabled</option></select></label></section>
    <div className="rsvp-request-queue"><div className="rsvp-request-heading"><div><h3>Verification requests</h3><p>Review names not found on the guest list. Requests are not confirmed until approved.</p></div><label>Show<select value={requestFilter} onChange={input => setRequestFilter(input.target.value as 'pending' | 'all')}><option value="pending">Pending ({requests.filter(request => request.status === 'pending').length})</option><option value="all">All requests</option></select></label></div>
      {requests.filter(request => requestFilter === 'all' || request.status === 'pending').length === 0 && <p className="rsvp-request-empty">No {requestFilter === 'pending' ? 'pending' : ''} verification requests.</p>}
      {requests.filter(request => requestFilter === 'all' || request.status === 'pending').map(request => <article className="rsvp-request-card" key={request.id}>
        <div className="rsvp-request-details"><div><strong>{request.submitted_name}</strong><span className={`rsvp-cell-status ${request.status}`}>{request.status}</span></div><span>Requested {new Date(request.requested_at).toLocaleString()} · RSVP: {request.status_response ?? 'Not specified'}</span><span>{request.contact_email || 'No email'} · {request.contact_phone || 'No phone'}</span>{request.dietary_notes && <span>Dietary: {request.dietary_notes}</span>}{request.plus_one_count > 0 && <span>Legacy request: +{request.plus_one_count} ({request.attendee_names?.join(', ') || 'unnamed'}). Give the matched guest an allowance before approving.</span>}</div>
        {request.status === 'pending' && <div className="rsvp-request-actions"><label>Match existing guest<select value={selectedGuests[request.id] ?? ''} onChange={input => setSelectedGuests(current => ({ ...current, [request.id]: input.target.value }))}><option value="">Choose guest</option>{guests.filter(guest => !guest.rsvp_owner_id && !guest.rsvp_response_id).map(guest => <option key={guest.id} value={guest.id}>{guest.full_name}</option>)}</select></label><button type="button" disabled={!selectedGuests[request.id]} onClick={() => review(request, 'approved')}><Check size={15} /> Match & approve</button><label>Add as new guest in<select value={selectedGroups[request.id] ?? ''} onChange={input => setSelectedGroups(current => ({ ...current, [request.id]: input.target.value }))}><option value="">Individual invitation</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><button type="button" onClick={() => review(request, 'approved', true)}>Add & approve</button><button type="button" className="rsvp-reject" onClick={() => review(request, 'rejected')}><X size={15} /> Reject</button></div>}
      </article>)}
    </div>
  </section>;
};

export default RsvpHostPanel;