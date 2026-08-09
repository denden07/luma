import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Landing from './screens/Landing';
import NameEntry from './screens/NameEntry';
import Camera from './screens/Camera';
import Developing from './screens/Developing';
import Uploading from './screens/Uploading';
import Complete from './screens/Complete';
import Message from './screens/Message';
import { getParticipant, createParticipant, updatePhotosRemaining } from './utils/participant';
import { isLocalMode } from './utils/env';
import './App.css';

function EventRoute() {
  const { eventToken } = useParams<{ eventToken: string }>();
  const [shotsLeft, setShotsLeft] = useState<number>(10);
  const [hasJoinedEvent, setHasJoinedEvent] = useState(false);

  useEffect(() => {
    if (eventToken) {
      // Check for existing participant
      const existingParticipant = getParticipant(eventToken);
      if (existingParticipant) {
        setShotsLeft(existingParticipant.photosRemaining);
        setHasJoinedEvent(true);
      }
    }
  }, [eventToken]);

  const handleNameSubmit = (name: string) => {
    if (eventToken) {
      const participant = createParticipant(eventToken, name, 10);
      setShotsLeft(participant.photosRemaining);
      setHasJoinedEvent(true);
    }
  };

  const handleCapture = (blob: Blob) => {
    // Photo captured - will be uploaded in the uploading screen
    console.log('Photo captured:', blob.size, 'bytes');
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

  return (
    <Routes>
      <Route path="/" element={<Landing eventName="NINA & ALDRIN'S WEDDING" />} />
      <Route 
        path="/enter-name" 
        element={
          hasJoinedEvent ? 
            <Navigate to="/camera" replace /> : 
            <NameEntry onNameSubmit={handleNameSubmit} />
        } 
      />
      <Route 
        path="/camera" 
        element={
          hasJoinedEvent ? 
            <Camera shotsLeft={shotsLeft} onCapture={handleCapture} /> : 
            <Navigate to="/enter-name" replace />
        } 
      />
      <Route path="/developing" element={<Developing />} />
      <Route 
        path="/uploading" 
        element={<Uploading onUploadComplete={handleUploadComplete} />} 
      />
      <Route path="/complete" element={<Complete shotsLeft={shotsLeft} />} />
      <Route path="/message" element={<Message />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <div className="app">
        {isLocalMode() && (
          <div className="local-mode-indicator">LOCAL</div>
        )}
        
        <Routes>
          <Route path="/e/:eventToken/*" element={<EventRoute />} />
          <Route path="/" element={<Navigate to="/e/demo" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
