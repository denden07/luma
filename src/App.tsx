import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Landing from './screens/Landing';
import NameEntry from './screens/NameEntry';
import Camera from './screens/Camera';
import PhotoGallery from './screens/PhotoGallery';
import Developing from './screens/Developing';
import Uploading from './screens/Uploading';
import Complete from './screens/Complete';
import Message from './screens/Message';
import HostDashboard from './screens/HostDashboard';
import EventCreation from './screens/EventCreation';
import HostEventsList from './screens/HostEventsList';
import HostLogin from './screens/HostLogin';
import ErrorBoundary from './components/ErrorBoundary';
import { getParticipant, createParticipant, updatePhotosRemaining, saveParticipant } from './utils/participant';
import { createParticipant as createParticipantAPI, getEvent, getPhotoUrl } from './services/dataService';
import type { Event } from './services/dataService';
import { cacheEvent, getCachedEvent, migrateInvalidPhotoUUIDs } from './utils/indexedDBStorage';
import { isLocalMode } from './utils/env';
import { isHostLoggedIn } from './utils/hostAuth';
import './App.css';

function EventRoute() {
  const { eventToken } = useParams<{ eventToken: string }>();
  const [event, setEvent] = useState<Event | null>(null);
  const [eventError, setEventError] = useState<string | null>(null);
  const [isLoadingEvent, setIsLoadingEvent] = useState(true);
  const [shotsLeft, setShotsLeft] = useState<number>(20);

  useEffect(() => {
    let isCurrent = true;

    const loadEvent = async () => {
      if (!eventToken) {
        setEventError('This event link is incomplete.');
        setIsLoadingEvent(false);
        return;
      }

      setIsLoadingEvent(true);
      setEventError(null);
      try {
        const loadedEvent = await getEvent(eventToken);
        if (!isCurrent) return;
        cacheEvent(loadedEvent).catch(error => {
          console.error('[App] Event cache write failed:', error);
        });
        setEvent(loadedEvent);
        const existingParticipant = getParticipant(eventToken);
        setShotsLeft(existingParticipant?.photosRemaining ?? loadedEvent.photo_limit);
      } catch {
        const cachedEvent = await getCachedEvent(eventToken).catch(() => null);
        if (!isCurrent) return;
        if (cachedEvent) {
          setEvent(cachedEvent);
          const existingParticipant = getParticipant(eventToken);
          setShotsLeft(existingParticipant?.photosRemaining ?? cachedEvent.photo_limit);
        } else {
          setEvent(null);
          setEventError('This event is unavailable. Connect to the internet once, then try again.');
        }
      } finally {
        if (isCurrent) setIsLoadingEvent(false);
      }
    };

    loadEvent();
    return () => { isCurrent = false; };
  }, [eventToken]);

  const handleNameSubmit = async (name: string) => {
    if (eventToken && event) {
      try {
        // First create participant in backend database to get the ID
        const backendParticipant = await createParticipantAPI(eventToken, name);
        console.log('Participant created in database:', backendParticipant.id);
        
        // Then create participant locally with the same ID from backend
        const participant = createParticipant(eventToken, name, event.photo_limit);
        // Override the participant ID with the one from backend
        participant.participantId = backendParticipant.id;
        saveParticipant(participant);
        
        setShotsLeft(participant.photosRemaining);
      } catch (error) {
        console.error('Failed to create participant in database:', error);
        // Fallback: create locally only
        const participant = createParticipant(eventToken, name, event.photo_limit);
        setShotsLeft(participant.photosRemaining);
      }
    }
  };

  const handleCapture = (blob: Blob) => {
    // Photo captured and saved locally - decrement shots
    console.log('Photo captured:', blob.size, 'bytes');
    
    const newShotsLeft = Math.max(0, shotsLeft - 1);
    setShotsLeft(newShotsLeft);
    
    if (eventToken) {
      const participant = getParticipant(eventToken);
      if (participant) {
        updatePhotosRemaining(participant, newShotsLeft);
      }
    }
  };

  const handlePhotoDeleted = () => {
    // Photo deleted - increment shots back
    console.log('Photo deleted, incrementing shots');
    
    const newShotsLeft = shotsLeft + 1;
    setShotsLeft(newShotsLeft);
    
    if (eventToken) {
      const participant = getParticipant(eventToken);
      if (participant) {
        updatePhotosRemaining(participant, newShotsLeft);
      }
    }
  };

  const handleUploadComplete = () => {
    const newShotsLeft = Math.max(0, shotsLeft - 1);
    setShotsLeft(newShotsLeft);
    
    if (eventToken) {
      const participant = getParticipant(eventToken);
      if (participant) {
        updatePhotosRemaining(participant, newShotsLeft);
      }
    }
  };

  // Check if participant exists for this event (bypasses React state timing)
  const checkParticipant = () => {
    return eventToken ? getParticipant(eventToken) !== null : false;
  };

  const isEventOpen = event && (!event.start_time || (
    Date.now() >= new Date(event.start_time).getTime() &&
    (!event.end_time || Date.now() <= new Date(event.end_time).getTime())
  ));

  if (isLoadingEvent) {
    return <div className="event-state"><p>Loading event...</p></div>;
  }

  if (eventError || !event) {
    return <div className="event-state"><h1 className="handwritten">Event unavailable</h1><p>{eventError}</p></div>;
  }

  if (!isEventOpen) {
    const schedule = event.start_time && event.end_time
      ? `${new Date(event.start_time).toLocaleString()} - ${new Date(event.end_time).toLocaleString()}`
      : event.start_time
        ? `The camera opens ${new Date(event.start_time).toLocaleString()}.`
        : 'The host has not opened the camera yet.';
    return <div className="event-state"><h1 className="handwritten">Camera is closed</h1><p>{schedule}</p></div>;
  }

  return (
    <Routes>
      <Route path="/" element={<Landing eventName={event.name} coverPhotoUrl={event.cover_photo_path ? getPhotoUrl(event.cover_photo_path) : undefined} />} />
      <Route 
        path="enter-name" 
        element={
          checkParticipant() ? 
            <Navigate to="../camera" replace /> : 
            <NameEntry onNameSubmit={handleNameSubmit} />
        } 
      />
      <Route 
        path="camera" 
        element={
          checkParticipant() ? 
            <Camera shotsLeft={shotsLeft} onCapture={handleCapture} filterId={event.enabled_filters[0]} /> : 
            <Navigate to="../enter-name" replace />
        } 
      />
      <Route 
        path="gallery" 
        element={
          checkParticipant() && eventToken ? 
            <PhotoGallery eventToken={eventToken} onPhotoDeleted={handlePhotoDeleted} /> : 
            <Navigate to="../enter-name" replace />
        } 
      />
      <Route path="developing" element={<Developing />} />
      <Route 
        path="uploading" 
        element={<Uploading onUploadComplete={handleUploadComplete} />} 
      />
      <Route path="complete" element={<Complete shotsLeft={shotsLeft} />} />
      <Route path="message" element={<Message />} />
    </Routes>
  );
}

// Protected route for host pages
function ProtectedHostRoute({ children }: { children: React.ReactNode }) {
  if (!isHostLoggedIn()) {
    return <Navigate to="/host/login" replace />;
  }
  return <>{children}</>;
}

function App() {
  const [serviceWorkerStatus, setServiceWorkerStatus] = useState<'checking' | 'active' | 'ready' | 'unsupported'>('checking');

  // Run migration on app startup to fix photos with invalid UUIDs
  useEffect(() => {
    migrateInvalidPhotoUUIDs().catch(error => {
      console.error('[App] Photo UUID migration failed:', error);
    });
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setServiceWorkerStatus('unsupported');
      return;
    }

    const updateStatus = () => {
      setServiceWorkerStatus(navigator.serviceWorker.controller ? 'active' : 'ready');
    };
    const handleControllerChange = () => {
      setServiceWorkerStatus('active');
      const reloadKey = 'luma-service-worker-reloaded';
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, 'true');
        window.location.reload();
      }
    };
    navigator.serviceWorker.ready.then(updateStatus).catch(() => setServiceWorkerStatus('unsupported'));
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    updateStatus();

    return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
  }, []);

  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!isIOS) return;

    const preventPageZoom: globalThis.EventListener = (event) => event.preventDefault();
    document.addEventListener('gesturestart', preventPageZoom, { passive: false });

    return () => document.removeEventListener('gesturestart', preventPageZoom);
  }, []);

  return (
    <Router>
      <div className="app">
        {isLocalMode() && (
          <div className="local-mode-indicator">LOCAL · CACHE {serviceWorkerStatus.toUpperCase()}</div>
        )}
        
        <Routes>
          <Route path="/e/:eventToken/*" element={<EventRoute />} />
          <Route path="/host/login" element={<HostLogin />} />
          <Route path="/host" element={
            <ProtectedHostRoute>
              <HostEventsList />
            </ProtectedHostRoute>
          } />
          <Route path="/host/create" element={
            <ProtectedHostRoute>
              <EventCreation />
            </ProtectedHostRoute>
          } />
          <Route path="/host/dashboard/:eventId" element={
            <ProtectedHostRoute>
              <ErrorBoundary>
                <HostDashboard />
              </ErrorBoundary>
            </ProtectedHostRoute>
          } />
          <Route path="/" element={<Navigate to="/host/login" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
