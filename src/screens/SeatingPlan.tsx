import { useEffect, useState } from 'react';
import { Download, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { getGuestRoster } from '../services/guestService';
import type { GuestGroup } from '../services/guestService';
import {
  assignSeatingGuest, createSeatingGuest, createSeatingTable, deleteSeatingTable,
  getSeatingPlan, updateSeatingTable,
} from '../services/seatingService';
import type { SeatingGuest, SeatingPlan as SeatingPlanData, SeatingTable } from '../services/seatingService';
import { seatingCsv } from '../utils/seatingExport';
import { getHostCode } from '../utils/hostAuth';
import './SeatingPlan.css';

const emptyPlan: SeatingPlanData = { tables: [], guests: [] };

const SeatingPlan = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const hostCode = getHostCode();
  const [plan, setPlan] = useState<SeatingPlanData>(emptyPlan);
  const [groups, setGroups] = useState<GuestGroup[]>([]);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState(8);
  const [newGuest, setNewGuest] = useState({ fullName: '', email: '', phone: '', groupId: '', tableId: '' });
  const [editing, setEditing] = useState<string | null>(null);
  const [tableName, setTableName] = useState('');
  const [tableCapacity, setTableCapacity] = useState(8);
  const [error, setError] = useState(!eventId || !hostCode ? 'Host access and an event are required.' : '');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(Boolean(eventId && hostCode));
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!eventId || !hostCode) throw new Error('Host access and an event are required.');
    const [seating, roster] = await Promise.all([getSeatingPlan(eventId, hostCode), getGuestRoster(eventId, hostCode)]);
    setPlan(seating);
    setGroups(roster.groups);
  };

  useEffect(() => {
    let current = true;
    if (!eventId || !hostCode) return;
    Promise.all([getSeatingPlan(eventId, hostCode), getGuestRoster(eventId, hostCode)])
      .then(([seating, roster]) => {
        if (current) { setPlan(seating); setGroups(roster.groups); }
      })
      .catch(cause => { if (current) setError(cause instanceof Error ? cause.message : 'Could not load seating plan.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [eventId, hostCode]);

  const perform = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await reload();
      setNotice(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update seating plan.');
    } finally {
      setBusy(false);
    }
  };

  const addTable = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventId || !hostCode) return;
    await perform(async () => {
      await createSeatingTable(eventId, hostCode, name, capacity);
      setName('');
    }, 'Table added.');
  };

  const saveTable = async (event: React.FormEvent, tableId: string) => {
    event.preventDefault();
    if (!eventId || !hostCode) return;
    await perform(async () => {
      await updateSeatingTable(eventId, hostCode, tableId, tableName, tableCapacity);
      setEditing(null);
    }, 'Table updated.');
  };

  const removeTable = (table: SeatingTable) => {
    if (!eventId || !hostCode || !window.confirm(`Remove ${table.name}? Its guests will become unassigned.`)) return;
    void perform(() => deleteSeatingTable(eventId, hostCode, table.id), 'Table removed; its guests are unassigned.');
  };

  const assign = (guest: SeatingGuest, tableId: string) => {
    if (!eventId || !hostCode) return;
    void perform(() => assignSeatingGuest(eventId, hostCode, guest.id, tableId || null), `${guest.full_name} ${tableId ? 'seated' : 'unassigned'}.`);
  };

  const addGuest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventId || !hostCode || !newGuest.tableId) {
      setError('Select a table for the new guest.');
      return;
    }
    await perform(async () => {
      await createSeatingGuest(eventId, hostCode, { ...newGuest, groupId: newGuest.groupId || null, tableId: newGuest.tableId });
      setNewGuest({ fullName: '', email: '', phone: '', groupId: '', tableId: '' });
    }, 'Guest added to the guest list and seating plan.');
  };

  const downloadCsv = () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF', seatingCsv(plan)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `seating-${eventId}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const matches = (guest: SeatingGuest) => `${guest.full_name} ${guest.companion_label ?? ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const unassigned = plan.guests.filter(guest => !guest.table_id && matches(guest));
  const seatedCount = plan.guests.filter(guest => guest.table_id).length;
  const groupName = (groupId: string | null) => groups.find(group => group.id === groupId)?.name;

  const guestRow = (guest: SeatingGuest) => (
    <li key={guest.id}>
      <div className="seating-person">
        <strong>{guest.full_name}</strong>
        {guest.companion_label && <span className="seating-origin">{guest.companion_label}</span>}
        <small>{groupName(guest.group_id) ?? 'Individual'} · {guest.rsvp_status ?? 'Awaiting RSVP'}</small>
      </div>
      <label className="seating-assignment">
        <span className="sr-only">Table for {guest.full_name}</span>
        <select value={guest.table_id ?? ''} onChange={event => assign(guest, event.target.value)} disabled={busy}>
          <option value="">Unassigned</option>
          {plan.tables.map(table => <option key={table.id} value={table.id}>{table.name}</option>)}
        </select>
      </label>
    </li>
  );

  return <main className="seating-plan">
    <header className="seating-header">
      <div><p>Event planning</p><h1>Seating plan</h1></div>
    </header>
    <div className="seating-content">
      <h1 className="seating-print-title">Seating plan</h1>
      {error && <p className="seating-error" role="alert">{error}</p>}
      {notice && <p className="seating-notice" role="status">{notice}</p>}
      {loading ? <p>Loading seating plan...</p> : <>
        <section className="seating-summary">
          <strong>{plan.guests.length} total guests</strong><span>{seatedCount} seated · {plan.guests.length - seatedCount} unassigned</span>
          <div className="seating-export"><button type="button" onClick={() => window.print()}><Printer size={16} /> Print</button><button type="button" onClick={downloadCsv}><Download size={16} /> Export CSV</button></div>
        </section>

        <section className="seating-add-table seating-form">
          <h2>Create a table</h2>
          <form onSubmit={addTable}>
            <label>Table name<input value={name} onChange={event => setName(event.target.value)} maxLength={255} required /></label>
            <label>Seats<input type="number" min="1" max="1000" value={capacity} onChange={event => setCapacity(Number(event.target.value))} required /></label>
            <button type="submit" disabled={busy}><Plus size={16} /> Add table</button>
          </form>
        </section>

        <section className="seating-add-guest seating-form">
          <h2>Add and seat a guest</h2>
          <p>New guests also appear in the invitation guest list and total.</p>
          <form onSubmit={addGuest}>
            <label>Name<input value={newGuest.fullName} onChange={event => setNewGuest({ ...newGuest, fullName: event.target.value })} required maxLength={255} /></label>
            <label>Email<input type="email" value={newGuest.email} onChange={event => setNewGuest({ ...newGuest, email: event.target.value })} /></label>
            <label>Phone<input type="tel" value={newGuest.phone} onChange={event => setNewGuest({ ...newGuest, phone: event.target.value })} /></label>
            <label>Invitation group<select value={newGuest.groupId} onChange={event => setNewGuest({ ...newGuest, groupId: event.target.value })}><option value="">Individual</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
            <label>Table<select value={newGuest.tableId} onChange={event => setNewGuest({ ...newGuest, tableId: event.target.value })} required><option value="">Select table</option>{plan.tables.map(table => <option key={table.id} value={table.id}>{table.name}</option>)}</select></label>
            <button type="submit" disabled={busy || !plan.tables.length}><Plus size={16} /> Add and seat</button>
          </form>
        </section>

        <label className="seating-search"><Search size={18} /><span className="sr-only">Search guests</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search guests or companion labels" /></label>

        <div className="seating-grid">
          <section className="seating-table seating-unassigned">
            <h2>Unassigned <small>{plan.guests.filter(guest => !guest.table_id).length}</small></h2>
            {unassigned.length ? <ul>{unassigned.map(guestRow)}</ul> : <p>{search ? 'No matching unassigned guests.' : 'Everyone has a table.'}</p>}
          </section>
          {plan.tables.map(table => {
            const seated = plan.guests.filter(guest => guest.table_id === table.id && matches(guest));
            const overCapacity = table.occupancy > table.capacity;
            return <section className={`seating-table${overCapacity ? ' seating-over-capacity' : ''}`} key={table.id}>
              <div className="seating-table-heading"><div><h2>{table.name}</h2><span>{table.occupancy} / {table.capacity} seats</span></div><div className="seating-table-actions"><button type="button" disabled={busy} onClick={() => { setEditing(table.id); setTableName(table.name); setTableCapacity(table.capacity); }}>Edit</button><button type="button" aria-label={`Remove ${table.name}`} disabled={busy} onClick={() => removeTable(table)}><Trash2 size={16} /></button></div></div>
              {overCapacity && <p className="seating-warning" role="status">Over capacity by {table.occupancy - table.capacity}. Move guests or increase seats.</p>}
              {editing === table.id && <form className="seating-edit" onSubmit={event => saveTable(event, table.id)}><label>Name<input value={tableName} onChange={event => setTableName(event.target.value)} required maxLength={255} /></label><label>Seats<input type="number" min="1" max="1000" value={tableCapacity} onChange={event => setTableCapacity(Number(event.target.value))} required /></label><button disabled={busy} type="submit">Save</button><button type="button" onClick={() => setEditing(null)}>Cancel</button></form>}
              {seated.length ? <ul>{seated.map(guestRow)}</ul> : <p>{search ? 'No matching guests.' : 'No guests seated yet.'}</p>}
            </section>;
          })}
        </div>
      </>}
    </div>
  </main>;
};

export default SeatingPlan;
