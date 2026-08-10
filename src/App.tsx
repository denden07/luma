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
import { getParticipant, createParticipant, updatePhotosRemaining } from './utils/participant';
import { isLocalMode } from './utils/env';
import './App.css';

function EventRoute() {
  const { eventToken } = useParams<{ eventToken: string }>();
  const [shotsLeft, setShotsLeft] = useState<number>(10);

  useEffect(() => {
    if (eventToken) {
      // Check for existing participant
      const existingParticipant = getParticipant(eventToken);
      if (existingParticipant) {
        setShotsLeft(existingParticipant.photosRemaining);
      }
    }
  }, [eventToken]);

  const handleNameSubmit = (name: string) => {
    if (eventToken) {
      const participant = createParticipant(eventToken, name, 10);
      setShotsLeft(participant.photosRemaining);
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

  return (
    <Routes>
      <Route path="/" element={<Landing eventName="NINA & ALDRIN'S WEDDING" />} />
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
            <Camera shotsLeft={shotsLeft} onCapture={handleCapture} /> : 
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
