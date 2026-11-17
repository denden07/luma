import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPrivateRsvpInvitation, submitPrivateRsvp } from '../services/rsvpService';
import type { CompanionChoice, PrivateRsvpInvitation, RsvpStatus } from '../services/rsvpService';
import './PrivateRsvp.css';

const PrivateRsvp = () => {
  const { token } = useParams<{ token: string }>();
  const [invitation, setInvitation] = useState<PrivateRsvpInvitation | null>(null);
  const [status, setStatus] = useState<RsvpStatus>('attending');
  const [partyCount, setPartyCount] = useState(1);
  const [plusOneCount, setPlusOneCount] = useState(0);
  const [additionalNames, setAdditionalNames] = useState<string[]>([]);
  const [namedChoices, setNamedChoices] = useState<CompanionChoice[]>([]);
  const [attendees, setAttendees] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dietaryNotes, setDietaryNotes] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { if (token) getPrivateRsvpInvitation(token).then(result => { setInvitation(result); setNamedChoices(result.companions.map(companion => ({ id: companion.id, status: companion.status ?? 'undecided' }))); }).catch(() => setMessage('This RSVP link is unavailable.')); }, [token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !invitation) return;
    const names = attendees.split('\n').map(name => name.trim()).filter(Boolean);
    if (status === 'attending' && names.length !== partyCount) { setMessage(`Enter ${partyCount} invited attendee name${partyCount === 1 ? '' : 's'}, one per line.`); return; }
    const namedAttending = invitation.companions.filter((companion, index) => namedChoices[index]?.id === companion.id && namedChoices[index].status === 'attending').map(companion => companion.full_name);
    try { await submitPrivateRsvp(token, { status, partyCount: status === 'attending' ? partyCount : 0, plusOneCount: status === 'attending' ? namedAttending.length + plusOneCount : 0, namedCompanions: status === 'attending' ? namedChoices : undefined, attendees: status === 'attending' ? [...names, ...namedAttending, ...additionalNames.slice(0, plusOneCount).map((name, index) => name.trim() || `${invitation.invitation_name.slice(0, 230)} friend #${index + 1}`)] : [], contactEmail: email, contactPhone: phone, dietaryNotes: invitation.dietary_enabled ? dietaryNotes : undefined }); setMessage('Your RSVP has been saved.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save RSVP.'); }
  };

  if (message && !invitation) return <main className="private-rsvp-state">{message}</main>;
  if (!invitation) return <main className="private-rsvp-state">Loading RSVP...</main>;

  const namedAttendingCount = namedChoices.filter(choice => choice.status === 'attending').length;
  const remaining = Math.max(0, Math.min(20 - partyCount - namedAttendingCount, invitation.plus_limit - namedAttendingCount));
  return <main className="private-rsvp"><form onSubmit={submit}>
    <p>Private RSVP</p><h1>{invitation.invitation_name}</h1>{message && <div role="status">{message}</div>}
    <label>Will you attend?<select value={status} onChange={input => setStatus(input.target.value as RsvpStatus)}><option value="attending">Attending</option><option value="declined">Not attending</option><option value="undecided">Still deciding</option></select></label>
    {status === 'attending' && <>
      <label>Number of invited guests attending<select value={partyCount} onChange={input => { setPartyCount(Number(input.target.value)); setPlusOneCount(0); }}>{Array.from({ length: invitation.invited_party_size }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Invited attendee names, one per line<textarea value={attendees} onChange={input => setAttendees(input.target.value)} rows={partyCount} required /></label>
      {invitation.companions.map((companion, index) => <label key={companion.id}>Will {companion.full_name} attend?<select value={namedChoices[index]?.status ?? 'undecided'} onChange={input => { const next = namedChoices.map((choice, position) => position === index ? { ...choice, status: input.target.value as RsvpStatus } : choice); setNamedChoices(next); const available = Math.max(0, invitation.plus_limit - next.filter(choice => choice.status === 'attending').length); setPlusOneCount(current => Math.min(current, available)); }}><option value="attending">Attending</option><option value="declined">Not attending</option><option value="undecided">Still deciding</option></select></label>)}
      {remaining > 0 && <label>Other additional guests<select value={Math.min(plusOneCount, remaining)} onChange={input => { const count = Number(input.target.value); setPlusOneCount(count); setAdditionalNames(current => Array.from({ length: count }, (_, index) => current[index] ?? '')); }}>{Array.from({ length: remaining + 1 }, (_, index) => <option key={index} value={index}>{index}</option>)}</select></label>}
      {Array.from({ length: Math.min(plusOneCount, remaining) }, (_, index) => <label key={index}>Additional guest #{index + 1} name (optional)<input maxLength={255} value={additionalNames[index] ?? ''} placeholder={`${invitation.invitation_name} friend #${index + 1}`} onChange={input => setAdditionalNames(current => current.map((name, position) => position === index ? input.target.value : name))} /></label>)}
    </>}
    <label>Email<input type="email" value={email} onChange={input => setEmail(input.target.value)} /></label>
    <label>Contact number<input type="tel" value={phone} onChange={input => setPhone(input.target.value)} /></label>
    {invitation.dietary_enabled && <label>Dietary notes<textarea value={dietaryNotes} onChange={input => setDietaryNotes(input.target.value)} rows={3} /></label>}
    <button type="submit">Save RSVP</button>
  </form></main>;
};

export default PrivateRsvp;