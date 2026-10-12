import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPrivateRsvpInvitation, submitPrivateRsvp } from '../services/rsvpService';
import type { PrivateRsvpInvitation, RsvpStatus } from '../services/rsvpService';
import './PrivateRsvp.css';

const PrivateRsvp = () => {
  const { token } = useParams<{ token: string }>();
  const [invitation, setInvitation] = useState<PrivateRsvpInvitation | null>(null);
  const [status, setStatus] = useState<RsvpStatus>('attending');
  const [partyCount, setPartyCount] = useState(1);
  const [attendees, setAttendees] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dietaryNotes, setDietaryNotes] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { if (token) getPrivateRsvpInvitation(token).then(setInvitation).catch(() => setMessage('This RSVP link is unavailable.')); }, [token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !invitation) return;
    const names = attendees.split('\n').map(name => name.trim()).filter(Boolean);
    try { await submitPrivateRsvp(token, { status, partyCount: status === 'attending' ? partyCount : 0, attendees: status === 'attending' ? names : [], contactEmail: email, contactPhone: phone, dietaryNotes }); setMessage('Your RSVP has been saved.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save RSVP.'); }
  };

  if (message && !invitation) return <main className="private-rsvp-state">{message}</main>;
  if (!invitation) return <main className="private-rsvp-state">Loading RSVP...</main>;

  return <main className="private-rsvp"><form onSubmit={submit}><p>Private RSVP</p><h1>{invitation.invitation_name}</h1>{message && <div role="status">{message}</div>}<label>Will you attend?<select value={status} onChange={input => setStatus(input.target.value as RsvpStatus)}><option value="attending">Attending</option><option value="declined">Declined</option><option value="undecided">Undecided</option></select></label>{status === 'attending' && <><label>Number attending<select value={partyCount} onChange={input => setPartyCount(Number(input.target.value))}>{Array.from({ length: invitation.invited_party_size }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value}</option>)}</select></label><label>Attendee names, one per line<textarea value={attendees} onChange={input => setAttendees(input.target.value)} rows={partyCount} required /></label></>}<label>Email<input type="email" value={email} onChange={input => setEmail(input.target.value)} /></label><label>Contact number<input type="tel" value={phone} onChange={input => setPhone(input.target.value)} /></label><label>Dietary notes<textarea value={dietaryNotes} onChange={input => setDietaryNotes(input.target.value)} rows={3} /></label><button type="submit">Save RSVP</button></form></main>;
};

export default PrivateRsvp;