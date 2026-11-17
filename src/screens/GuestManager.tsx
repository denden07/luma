import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { createGuestGroup, createInvitationGuest, deleteGuestGroup, deleteInvitationGuest, getGuestRoster, updateGuestGroup, updateInvitationGuest } from '../services/guestService';
import type { GuestRoster, InvitationGuest } from '../services/guestService';
import { getRsvpResponses } from '../services/rsvpService';
import type { RsvpResponse } from '../services/rsvpService';
import { getHostCode } from '../utils/hostAuth';
import RsvpHostPanel from '../components/RsvpHostPanel';
import Modal from '../components/Modal';
import { useInvitationNotice } from '../components/useInvitationNotice';
import './GuestManager.css';

type RsvpFilter = 'all' | 'attending' | 'declined' | 'undecided' | 'awaiting';
type RosterSort = 'responded' | 'name';

const GuestManager = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const hostCode = getHostCode() ?? '';
  const { success: setMessage, error: setError } = useInvitationNotice();
  const [roster, setRoster] = useState<GuestRoster>({ groups: [], guests: [] });
  const [responses, setResponses] = useState<RsvpResponse[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupPhone, setGroupPhone] = useState('');
  const [groupSize, setGroupSize] = useState(1);
  const [groupAllowanceId, setGroupAllowanceId] = useState('');
  const [groupAllowance, setGroupAllowance] = useState(0);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestPlusLimit, setGuestPlusLimit] = useState('');
  const [guestOwnerId, setGuestOwnerId] = useState('');
  const [guestGroupId, setGuestGroupId] = useState('');
  const [guestResponder, setGuestResponder] = useState(false);
  const [groupFilter, setGroupFilter] = useState('all');
  const [rosterGroupSearch, setRosterGroupSearch] = useState('');
  const [rsvpFilter, setRsvpFilter] = useState<RsvpFilter>('all');
  const [rosterSort, setRosterSort] = useState<RosterSort>('responded');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(15);
  const [groupPage, setGroupPage] = useState(1);
  const [groupPageSize, setGroupPageSize] = useState<number | 'all'>(5);
  const [editingGuest, setEditingGuest] = useState<InvitationGuest | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editGroupId, setEditGroupId] = useState('');
  const [editResponder, setEditResponder] = useState(false);
  const [editPlusLimit, setEditPlusLimit] = useState('');

  const load = async () => {
    if (!eventId || !hostCode) return;
    try {
      const [nextRoster, nextResponses] = await Promise.all([getGuestRoster(eventId, hostCode), getRsvpResponses(eventId, hostCode)]);
      setRoster({ groups: nextRoster.groups ?? [], guests: nextRoster.guests ?? [] });
      setResponses(nextResponses);
    } catch { setError('Could not load guest management data.'); }
  };

  useEffect(() => { load(); }, [eventId]);

  const groupNameFor = (groupId: string | null) => roster.groups.find(group => group.id === groupId)?.name ?? 'Individual';
  const responseFor = (guest: InvitationGuest) => responses.find(response => response.guest_id === guest.id) ?? (guest.group_id ? responses.find(response => response.group_id === guest.group_id) : undefined);
  const recordedResponseFor = (guest: InvitationGuest) => guest.rsvp_response_id
    ? responses.find(response => response.id === guest.rsvp_response_id)
    : guest.rsvp_owner_id
      ? responses.find(response => response.guest_id === guest.rsvp_owner_id)
      : responseFor(guest);
  const companionOriginFor = (guest: InvitationGuest) => guest.rsvp_owner_id
    ? roster.guests.find(owner => owner.id === guest.rsvp_owner_id)?.full_name ?? null
    : guest.companion_label?.replace(/ friend #\d+$/, '') ?? null;
  const plusTotal = roster.guests.filter(guest => guest.is_rsvp_companion).length;
  const respondedCount = roster.guests.filter(guest => (guest.group_id ? guest.rsvp_status : responseFor(guest)?.status ?? guest.rsvp_status) !== null).length;
  const guests = roster.guests.filter(guest => {
    const response = responseFor(guest);
    const status = guest.group_id ? guest.rsvp_status : response?.status ?? guest.rsvp_status;
    const matchesRsvp = rsvpFilter === 'all' || (rsvpFilter === 'awaiting' ? !status : status === rsvpFilter);
    const matchesGroup = (groupFilter === 'all' || (groupFilter === 'individual' ? !guest.group_id : guest.group_id === groupFilter)) &&
      (!rosterGroupSearch.trim() || groupNameFor(guest.group_id).toLocaleLowerCase().includes(rosterGroupSearch.trim().toLocaleLowerCase()));
    return matchesRsvp && matchesGroup;
  }).sort((firstGuest, secondGuest) => {
    if (rosterSort === 'name') return firstGuest.full_name.localeCompare(secondGuest.full_name);
    const firstResponse = recordedResponseFor(firstGuest);
    const secondResponse = recordedResponseFor(secondGuest);
    if (firstResponse && secondResponse) return new Date(secondResponse.submitted_at).getTime() - new Date(firstResponse.submitted_at).getTime();
    if (firstResponse) return -1;
    if (secondResponse) return 1;
    return firstGuest.full_name.localeCompare(secondGuest.full_name);
  });
  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(guests.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const displayedGuests = pageSize === 'all' ? guests : guests.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const groupTotalPages = groupPageSize === 'all' ? 1 : Math.max(1, Math.ceil(roster.groups.length / groupPageSize));
  const currentGroupPage = Math.min(groupPage, groupTotalPages);
  const displayedGroups = groupPageSize === 'all' ? roster.groups : roster.groups.slice((currentGroupPage - 1) * groupPageSize, currentGroupPage * groupPageSize);

  const addGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventId || !hostCode || !groupName.trim()) return;
    try {
      await createGuestGroup(eventId, hostCode, groupName, groupSize, groupPhone);
      setGroupName(''); setGroupPhone(''); setGroupSize(1);
      setMessage('Invitation group created.'); await load();
    } catch { setError('Could not create group.'); }
  };

  const addGuest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventId || !hostCode || !guestName.trim()) return;
    try {
      await createInvitationGuest(eventId, hostCode, { fullName: guestName, email: guestEmail, phone: guestPhone, groupId: guestOwnerId ? undefined : guestGroupId, ownerId: guestOwnerId, plusLimit: guestOwnerId || guestGroupId ? null : guestPlusLimit === '' ? null : Number(guestPlusLimit), isGroupResponder: Boolean(guestGroupId && !guestOwnerId && guestResponder) });
      setGuestName(''); setGuestEmail(''); setGuestPhone(''); setGuestGroupId(''); setGuestPlusLimit(''); setGuestOwnerId(''); setGuestResponder(false);
      setMessage('Guest added.'); await load();
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not add guest.'); }
  };
  const saveGroupAllowance = async (event: React.FormEvent) => {
    event.preventDefault();
    const group = roster.groups.find(item => item.id === groupAllowanceId);
    if (!eventId || !hostCode || !group) { setError('Select a group to update.'); return; }
    try { await updateGuestGroup(eventId, hostCode, group.id, group.name, group.invited_party_size, group.contact_number ?? undefined, groupAllowance); setMessage('Group additional-guest allowance updated.'); await load(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not update group allowance.'); }
  };

  const openEdit = (guest: InvitationGuest) => {
    setEditingGuest(guest);
    setEditName(guest.full_name);
    setEditEmail(guest.email ?? '');
    setEditPhone(guest.phone ?? '');
    setEditGroupId(guest.group_id ?? '');
    setEditResponder(guest.is_group_responder);
    setEditPlusLimit(guest.rsvp_plus_limit === null ? '' : String(guest.rsvp_plus_limit));
  };

  const saveGuest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventId || !hostCode || !editingGuest || !editName.trim()) return;
    try {
      await updateInvitationGuest(eventId, hostCode, editingGuest.id, { fullName: editName, email: editEmail, phone: editPhone, groupId: editGroupId, ownerId: editingGuest.rsvp_owner_id ?? undefined, plusLimit: editGroupId || editPlusLimit === '' ? null : Number(editPlusLimit), isGroupResponder: Boolean(editGroupId && editResponder) });
      setEditingGuest(null); setMessage('Guest updated.'); await load();
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not update guest.'); }
  };

  const deleteGuest = async (guest: InvitationGuest) => {
    if (!eventId || !hostCode || !window.confirm(`Delete ${guest.full_name}?`)) return;
    try { await deleteInvitationGuest(eventId, hostCode, guest.id); setMessage('Guest deleted.'); await load(); } catch { setError('Could not delete guest.'); }
  };

  const deleteGroup = async (groupId: string, name: string) => {
    if (!eventId || !hostCode || !window.confirm(`Delete ${name} and its related guests?`)) return;
    try { await deleteGuestGroup(eventId, hostCode, groupId); setMessage('Invitation group deleted.'); await load(); } catch { setError('Could not delete group.'); }
  };

  return <main className="guest-manager">
    <header><div><p>Invitation guests</p><h1>Guest list</h1></div></header>
    <div className="guest-manager-content">
      <section className="guest-overview-cards" aria-label="Guest overview">
        <div><span className="guest-overview-title"><Users size={18} aria-hidden="true" /> Total guests</span><strong>{roster.guests.length}</strong><small>{roster.guests.length - plusTotal} invited / added · {plusTotal} additional · {roster.groups.length} groups</small></div>
        <div><span>Responded</span><strong>{respondedCount}</strong></div>
        <div><span>Awaiting response</span><strong>{roster.guests.length - respondedCount}</strong></div>
      </section>

      <section className="guest-group-workflow"><div className="guest-workflow-heading"><p>Step 1</p><h2>Invitation groups (optional)</h2><span>Groups organize families or shared invitations. Guests can remain individual.</span></div><div className="guest-group-workflow-content"><form onSubmit={addGroup}><label>Group name<input value={groupName} onChange={input => setGroupName(input.target.value)} required /></label><label>Contact number<input type="tel" value={groupPhone} onChange={input => setGroupPhone(input.target.value)} /></label><label>Party size<input type="number" min="1" max="20" value={groupSize} onChange={input => setGroupSize(Number(input.target.value) || 1)} /></label><button type="submit"><Plus size={16} /> Create group</button></form><div><div className="guest-table-toolbar"><strong>Current groups</strong><label>Rows<select value={groupPageSize} onChange={input => { const value = input.target.value; setGroupPageSize(value === 'all' ? 'all' : Number(value)); setGroupPage(1); }}><option value="5">5</option><option value="15">15</option><option value="30">30</option><option value="all">All</option></select></label></div><div className="guest-group-table-wrap"><table><thead><tr><th>#</th><th>Group</th><th>Contact</th><th>Guests</th><th /></tr></thead><tbody>{displayedGroups.map((group, index) => <tr key={group.id}><td>{(currentGroupPage - 1) * (groupPageSize === 'all' ? 1 : groupPageSize) + index + 1}</td><td>{group.name}</td><td>{group.contact_number || '-'}</td><td>{roster.guests.filter(guest => guest.group_id === group.id).length} / {group.invited_party_size}</td><td><button className="guest-table-action guest-table-delete" type="button" onClick={() => deleteGroup(group.id, group.name)} title="Delete group"><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>{groupPageSize !== 'all' && <nav className="guest-pagination"><button type="button" disabled={currentGroupPage === 1} onClick={() => setGroupPage(current => Math.max(1, current - 1))}><ChevronLeft size={18} /></button><span>Page {currentGroupPage} of {groupTotalPages}</span><button type="button" disabled={currentGroupPage === groupTotalPages} onClick={() => setGroupPage(current => Math.min(groupTotalPages, current + 1))}><ChevronRight size={18} /></button></nav>}</div></div></section>
      <form className="guest-group-allowance" onSubmit={saveGroupAllowance}><label>Group additional guests<select value={groupAllowanceId} onChange={input => { setGroupAllowanceId(input.target.value); setGroupAllowance(roster.groups.find(group => group.id === input.target.value)?.rsvp_plus_limit ?? 0); }}><option value="">Select group</option>{roster.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label>Allowed<input type="number" min="0" max="19" value={groupAllowance} onChange={input => setGroupAllowance(Number(input.target.value))} /></label><button type="submit">Save group allowance</button>{groupAllowance > 0 && <p className="guest-plus-warning">This group can add up to {groupAllowance} additional people when responding. Only grant this to groups you wish to permit.</p>}</form>

      <section className="guest-add-workflow">
        <div className="guest-workflow-heading"><p>Step 2</p><h2>Add guest</h2></div>
        <form onSubmit={addGuest}>
          <div className="guest-add-fields">
            <label>Name<input value={guestName} onChange={input => setGuestName(input.target.value)} required /></label>
            <label>Email<input type="email" value={guestEmail} onChange={input => setGuestEmail(input.target.value)} /></label>
            <label>Contact<input type="tel" value={guestPhone} onChange={input => setGuestPhone(input.target.value)} /></label>
            {!guestGroupId && <label>Named additional guest of
              <select value={guestOwnerId} onChange={input => { setGuestOwnerId(input.target.value); setGuestGroupId(''); }}>
                <option value="">No - regular guest</option>
                {roster.guests.filter(guest => !guest.group_id && !guest.rsvp_owner_id && !guest.rsvp_response_id && (guest.rsvp_plus_limit ?? 0) > 0).map(guest => <option key={guest.id} value={guest.id}>{guest.full_name} ({roster.guests.filter(companion => companion.rsvp_owner_id === guest.id).length}/{guest.rsvp_plus_limit})</option>)}
              </select>
            </label>}
            {!guestOwnerId && <>
              <label>Group<select value={guestGroupId} onChange={input => { setGuestGroupId(input.target.value); setGuestResponder(false); setGuestPlusLimit(''); }}><option value="">Individual guest</option>{roster.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
              {guestGroupId && <label className="guest-responder-option"><input type="checkbox" checked={guestResponder} onChange={input => setGuestResponder(input.target.checked)} /> RSVP responder for this group (maximum two)</label>}
              {!guestGroupId && <label>Additional guests allowed<input type="number" min="0" max="19" value={guestPlusLimit} onChange={input => setGuestPlusLimit(input.target.value)} placeholder="None" /></label>}
            </>}
          </div>
          {!guestOwnerId && !guestGroupId && Number(guestPlusLimit) > 0 && <p className="guest-plus-warning">Allowing additional guests lets this person add up to {guestPlusLimit} people to your roster when they RSVP. Only set this for guests you wish to permit.</p>}
          <button type="submit"><Plus size={16} /> Add guest</button>
        </form>
      </section>

      <section className="guest-manager-list">
        <div className="guest-list-heading"><div><p>Roster</p><h2>Guests</h2><span>{guests.length} shown of {roster.guests.length}</span></div></div>
        <div className="guest-list-controls guest-list-controls-inline">
          <label>Search groups<input type="search" value={rosterGroupSearch} onChange={input => { setRosterGroupSearch(input.target.value); setPage(1); }} placeholder="Group name" /></label>
          <label>Group<select value={groupFilter} onChange={input => { setGroupFilter(input.target.value); setPage(1); }}><option value="all">All groups</option><option value="individual">Individual guests</option>{roster.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
          <label>RSVP<select value={rsvpFilter} onChange={input => { setRsvpFilter(input.target.value as RsvpFilter); setPage(1); }}><option value="all">All</option><option value="attending">Attending</option><option value="declined">Not attending</option><option value="undecided">Undecided</option><option value="awaiting">Awaiting response</option></select></label>
          <label>Order<select value={rosterSort} onChange={input => { setRosterSort(input.target.value as RosterSort); setPage(1); }}><option value="responded">Date responded</option><option value="name">Name</option></select></label>
          <label>Rows<select value={pageSize} onChange={input => { const value = input.target.value; setPageSize(value === 'all' ? 'all' : Number(value)); setPage(1); }}><option value="5">5</option><option value="15">15</option><option value="30">30</option><option value="all">All</option></select></label>
        </div>
        <div className="guest-table-wrap"><table><thead><tr><th>#</th><th>Guest</th><th>RSVP relationship</th><th>Group</th><th>Email</th><th>Contact</th><th>RSVP</th><th>Party</th><th>Pluses</th><th>Responded</th><th /></tr></thead><tbody>{displayedGuests.map((guest, index) => {
          const response = responseFor(guest);
          const recordedResponse = recordedResponseFor(guest);
          const status = (guest.group_id ? guest.rsvp_status : response?.status ?? guest.rsvp_status) ?? 'awaiting';
          const companionOrigin = companionOriginFor(guest);
          return <tr key={guest.id}><td>{(currentPage - 1) * (pageSize === 'all' ? 1 : pageSize) + index + 1}</td><td>{guest.full_name}</td><td className="guest-relationship">{companionOrigin ? `${guest.is_rsvp_companion || guest.rsvp_owner_id ? 'Additional guest' : 'RSVP guest'} of ${companionOrigin}` : '-'}{guest.proxy_of && <div>Proxy of {guest.proxy_of}</div>}</td><td>{groupNameFor(guest.group_id)}</td><td>{guest.email || '-'}</td><td>{guest.phone || '-'}</td><td><span className={`rsvp-cell-status ${status}`}>{status === 'awaiting' ? 'Awaiting response' : status}</span></td><td>{response?.party_count ?? '-'}</td><td>{response?.plus_one_count ?? 0}</td><td>{recordedResponse ? new Date(recordedResponse.submitted_at).toLocaleDateString() : '-'}</td><td><div className="guest-table-actions"><button className="guest-table-action" type="button" onClick={() => openEdit(guest)} title="Edit guest"><Pencil size={15} /></button><button className="guest-table-action guest-table-delete" type="button" onClick={() => deleteGuest(guest)} title="Delete guest"><Trash2 size={15} /></button></div></td></tr>;
        })}</tbody></table></div>
        {pageSize !== 'all' && <nav className="guest-pagination"><button type="button" disabled={currentPage === 1} onClick={() => setPage(current => Math.max(1, current - 1))}><ChevronLeft size={18} /></button><span>Page {currentPage} of {totalPages}</span><button disabled={currentPage === totalPages} type="button" onClick={() => setPage(current => Math.min(totalPages, current + 1))}><ChevronRight size={18} /></button></nav>}
      </section>

      {eventId && hostCode && <RsvpHostPanel eventId={eventId} hostCode={hostCode} guests={roster.guests} groups={roster.groups} onSuccess={setMessage} onError={setError} onRosterUpdated={load} />}
      <Modal isOpen={Boolean(editingGuest)} onClose={() => setEditingGuest(null)} className="guest-edit-modal"><form onSubmit={saveGuest}><h2>Edit guest</h2><label>Name<input value={editName} onChange={input => setEditName(input.target.value)} required /></label><label>Email<input type="email" value={editEmail} onChange={input => setEditEmail(input.target.value)} /></label><label>Contact<input type="tel" value={editPhone} onChange={input => setEditPhone(input.target.value)} /></label>{editingGuest?.rsvp_owner_id ? <p>Named additional guest of {roster.guests.find(guest => guest.id === editingGuest.rsvp_owner_id)?.full_name}</p> : <><label>Group<select value={editGroupId} onChange={input => { setEditGroupId(input.target.value); setEditResponder(false); setEditPlusLimit(''); }}><option value="">Individual guest</option>{roster.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>{editGroupId && <label className="guest-responder-option"><input type="checkbox" checked={editResponder} onChange={input => setEditResponder(input.target.checked)} /> RSVP responder for this group (maximum two)</label>}{!editGroupId && <label>Additional guests allowed<input type="number" min="0" max="19" value={editPlusLimit} onChange={input => setEditPlusLimit(input.target.value)} placeholder="None" /></label>}{!editGroupId && Number(editPlusLimit) > 0 && <p className="guest-plus-warning">Allowing additional guests lets this person add people to your roster when they RSVP.</p>}</>}<div className="guest-edit-modal-actions"><button type="button" onClick={() => setEditingGuest(null)}>Cancel</button><button type="submit">Save guest</button></div></form></Modal>
    </div>
  </main>;
};

export default GuestManager;