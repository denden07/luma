import { useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { createGuestGroup, createInvitationGuest, deleteGuestGroup, deleteInvitationGuest, getGuestRoster, updateInvitationGuest } from '../services/guestService';
import type { GuestRoster, InvitationGuest } from '../services/guestService';
import { getRsvpResponses } from '../services/rsvpService';
import type { RsvpResponse } from '../services/rsvpService';
import { getHostCode } from '../utils/hostAuth';
import RsvpHostPanel from '../components/RsvpHostPanel';
import Modal from '../components/Modal';
import './GuestManager.css';

type RsvpFilter = 'all' | 'attending' | 'declined' | 'undecided' | 'awaiting';
type RosterSort = 'responded' | 'name';

const GuestManager = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const hostCode = getHostCode() ?? '';
  const [roster, setRoster] = useState<GuestRoster>({ groups: [], guests: [] });
  const [responses, setResponses] = useState<RsvpResponse[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupPhone, setGroupPhone] = useState('');
  const [groupSize, setGroupSize] = useState(1);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestGroupId, setGuestGroupId] = useState('');
  const [guestGroupSearch, setGuestGroupSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
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

  const load = async () => {
    if (!eventId || !hostCode) return;
    try {
      const [nextRoster, nextResponses] = await Promise.all([getGuestRoster(eventId, hostCode), getRsvpResponses(eventId, hostCode)]);
      setRoster({ groups: nextRoster.groups ?? [], guests: nextRoster.guests ?? [] });
      setResponses(nextResponses);
    } catch { setError('Could not load guest management data.'); }
  };

  useEffect(() => { load(); }, [eventId]);
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(''), 2600);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const groupNameFor = (groupId: string | null) => roster.groups.find(group => group.id === groupId)?.name ?? 'Individual';
  const responseFor = (guest: InvitationGuest) => responses.find(response => response.guest_id === guest.id) ?? (guest.group_id ? responses.find(response => response.group_id === guest.group_id) : undefined);
  const plusTotal = roster.guests.filter(guest => guest.is_rsvp_companion).length;
  const matchingGuestGroups = roster.groups.filter(group => group.name.toLocaleLowerCase().includes(guestGroupSearch.trim().toLocaleLowerCase()));
  const guests = roster.guests.filter(guest => {
    const response = responseFor(guest);
    const status = response?.status ?? guest.rsvp_status;
    const matchesRsvp = rsvpFilter === 'all' || (rsvpFilter === 'awaiting' ? !status : status === rsvpFilter);
    const matchesGroup = groupFilter === 'all' || (groupFilter === 'individual' ? !guest.group_id : guest.group_id === groupFilter);
    return matchesRsvp && matchesGroup;
  }).sort((firstGuest, secondGuest) => {
    if (rosterSort === 'name') return firstGuest.full_name.localeCompare(secondGuest.full_name);
    const firstResponse = responseFor(firstGuest);
    const secondResponse = responseFor(secondGuest);
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
      await createInvitationGuest(eventId, hostCode, { fullName: guestName, email: guestEmail, phone: guestPhone, groupId: guestGroupId });
      setGuestName(''); setGuestEmail(''); setGuestPhone(''); setGuestGroupId(''); setGuestGroupSearch('');
      setMessage('Guest added.'); await load();
    } catch { setError('Could not add guest.'); }
  };

  const openEdit = (guest: InvitationGuest) => {
    setEditingGuest(guest);
    setEditName(guest.full_name);
    setEditEmail(guest.email ?? '');
    setEditPhone(guest.phone ?? '');
    setEditGroupId(guest.group_id ?? '');
  };

  const saveGuest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventId || !hostCode || !editingGuest || !editName.trim()) return;
    try {
      await updateInvitationGuest(eventId, hostCode, editingGuest.id, { fullName: editName, email: editEmail, phone: editPhone, groupId: editGroupId });
      setEditingGuest(null); setMessage('Guest updated.'); await load();
    } catch { setError('Could not update guest. Check group capacity and try again.'); }
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
    <header><button type="button" onClick={() => navigate(`/host/dashboard/${eventId}`)} aria-label="Back to event dashboard"><ArrowLeft size={20} /></button><div><p>Invitation guests</p><h1>Guest list</h1></div><button type="button" onClick={() => navigate(`/host/events/${eventId}/seating`)}>Seating plan</button></header>
    <div className="guest-manager-content">
      {message && <div className="guest-manager-toast" role="status"><Check size={17} /> {message}</div>}
      {error && <p className="guest-manager-error">{error}</p>}
      <section className="guest-manager-summary"><Users size={22} /><strong>{roster.guests.length} total guests</strong><span>{roster.guests.length - plusTotal} invited / added + {plusTotal} RSVP companions</span><span>{roster.groups.length} invitation groups</span></section>

      <section className="guest-group-workflow"><div className="guest-workflow-heading"><p>Step 1</p><h2>Invitation groups (optional)</h2><span>Groups organize families or shared invitations. Guests can remain individual.</span></div><div className="guest-group-workflow-content"><form onSubmit={addGroup}><label>Group name<input value={groupName} onChange={input => setGroupName(input.target.value)} required /></label><label>Contact number<input type="tel" value={groupPhone} onChange={input => setGroupPhone(input.target.value)} /></label><label>Party size<input type="number" min="1" max="20" value={groupSize} onChange={input => setGroupSize(Number(input.target.value) || 1)} /></label><button type="submit"><Plus size={16} /> Create group</button></form><div><div className="guest-table-toolbar"><strong>Current groups</strong><label>Rows<select value={groupPageSize} onChange={input => { const value = input.target.value; setGroupPageSize(value === 'all' ? 'all' : Number(value)); setGroupPage(1); }}><option value="5">5</option><option value="15">15</option><option value="30">30</option><option value="all">All</option></select></label></div><div className="guest-group-table-wrap"><table><thead><tr><th>#</th><th>Group</th><th>Contact</th><th>Guests</th><th /></tr></thead><tbody>{displayedGroups.map((group, index) => <tr key={group.id}><td>{(currentGroupPage - 1) * (groupPageSize === 'all' ? 1 : groupPageSize) + index + 1}</td><td>{group.name}</td><td>{group.contact_number || '-'}</td><td>{roster.guests.filter(guest => guest.group_id === group.id).length} / {group.invited_party_size}</td><td><button className="guest-table-action guest-table-delete" type="button" onClick={() => deleteGroup(group.id, group.name)} title="Delete group"><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>{groupPageSize !== 'all' && <nav className="guest-pagination"><button type="button" disabled={currentGroupPage === 1} onClick={() => setGroupPage(current => Math.max(1, current - 1))}><ChevronLeft size={18} /></button><span>Page {currentGroupPage} of {groupTotalPages}</span><button type="button" disabled={currentGroupPage === groupTotalPages} onClick={() => setGroupPage(current => Math.min(groupTotalPages, current + 1))}><ChevronRight size={18} /></button></nav>}</div></div></section>

      <section className="guest-add-workflow"><div className="guest-workflow-heading"><p>Step 2</p><h2>Add guest</h2></div><form onSubmit={addGuest}><label>Name<input value={guestName} onChange={input => setGuestName(input.target.value)} required /></label><label>Email<input type="email" value={guestEmail} onChange={input => setGuestEmail(input.target.value)} /></label><label>Contact<input type="tel" value={guestPhone} onChange={input => setGuestPhone(input.target.value)} /></label><label>Group<span className="guest-group-picker"><input type="search" value={guestGroupSearch} onChange={input => setGuestGroupSearch(input.target.value)} placeholder="Search groups" aria-label="Search groups" /><select value={guestGroupId} onChange={input => setGuestGroupId(input.target.value)}><option value="">Individual guest</option>{matchingGuestGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></span></label><button type="submit"><Plus size={16} /> Add guest</button></form></section>

      {eventId && hostCode && <RsvpHostPanel eventId={eventId} hostCode={hostCode} guests={roster.guests} groups={roster.groups} onSuccess={setMessage} onError={setError} onRosterUpdated={load} />}

      <section className="guest-manager-list"><div className="guest-list-heading"><div><p>Roster</p><h2>Guests</h2><span>{guests.length} shown of {roster.guests.length}</span></div></div><div className="guest-list-controls guest-list-controls-inline"><label>Group<select value={groupFilter} onChange={input => { setGroupFilter(input.target.value); setPage(1); }}><option value="all">All groups</option><option value="individual">Individual guests</option>{roster.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label>RSVP<select value={rsvpFilter} onChange={input => { setRsvpFilter(input.target.value as RsvpFilter); setPage(1); }}><option value="all">All</option><option value="attending">Attending</option><option value="declined">Not attending</option><option value="undecided">Undecided</option><option value="awaiting">Awaiting response</option></select></label><label>Order<select value={rosterSort} onChange={input => { setRosterSort(input.target.value as RosterSort); setPage(1); }}><option value="responded">Date responded</option><option value="name">Name</option></select></label><label>Rows<select value={pageSize} onChange={input => { const value = input.target.value; setPageSize(value === 'all' ? 'all' : Number(value)); setPage(1); }}><option value="5">5</option><option value="15">15</option><option value="30">30</option><option value="all">All</option></select></label></div><div className="guest-table-wrap"><table><thead><tr><th>#</th><th>Guest</th><th>Group</th><th>Email</th><th>Contact</th><th>RSVP</th><th>Party</th><th>Pluses</th><th>Responded</th><th /></tr></thead><tbody>{displayedGuests.map((guest, index) => { const response = responseFor(guest); const status = response?.status ?? guest.rsvp_status ?? 'awaiting'; return <tr key={guest.id}><td>{(currentPage - 1) * (pageSize === 'all' ? 1 : pageSize) + index + 1}</td><td>{guest.full_name}{guest.companion_label && <small className="guest-companion-label">{guest.companion_label}</small>}</td><td>{groupNameFor(guest.group_id)}</td><td>{guest.email || '-'}</td><td>{guest.phone || '-'}</td><td><span className={`rsvp-cell-status ${status}`}>{status === 'awaiting' ? 'Awaiting response' : status}</span></td><td>{response?.party_count ?? '-'}</td><td>{response?.plus_one_count ?? 0}</td><td>{response ? new Date(response.submitted_at).toLocaleDateString() : '-'}</td><td><div className="guest-table-actions"><button className="guest-table-action" type="button" onClick={() => openEdit(guest)} title="Edit guest"><Pencil size={15} /></button><button className="guest-table-action guest-table-delete" type="button" onClick={() => deleteGuest(guest)} title="Delete guest"><Trash2 size={15} /></button></div></td></tr>; })}</tbody></table></div>{pageSize !== 'all' && <nav className="guest-pagination"><button type="button" disabled={currentPage === 1} onClick={() => setPage(current => Math.max(1, current - 1))}><ChevronLeft size={18} /></button><span>Page {currentPage} of {totalPages}</span><button disabled={currentPage === totalPages} type="button" onClick={() => setPage(current => Math.min(totalPages, current + 1))}><ChevronRight size={18} /></button></nav>}</section>

      <Modal isOpen={Boolean(editingGuest)} onClose={() => setEditingGuest(null)} className="guest-edit-modal"><form onSubmit={saveGuest}><h2>Edit guest</h2><label>Name<input value={editName} onChange={input => setEditName(input.target.value)} required /></label><label>Email<input type="email" value={editEmail} onChange={input => setEditEmail(input.target.value)} /></label><label>Contact<input type="tel" value={editPhone} onChange={input => setEditPhone(input.target.value)} /></label><label>Group<select value={editGroupId} onChange={input => setEditGroupId(input.target.value)}><option value="">Individual guest</option>{roster.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><div className="guest-edit-modal-actions"><button type="button" onClick={() => setEditingGuest(null)}>Cancel</button><button type="submit">Save guest</button></div></form></Modal>
    </div>
  </main>;
};

export default GuestManager;