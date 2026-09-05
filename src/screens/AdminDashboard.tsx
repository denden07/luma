import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CalendarDays, CircleUserRound, KeyRound, List, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Modal from '../components/Modal';
import { copyTextToClipboard } from '../utils/clipboard';
import { generateAdminHostCode, getAdminEventsForMonth, getAdminEventsPage, getAdminHostsPage, logoutAdmin, updateAdminEvent, updateAdminHost, type AdminEvent, type AdminHost } from '../services/adminService';
import './AdminDashboard.css';

type View = 'calendar' | 'events' | 'users' | 'generate';
type Sort = 'date' | 'name' | 'host' | 'status' | 'price' | 'payment';
const pageSizes = [10, 20, 50] as const;
const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const nav = [{ id: 'calendar' as const, label: 'Calendar', icon: CalendarDays }, { id: 'events' as const, label: 'Events', icon: List }, { id: 'users' as const, label: 'Users (Hosts)', icon: CircleUserRound }, { id: 'generate' as const, label: 'Generate host code', icon: KeyRound }];

function sameDay(left: Date, right: Date) { return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate(); }
function daysForMonth(month: Date) { const first = new Date(month.getFullYear(), month.getMonth(), 1); const start = new Date(month.getFullYear(), month.getMonth(), 1 - first.getDay()); return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)); }
function displayDate(event: AdminEvent) { return new Date(event.start_time ?? event.date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
function monthValue(month: Date) { return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`; }

export default function AdminDashboard() {
  const [view, setView] = useState<View>('calendar');
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [calendarEvents, setCalendarEvents] = useState<AdminEvent[]>([]);
  const [eventRows, setEventRows] = useState<AdminEvent[]>([]);
  const [hostRows, setHostRows] = useState<AdminHost[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AdminEvent | null>(null);
  const [eventPage, setEventPage] = useState(1);
  const [eventPageSize, setEventPageSize] = useState<(typeof pageSizes)[number]>(10);
  const [eventTotal, setEventTotal] = useState(0);
  const [hostPage, setHostPage] = useState(1);
  const [hostPageSize, setHostPageSize] = useState<(typeof pageSizes)[number]>(10);
  const [hostTotal, setHostTotal] = useState(0);
  const [hostSearch, setHostSearch] = useState('');
  const [hostStartDate, setHostStartDate] = useState('');
  const [hostEndDate, setHostEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | AdminEvent['payment_status']>('all');
  const [eventStartDate, setEventStartDate] = useState('');
  const [eventEndDate, setEventEndDate] = useState('');
  const [sort, setSort] = useState<Sort>('date');
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(true);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [confirmGeneration, setConfirmGeneration] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [hostToToggle, setHostToToggle] = useState<AdminHost | null>(null);
  const [selectedHost, setSelectedHost] = useState<AdminHost | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleError = (requestError: unknown) => {
    if (requestError instanceof Error && requestError.message === 'Authentication required') setAuthenticated(false);
    else setError(requestError instanceof Error ? requestError.message : 'Unable to load admin data');
  };

  useEffect(() => { getAdminEventsForMonth(month.getFullYear(), month.getMonth() + 1).then(setCalendarEvents).catch(handleError); }, [month]);
  useEffect(() => { if (view === 'events') getAdminEventsPage({ page: eventPage, pageSize: eventPageSize, status: statusFilter, payment: paymentFilter, startDate: eventStartDate, endDate: eventEndDate, sort }).then(result => { setEventRows(result.events); setEventTotal(result.total); }).catch(handleError); }, [view, eventPage, eventPageSize, statusFilter, paymentFilter, eventStartDate, eventEndDate, sort]);
  useEffect(() => { if (view === 'users') getAdminHostsPage({ page: hostPage, pageSize: hostPageSize, search: hostSearch, startDate: hostStartDate, endDate: hostEndDate }).then(result => { setHostRows(result.hosts); setHostTotal(result.total); }).catch(handleError); }, [view, hostPage, hostPageSize, hostSearch, hostStartDate, hostEndDate]);
  if (!authenticated) return <Navigate to="/admin/login" replace />;

  const selectedEvents = selectedDay ? calendarEvents.filter(event => sameDay(new Date(event.date), selectedDay)) : [];
  const eventPages = Math.max(1, Math.ceil(eventTotal / eventPageSize));
  const hostPages = Math.max(1, Math.ceil(hostTotal / hostPageSize));
  const selectPage = (totalPages: number, currentPage: number, select: (page: number) => void) => <div className="admin-pagination"><span>Page {currentPage} of {totalPages}</span><div>{Array.from({ length: totalPages }, (_, index) => index + 1).filter(number => number === 1 || number === totalPages || Math.abs(number - currentPage) <= 1).map((number, index, numbers) => <span key={number}>{index > 0 && number - numbers[index - 1] > 1 && <i>...</i>}<button type="button" className={number === currentPage ? 'active' : ''} onClick={() => select(number)}>{number}</button></span>)}</div></div>;
  const setCalendarMonth = (value: string) => { const [year, monthNumber] = value.split('-').map(Number); if (year && monthNumber) { setMonth(new Date(year, monthNumber - 1, 1)); setSelectedDay(null); } };
  const updateEvent = async (event: AdminEvent, changes: Parameters<typeof updateAdminEvent>[1]) => { try { const updated = await updateAdminEvent(event.id, changes); const update = (items: AdminEvent[]) => items.map(item => item.id === event.id ? { ...item, ...updated } : item); setCalendarEvents(update); setEventRows(update); setSelectedEvent(current => current?.id === event.id ? { ...current, ...updated } : current); return true; } catch (requestError) { handleError(requestError); return false; } };
  const generateCode = async () => { try { setGeneratedCode((await generateAdminHostCode()).code); } catch (requestError) { handleError(requestError); } };
  const saveEventDetails = async () => {
    if (selectedEvent && await updateEvent(selectedEvent, { price_php: selectedEvent.price_php, payment_status: selectedEvent.payment_status })) {
      setToastMessage('Event details updated');
      window.setTimeout(() => setToastMessage(null), 3000);
    }
  };
  const toggleHost = async () => {
    if (!hostToToggle) return;
    try {
      const updated = await updateAdminHost(hostToToggle.id, !hostToToggle.is_active);
      setHostRows(current => current.map(host => host.id === updated.id ? { ...host, ...updated } : host));
      setSelectedHost(current => current?.id === updated.id ? { ...current, ...updated } : current);
      setToastMessage(updated.is_active ? 'Host enabled' : 'Host disabled');
      window.setTimeout(() => setToastMessage(null), 3000);
    } catch (requestError) { handleError(requestError); }
    finally { setHostToToggle(null); }
  };

  return <main className={`admin-dashboard ${collapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className="admin-sidebar"><div><div className="admin-sidebar-heading"><div className="admin-sidebar-brand"><p className="admin-brand">Madetogether</p><h1>Event office</h1></div><button className="admin-sidebar-toggle" type="button" onClick={() => setCollapsed(value => !value)} title={collapsed ? 'Expand menu' : 'Minimize menu'}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button></div><nav className="admin-nav">{nav.map(item => { const Icon = item.icon; return <button key={item.id} type="button" className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)} title={item.label}><Icon /><span>{item.label}</span></button>; })}</nav></div><div className="admin-sidebar-note"><strong>Event operations</strong><span>Scheduling, host access, availability, and billing.</span></div><button className="admin-logout" type="button" onClick={async () => { try { await logoutAdmin(); } finally { navigate('/admin/login', { replace: true }); } }}>Sign out</button></aside>
    <section className="admin-workspace">{error && <div className="admin-error"><span>{error}</span><button type="button" onClick={() => setError(null)}>Dismiss</button></div>}
      {view === 'calendar' && <CalendarControls month={month} onChange={setMonth} />}
      {view === 'calendar' && <><header className="admin-toolbar"><div><p className="admin-eyebrow">Event calendar</p><h2>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2></div><label className="admin-month-picker">Calendar month<input type="month" value={monthValue(month)} onChange={event => setCalendarMonth(event.target.value)} /></label></header><div className="admin-metrics"><div><span>Booked this month</span><strong>{money.format(calendarEvents.reduce((sum, event) => sum + event.price_php, 0))}</strong></div><div><span>Collected</span><strong>{money.format(calendarEvents.filter(event => event.payment_status === 'paid').reduce((sum, event) => sum + event.price_php, 0))}</strong></div><div><span>Open balances</span><strong>{calendarEvents.filter(event => event.payment_status !== 'paid').length}</strong></div><div><span>Active events</span><strong>{calendarEvents.filter(event => event.is_active).length}</strong></div></div><div className="admin-calendar">{weekdays.map(day => <div className="admin-weekday" key={day}>{day}</div>)}{daysForMonth(month).map(day => <button className={`admin-calendar-day ${day.getMonth() === month.getMonth() ? '' : 'outside-month'}`} type="button" key={day.toISOString()} onClick={() => setSelectedDay(day)}><span className="admin-day-number">{day.getDate()}</span>{calendarEvents.filter(event => sameDay(new Date(event.date), day)).slice(0, 3).map(event => <span className={`admin-event-chip ${event.is_active ? '' : 'inactive'}`} key={event.id}>{event.name}</span>)}</button>)}</div></>}
      {view === 'events' && <><header className="admin-toolbar"><div><p className="admin-eyebrow">Event management</p><h2>All events</h2></div></header><div className="admin-table-filters"><label>From<input type="date" value={eventStartDate} onChange={event => { setEventPage(1); setEventStartDate(event.target.value); }} /></label><label>To<input type="date" value={eventEndDate} onChange={event => { setEventPage(1); setEventEndDate(event.target.value); }} /></label><label>Availability<select value={statusFilter} onChange={event => { setEventPage(1); setStatusFilter(event.target.value as typeof statusFilter); }}><option value="all">All</option><option value="active">Active</option><option value="inactive">Deactivated</option></select></label><label>Payment<select value={paymentFilter} onChange={event => { setEventPage(1); setPaymentFilter(event.target.value as typeof paymentFilter); }}><option value="all">All</option><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="paid">Paid</option></select></label><label>Rows<select value={eventPageSize} onChange={event => { setEventPage(1); setEventPageSize(Number(event.target.value) as typeof eventPageSize); }}>{pageSizes.map(size => <option key={size}>{size}</option>)}</select></label></div><EventTable events={eventRows} onSelect={setSelectedEvent} onSort={sort => { setSort(sort); setEventPage(1); }} />{selectPage(eventPages, eventPage, setEventPage)}</>}
      {view === 'users' && <><header className="admin-toolbar"><div><p className="admin-eyebrow">Host access</p><h2>Users (Hosts)</h2></div></header><div className="admin-table-filters"><label>Search host code<input value={hostSearch} onChange={event => { setHostPage(1); setHostSearch(event.target.value); }} placeholder="e.g. AB12CD" /></label><label>Created from<input type="date" value={hostStartDate} onChange={event => { setHostPage(1); setHostStartDate(event.target.value); }} /></label><label>Created to<input type="date" value={hostEndDate} onChange={event => { setHostPage(1); setHostEndDate(event.target.value); }} /></label><label>Rows<select value={hostPageSize} onChange={event => { setHostPage(1); setHostPageSize(Number(event.target.value) as typeof hostPageSize); }}>{pageSizes.map(size => <option key={size}>{size}</option>)}</select></label></div><div className="admin-table-wrap"><table className="admin-events-table"><thead><tr><th>Host code</th><th>Created</th><th>Events</th><th>Access</th></tr></thead><tbody>{hostRows.map(host => <tr key={host.id} onClick={() => setSelectedHost(host)}><td><strong>{host.code}</strong></td><td>{new Date(host.created_at).toLocaleDateString()}</td><td>{host.event_count}</td><td><span className={`admin-status ${host.is_active ? 'active' : 'inactive'}`}>{host.is_active ? 'Active' : 'Disabled'}</span></td></tr>)}</tbody></table></div>{selectPage(hostPages, hostPage, setHostPage)}</>}
      {view === 'generate' && <section className="admin-generate-view"><p className="admin-eyebrow">Host access</p><h2>Generate host code</h2><p>Create a unique six-character access code to give an event host. The code is generated only after you confirm.</p><button type="button" className="admin-primary-action" onClick={() => setConfirmGeneration(true)}>Generate host code</button></section>}
    </section>
    <Modal isOpen={Boolean(selectedDay)} onClose={() => setSelectedDay(null)} className="admin-modal admin-day-modal"><p className="admin-eyebrow">Selected date</p><h2>{selectedDay?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h2>{selectedEvents.length ? <div className="admin-modal-event-list">{selectedEvents.map(event => <button type="button" key={event.id} onClick={() => { setSelectedEvent(event); setSelectedDay(null); }}><strong>{event.name}</strong><span>{event.host_code} · {money.format(event.price_php)}</span></button>)}</div> : <p>No events scheduled for this date.</p>}</Modal>
    <Modal isOpen={Boolean(selectedEvent)} onClose={() => setSelectedEvent(null)} className="admin-modal admin-event-modal">{selectedEvent && <><div className="admin-detail-heading"><div><p className="admin-eyebrow">Event details</p><h2>{selectedEvent.name}</h2><span>Host {selectedEvent.host_code}</span></div><button type="button" onClick={() => setSelectedEvent(null)}>&times;</button></div><div className="admin-detail-grid"><div><span>Scheduled</span><strong>{displayDate(selectedEvent)}</strong></div><div><span>Guests</span><strong>{selectedEvent.participant_count} / {selectedEvent.guest_limit}</strong></div><div><span>Photos</span><strong>{selectedEvent.photo_count}</strong></div></div><label>Event price (PHP)<input type="number" min="0" value={selectedEvent.price_php} onChange={event => setSelectedEvent({ ...selectedEvent, price_php: Number(event.target.value) })} /></label><label>Payment status<select value={selectedEvent.payment_status} onChange={event => setSelectedEvent({ ...selectedEvent, payment_status: event.target.value as AdminEvent['payment_status'] })}><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="paid">Paid</option></select></label><button className="admin-save-event" type="button" onClick={saveEventDetails}>Save changes</button><button className={selectedEvent.is_active ? 'admin-deactivate' : 'admin-reactivate'} type="button" onClick={() => setConfirmStatus(true)}>{selectedEvent.is_active ? 'Deactivate event' : 'Reactivate event'}</button></>}</Modal>
    <Modal isOpen={Boolean(selectedHost)} onClose={() => setSelectedHost(null)} className="admin-modal admin-host-modal">{selectedHost && <><p className="admin-eyebrow">Host details</p><button className="admin-copy-code" type="button" onClick={async () => { await copyTextToClipboard(selectedHost.code); setCopySuccess(true); }} title="Copy host code">{selectedHost.code}</button><div className="admin-detail-grid"><div><span>Created</span><strong>{new Date(selectedHost.created_at).toLocaleDateString()}</strong></div><div><span>Events</span><strong>{selectedHost.event_count}</strong></div><div><span>Access</span><strong>{selectedHost.is_active ? 'Active' : 'Disabled'}</strong></div></div><button className={selectedHost.is_active ? 'admin-deactivate' : 'admin-reactivate'} type="button" onClick={() => setHostToToggle(selectedHost)}>{selectedHost.is_active ? 'Disable host' : 'Enable host'}</button></>}</Modal><Modal isOpen={confirmGeneration} onClose={() => setConfirmGeneration(false)} className="admin-modal"><h2>Generate a host code?</h2><p>A unique six-character code will be created and can be shared immediately with the host.</p><div className="admin-modal-actions"><button type="button" className="admin-modal-secondary" onClick={() => setConfirmGeneration(false)}>Cancel</button><button type="button" onClick={() => { setConfirmGeneration(false); generateCode(); }}>Generate</button></div></Modal><Modal isOpen={Boolean(generatedCode)} onClose={() => setGeneratedCode(null)} className="admin-modal"><p className="admin-eyebrow">Host code created</p><h2>{generatedCode}</h2><button type="button" onClick={async () => { if (generatedCode) { await copyTextToClipboard(generatedCode); setCopySuccess(true); } }}>Copy code</button></Modal><Modal isOpen={copySuccess} onClose={() => setCopySuccess(false)} className="admin-modal"><h2>Code copied</h2><button type="button" onClick={() => setCopySuccess(false)}>Done</button></Modal><Modal isOpen={confirmStatus} onClose={() => setConfirmStatus(false)} className="admin-modal"><h2>{selectedEvent?.is_active ? 'Deactivate this event?' : 'Reactivate this event?'}</h2><p>{selectedEvent?.is_active ? 'Hosts and guests will no longer be able to access it.' : 'Hosts and guests will be able to access it again.'}</p><div className="admin-modal-actions"><button type="button" className="admin-modal-secondary" onClick={() => setConfirmStatus(false)}>Cancel</button><button type="button" onClick={() => { if (selectedEvent) updateEvent(selectedEvent, { is_active: !selectedEvent.is_active }); setConfirmStatus(false); }}>{selectedEvent?.is_active ? 'Deactivate' : 'Reactivate'}</button></div></Modal><Modal isOpen={Boolean(hostToToggle)} onClose={() => setHostToToggle(null)} className="admin-modal"><h2>{hostToToggle?.is_active ? 'Disable this host?' : 'Enable this host?'}</h2><p>{hostToToggle?.is_active ? 'This host code will no longer be able to log in.' : 'This host code will be able to log in again.'}</p><div className="admin-modal-actions"><button type="button" className="admin-modal-secondary" onClick={() => setHostToToggle(null)}>Cancel</button><button type="button" onClick={toggleHost}>{hostToToggle?.is_active ? 'Disable host' : 'Enable host'}</button></div></Modal>{toastMessage && <div className="admin-toast" role="status">{toastMessage}</div>}
  </main>;
}

function EventTable({ events, onSelect, onSort }: { events: AdminEvent[]; onSelect: (event: AdminEvent) => void; onSort: (sort: Sort) => void }) {
  const columns: Array<[Sort, string]> = [['date', 'Date'], ['name', 'Event'], ['host', 'Host'], ['status', 'Access'], ['price', 'Price'], ['payment', 'Payment']];
  return <div className="admin-table-wrap"><table className="admin-events-table"><thead><tr>{columns.map(([sort, label]) => <th key={sort}><button type="button" onClick={() => onSort(sort)}>{label}</button></th>)}<th>Guests</th><th>Photos</th></tr></thead><tbody>{events.map(event => <tr key={event.id} onClick={() => onSelect(event)}><td>{displayDate(event)}</td><td><strong>{event.name}</strong></td><td>{event.host_code}</td><td><span className={`admin-status ${event.is_active ? 'active' : 'inactive'}`}>{event.is_active ? 'Active' : 'Off'}</span></td><td>{money.format(event.price_php)}</td><td><span className={`admin-payment ${event.payment_status}`}>{event.payment_status}</span></td><td>{event.participant_count} / {event.guest_limit}</td><td>{event.photo_count}</td></tr>)}</tbody></table></div>;
}

function CalendarControls({ month, onChange }: { month: Date; onChange: (month: Date) => void }) {
  const [yearInput, setYearInput] = useState(String(month.getFullYear()));
  useEffect(() => { setYearInput(String(month.getFullYear())); }, [month]);
  const updateMonth = (monthIndex: number) => onChange(new Date(month.getFullYear(), monthIndex, 1));
  const updateYear = (year: number) => {
    if (Number.isInteger(year) && year >= 2000 && year <= 2100) onChange(new Date(year, month.getMonth(), 1));
  };
  const applyYear = () => {
    const year = Number(yearInput);
    if (Number.isInteger(year) && year >= 2000 && year <= 2100) updateYear(year);
    else setYearInput(String(month.getFullYear()));
  };

  return <div className="admin-calendar-controls">
    <label>Month<select value={month.getMonth()} onChange={event => updateMonth(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option value={index} key={index}>{new Date(2024, index, 1).toLocaleString('en-US', { month: 'long' })}</option>)}</select></label>
    <label>Year<input type="number" min="2000" max="2100" value={yearInput} onChange={event => setYearInput(event.target.value)} onBlur={applyYear} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>
  </div>;
}