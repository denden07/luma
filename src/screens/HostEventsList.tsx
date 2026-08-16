import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEventsByHostCode } from '../services/apiService';
import { getHostCode, clearHostCode } from '../utils/hostAuth';
import type { Event } from '../services/apiService';
import './HostEventsList.css';

const HostEventsList: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const hostCode = getHostCode();
      if (!hostCode) {
        navigate('/host/login');
        return;
      }

      const allEvents = await getEventsByHostCode(hostCode);
      // Sort by date, newest first
      const sortedEvents = allEvents.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setEvents(sortedEvents);
      console.log('[HostEventsList] Loaded', sortedEvents.length, 'events');
    } catch (err) {
      console.error('[HostEventsList] Failed to load events:', err);
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleLogout = () => {
    const hostCode = getHostCode();
    if (confirm(`Logout from host code ${hostCode}? Make sure you have saved your code!`)) {
      clearHostCode();
      navigate('/host/login');
    }
  };

  const hasReachedEventLimit = events.length >= 2;

  return (
    <div className="host-events-list">
      <div className="events-header">
        <div className="header-left">
          <h1 className="handwritten">My Events</h1>
          <span className="host-code-badge">Code: {getHostCode()}</span>
        </div>
        <div className="header-right">
          <button 
            className="create-new-button"
            onClick={() => navigate('/host/create')}
            disabled={hasReachedEventLimit || isLoading}
            title={hasReachedEventLimit ? 'You can create up to two events' : 'Create a new event'}
          >
            {hasReachedEventLimit ? 'Event limit reached' : '+ Create New Event'}
          </button>
          <button 
            className="logout-button"
            onClick={handleLogout}
            title="Logout"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="events-content">
        {isLoading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading events...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <div className="error-icon">⚠️</div>
            <h2>Unable to load events</h2>
            <p>{error}</p>
            <button className="retry-button" onClick={loadEvents}>
              Try Again
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📅</div>
            <h2 className="handwritten">No events yet</h2>
            <p>Create your first event to get started!</p>
            <button 
              className="primary-button"
              onClick={() => navigate('/host/create')}
              disabled={hasReachedEventLimit}
            >
              {hasReachedEventLimit ? 'Event limit reached' : 'Create Event'}
            </button>
          </div>
        ) : (
          <div className="events-grid">
            {events.map((event) => (
              <div 
                key={event.id} 
                className="event-card"
                onClick={() => navigate(`/host/dashboard/${event.id}`)}
              >
                <div className="event-card-header">
                  <h3 className="event-card-name">{event.name}</h3>
                  <span className="event-date">{formatDate(event.date)}</span>
                </div>
                <div className="event-card-footer">
                  <div className="event-limits-preview">
                    <span>Guests: {event.guest_limit}</span>
                    <span>Photos: {event.photo_limit} / guest</span>
                  </div>
                  <button 
                    className="view-dashboard-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/host/dashboard/${event.id}`);
                    }}
                  >
                    View Dashboard →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default HostEventsList;
