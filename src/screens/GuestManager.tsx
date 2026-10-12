import { useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { createGuestGroup, createInvitationGuest, deleteGuestGroup, deleteInvitationGuest, getGuestRoster, updateGuestGroup, updateInvitationGuest } from '../services/guestService';
import type { GuestRoster, InvitationGuest } from '../services/guestService';
import { getHostCode } from '../utils/hostAuth';
import './GuestManager.css';

const GuestManager = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [roster, setRoster] = useState<GuestRoster>({ groups: [], guests: [] });
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestGroupId, setGuestGroupId] = useState('');
  const [guestGroupSearch, setGuestGroupSearch] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupContactNumber, setGroupContactNumber] = useState('');
  const [groupSize, setGroupSize] = useState(1);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [sortMode, setSortMode] = useState<'grouped' | 'individual'>('grouped');
  const [groupFilter, setGroupFilter] = useState('all');
  const [groupFilterSearch, setGroupFilterSearch] = useState('All guests');
  const [page, setPage] = useState(1);
  const [guestPageSize, setGuestPageSize] = useState<number | 'all'>(15);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [editingGroupContactNumber, setEditingGroupContactNumber] = useState('');
  const [editingGroupSize, setEditingGroupSize] = useState(1);
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [editingGuestName, setEditingGuestName] = useState('');
  const [editingGuestEmail, setEditingGuestEmail] = useState('');
  const [editingGuestPhone, setEditingGuestPhone] = useState('');
  const [editingGuestGroupId, setEditingGuestGroupId] = useState('');
  const [groupPage, setGroupPage] = useState(1);
  const [groupPageSize, setGroupPageSize] = useState<number | 'all'>(5);

  const loadRoster = async () => {
    const hostCode = getHostCode();
    if (!eventId || !hostCode) return;
    try {
      const loadedRoster = await getGuestRoster(eventId, hostCode);
      setRoster({ groups: Array.isArray(loadedRoster.groups) ? loadedRoster.groups : [], guests: Array.isArray(loadedRoster.guests) ? loadedRoster.guests : [] });
    } catch { setError('Could not load the guest roster.'); }
  };

  useEffect(() => { loadRoster(); }, [eventId]);
  useEffect(() => {
    if (!successMessage) return;
    const timeout = window.setTimeout(() => setSuccessMessage(''), 2600);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  const addGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    const hostCode = getHostCode();
    if (!eventId || !hostCode || !groupName.trim()) return;
    try { await createGuestGroup(eventId, hostCode, groupName, groupSize, groupContactNumber); setGroupName(''); setGroupContactNumber(''); setGroupSize(1); setSuccessMessage('Invitation group created.'); await loadRoster(); } catch { setError('Could not add the guest group.'); }
  };

  const addGuest = async (event: React.FormEvent) => {
    event.preventDefault();
    const hostCode = getHostCode();
    if (!eventId || !hostCode || !guestName.trim()) return;
    try { await createInvitationGuest(eventId, hostCode, { fullName: guestName, email: guestEmail, phone: guestPhone, groupId: guestGroupId }); setGuestName(''); setGuestEmail(''); setGuestPhone(''); setGuestGroupId(''); setGuestGroupSearch(''); setSuccessMessage('Guest added to the invitation list.'); await loadRoster(); } catch { setError('Could not add the guest.'); }
  };

  const groupNameFor = (groupId: string | null) => roster.groups.find(group => group.id === groupId)?.name ?? 'Individual';
  const resolveGroupSearch = (value: string) => roster.groups.find(group => (group.name ?? '').toLocaleLowerCase() === value.trim().toLocaleLowerCase())?.id ?? '';
  const updateGuestGroupSearch = (value: string) => { setGuestGroupSearch(value); setGuestGroupId(resolveGroupSearch(value)); };
  const updateGroupFilterSearch = (value: string) => {
    setGroupFilterSearch(value);
    if (value === 'All guests') setGroupFilter('all');
    else if (value === 'Individual guests') setGroupFilter('individual');
    else setGroupFilter(resolveGroupSearch(value) || 'all');
    setPage(1);
  };
  const guestCountFor = (groupId: string) => roster.guests.filter(guest => guest.group_id === groupId).length;
  const visibleGuests = roster.guests.filter(guest => groupFilter === 'all' || (groupFilter === 'individual' ? guest.group_id === null : guest.group_id === groupFilter));
  const sortedGuests = [...visibleGuests].sort((first, second) => {
    const firstIsGrouped = Boolean(first.group_id);
    const secondIsGrouped = Boolean(second.group_id);
    if (firstIsGrouped !== secondIsGrouped) return sortMode === 'grouped' ? (firstIsGrouped ? -1 : 1) : (firstIsGrouped ? 1 : -1);
    const groupOrder = groupNameFor(first.group_id).localeCompare(groupNameFor(second.group_id));
    return groupOrder || first.full_name.localeCompare(second.full_name);
  });
  const pageCount = guestPageSize === 'all' ? 1 : Math.max(1, Math.ceil(sortedGuests.length / guestPageSize));
  const currentPage = Math.min(page, pageCount);
  const pageGuests = guestPageSize === 'all' ? sortedGuests : sortedGuests.slice((currentPage - 1) * guestPageSize, currentPage * guestPageSize);
  const groupPageCount = groupPageSize === 'all' ? 1 : Math.max(1, Math.ceil(roster.groups.length / groupPageSize));
  const currentGroupPage = Math.min(groupPage, groupPageCount);
  const pageGroups = groupPageSize === 'all' ? roster.groups : roster.groups.slice((currentGroupPage - 1) * groupPageSize, currentGroupPage * groupPageSize);

  const beginEditGroup = (groupId: string) => {
    const group = roster.groups.find(current => current.id === groupId);
    if (!group) return;
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
    setEditingGroupContactNumber(group.contact_number ?? '');
    setEditingGroupSize(group.invited_party_size);
  };

  const saveGroup = async (groupId: string) => {
    const hostCode = getHostCode();
    if (!eventId || !hostCode || !editingGroupName.trim()) return;
    try { await updateGuestGroup(eventId, hostCode, groupId, editingGroupName, editingGroupSize, editingGroupContactNumber); setEditingGroupId(null); setSuccessMessage('Invitation group updated.'); await loadRoster(); } catch { setError('Could not update the invitation group.'); }
  };

  const removeGroup = async (groupId: string, groupName: string) => {
    const hostCode = getHostCode();
    if (!eventId || !hostCode) return;
    const guestCount = guestCountFor(groupId);
    if (!window.confirm(`Delete ${groupName}? This will also delete ${guestCount} related invitation guest${guestCount === 1 ? '' : 's'}.`)) return;
    try { const result = await deleteGuestGroup(eventId, hostCode, groupId); setSuccessMessage(`Group deleted with ${result.deleted_guest_count} related guest${result.deleted_guest_count === 1 ? '' : 's'}.`); await loadRoster(); } catch { setError('Could not delete the invitation group.'); }
  };

  const beginEditGuest = (guest: InvitationGuest) => {
    setEditingGuestId(guest.id);
    setEditingGuestName(guest.full_name);
    setEditingGuestEmail(guest.email ?? '');
    setEditingGuestPhone(guest.phone ?? '');
    setEditingGuestGroupId(guest.group_id ?? '');
  };

  const saveGuest = async (guestId: string) => {
    const hostCode = getHostCode();
    if (!eventId || !hostCode || !editingGuestName.trim()) return;
    try { await updateInvitationGuest(eventId, hostCode, guestId, { fullName: editingGuestName, email: editingGuestEmail, phone: editingGuestPhone, groupId: editingGuestGroupId }); setEditingGuestId(null); setSuccessMessage('Guest updated.'); await loadRoster(); } catch { setError('Could not update the guest. Check group capacity and try again.'); }
  };

  const removeGuest = async (guest: InvitationGuest) => {
    const hostCode = getHostCode();
    if (!eventId || !hostCode || !window.confirm(`Delete ${guest.full_name} from the invitation list?`)) return;
    try { await deleteInvitationGuest(eventId, hostCode, guest.id); setSuccessMessage('Guest deleted.'); await loadRoster(); } catch { setError('Could not delete the guest.'); }
  };

  return <main className="guest-manager">
    <header><button type="button" onClick={() => navigate(`/host/dashboard/${eventId}`)} aria-label="Back to event dashboard"><ArrowLeft size={20} aria-hidden="true" /></button><div><p>Invitation guests</p><h1>Guest list</h1></div></header>
    <div className="guest-manager-content">
      {error && <p className="guest-manager-error">{error}</p>}
      {successMessage && <div className="guest-manager-toast" role="status"><Check size={17} aria-hidden="true" /> {successMessage}</div>}
      <section className="guest-manager-summary"><Users size={22} aria-hidden="true" /><strong>{roster.guests.length} guests</strong><span>{roster.groups.length} invitation groups</span></section>
        <section className="guest-group-workflow">
          <div className="guest-workflow-heading"><p>Step 1</p><h2>Invitation groups (OPTIONAL)</h2><span>Use groups for families, couples, and shared invitations. Guests can also remain individual.</span></div>
          <div className="guest-group-workflow-content">
            <form onSubmit={addGroup}>
              <label>Group name<input value={groupName} onChange={input => setGroupName(input.target.value)} placeholder="e.g. Dela Cruz Family" required /></label>
              <label>Contact number<input type="tel" value={groupContactNumber} onChange={input => setGroupContactNumber(input.target.value)} /></label>
              <label>Invited party size<input type="number" min="1" max="20" value={groupSize} onChange={input => setGroupSize(Number(input.target.value) || 1)} /></label>
              <button type="submit"><Plus size={16} aria-hidden="true" /> Create group</button>
            </form>
                    <div className="guest-group-list"><div className="guest-group-list-heading"><strong>Current groups</strong><label>Rows<select value={groupPageSize} onChange={input => { const value = input.target.value; setGroupPageSize(value === 'all' ? 'all' : Number(value)); setGroupPage(1); }}><option value="5">5</option><option value="10">10</option><option value="15">15</option><option value="20">20</option><option value="all">All</option></select></label></div>{roster.groups.length === 0 ? <span>No groups yet.</span> : <><div className="guest-group-table-wrap"><table><thead><tr><th>#</th><th>Group</th><th>Contact</th><th>Guests</th><th></th></tr></thead><tbody>{pageGroups.map((group, index) => { const groupNumber = groupPageSize === 'all' ? index + 1 : (currentGroupPage - 1) * groupPageSize + index + 1; return editingGroupId === group.id ? <tr key={group.id}><td>{groupNumber}</td><td colSpan={3}><form className="guest-group-edit" onSubmit={(event) => { event.preventDefault(); saveGroup(group.id); }}><input value={editingGroupName} onChange={input => setEditingGroupName(input.target.value)} aria-label="Group name" required /><input type="tel" value={editingGroupContactNumber} onChange={input => setEditingGroupContactNumber(input.target.value)} aria-label="Contact number" /><input type="number" min={guestCountFor(group.id)} max="20" value={editingGroupSize} onChange={input => setEditingGroupSize(Number(input.target.value) || guestCountFor(group.id))} aria-label="Invited party size" /><button type="submit">Save</button><button type="button" onClick={() => setEditingGroupId(null)}>Cancel</button></form></td><td /></tr> : <tr key={group.id}><td>{groupNumber}</td><td>{group.name}</td><td>{group.contact_number || '-'}</td><td>{guestCountFor(group.id)} / {group.invited_party_size}</td><td><div className="guest-group-actions"><button type="button" onClick={() => beginEditGroup(group.id)} aria-label={`Edit ${group.name}`} title="Edit group"><Pencil size={15} aria-hidden="true" /></button><button type="button" onClick={() => removeGroup(group.id, group.name)} aria-label={`Delete ${group.name}`} title="Delete group"><Trash2 size={15} aria-hidden="true" /></button></div></td></tr>; })}</tbody></table></div>{groupPageSize !== 'all' && <nav className="guest-group-pagination" aria-label="Guest group pages"><button type="button" onClick={() => setGroupPage(current => Math.max(1, current - 1))} disabled={currentGroupPage === 1} aria-label="Previous group page"><ChevronLeft size={18} aria-hidden="true" /></button><span>Page {currentGroupPage} of {groupPageCount}</span><button type="button" onClick={() => setGroupPage(current => Math.min(groupPageCount, current + 1))} disabled={currentGroupPage === groupPageCount} aria-label="Next group page"><ChevronRight size={18} aria-hidden="true" /></button></nav>}</>}</div>
          </div>
        </section>
        <section className="guest-add-workflow">
          <div className="guest-workflow-heading"><p>Step 2</p><h2>Add guests</h2><span>Add one person at a time, then optionally place them in an invitation group.</span></div>
          <form onSubmit={addGuest}>
            <label>Name<input value={guestName} onChange={input => setGuestName(input.target.value)} required /></label>
            <label>Email<input type="email" value={guestEmail} onChange={input => setGuestEmail(input.target.value)} /></label>
            <label>Contact number<input type="tel" value={guestPhone} onChange={input => setGuestPhone(input.target.value)} /></label>
            <label>Invitation group (optional)<input list="guest-group-options" value={guestGroupSearch} onChange={input => updateGuestGroupSearch(input.target.value)} placeholder="Search a group or leave blank" /><datalist id="guest-group-options">{roster.groups.map(group => <option key={group.id} value={group.name} />)}</datalist></label>
            <button type="submit"><Plus size={16} aria-hidden="true" /> Add guest</button>
          </form>
        </section>
      <section className="guest-manager-list"><div className="guest-list-heading"><div><p>Roster</p><h2>Guests</h2><span>{visibleGuests.length} shown of {roster.guests.length}</span></div></div><div className="guest-list-controls guest-list-controls-inline"><label>Group<input list="roster-group-options" value={groupFilterSearch} onChange={input => updateGroupFilterSearch(input.target.value)} /><datalist id="roster-group-options"><option value="All guests" /><option value="Individual guests" />{roster.groups.map(group => <option key={group.id} value={group.name} />)}</datalist></label><label>Rows<select value={guestPageSize} onChange={input => { const value = input.target.value; setGuestPageSize(value === 'all' ? 'all' : Number(value)); setPage(1); }}><option value="5">5</option><option value="15">15</option><option value="30">30</option><option value="all">All</option></select></label><label>Order<select value={sortMode} onChange={input => { setSortMode(input.target.value as 'grouped' | 'individual'); setPage(1); }}><option value="grouped">Groups first</option><option value="individual">Individuals first</option></select></label></div>{visibleGuests.length === 0 ? <p className="guest-empty-roster">No guests match this view.</p> : <><div className="guest-table-wrap"><table><thead><tr><th>#</th><th>Guest</th><th>Invitation group</th><th>Email</th><th>Contact #</th><th></th></tr></thead><tbody>{pageGuests.map((guest, index) => { const guestNumber = guestPageSize === 'all' ? index + 1 : (currentPage - 1) * guestPageSize + index + 1; return editingGuestId === guest.id ? <tr key={guest.id} className="guest-edit-row"><td>{guestNumber}</td><td><input value={editingGuestName} onChange={input => setEditingGuestName(input.target.value)} aria-label="Guest name" /></td><td><select value={editingGuestGroupId} onChange={input => setEditingGuestGroupId(input.target.value)} aria-label="Invitation group"><option value="">Individual guest</option>{roster.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></td><td><input type="email" value={editingGuestEmail} onChange={input => setEditingGuestEmail(input.target.value)} aria-label="Guest email" /></td><td><input type="tel" value={editingGuestPhone} onChange={input => setEditingGuestPhone(input.target.value)} aria-label="Guest contact number" /></td><td><div className="guest-row-actions"><button type="button" onClick={() => saveGuest(guest.id)}>Save</button><button type="button" onClick={() => setEditingGuestId(null)}>Cancel</button></div></td></tr> : <tr key={guest.id}><td>{guestNumber}</td><td>{guest.full_name}</td><td><span className={guest.group_id ? 'guest-group-badge' : 'guest-individual-badge'}>{groupNameFor(guest.group_id)}</span></td><td>{guest.email || '-'}</td><td>{guest.phone || '-'}</td><td><div className="guest-row-actions"><button type="button" onClick={() => beginEditGuest(guest)} aria-label={`Edit ${guest.full_name}`} title="Edit guest"><Pencil size={15} aria-hidden="true" /></button><button type="button" onClick={() => removeGuest(guest)} aria-label={`Delete ${guest.full_name}`} title="Delete guest"><Trash2 size={15} aria-hidden="true" /></button></div></td></tr>; })}</tbody></table></div>{guestPageSize !== 'all' && <nav className="guest-pagination" aria-label="Guest roster pages"><button type="button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={currentPage === 1} aria-label="Previous guest page"><ChevronLeft size={18} aria-hidden="true" /></button><span>Page {currentPage} of {pageCount}</span><button type="button" onClick={() => setPage(current => Math.min(pageCount, current + 1))} disabled={currentPage === pageCount} aria-label="Next guest page"><ChevronRight size={18} aria-hidden="true" /></button></nav>}</>}</section>
    </div>
  </main>;
};

export default GuestManager;