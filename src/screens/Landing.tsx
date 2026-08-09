import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Landing.css';

interface LandingProps {
  eventName?: string;
}

const Landing: React.FC<LandingProps> = ({ eventName = "NINA & ALDRIN'S WEDDING" }) => {
  const navigate = useNavigate();

  const handleStart = () => {
    navigate('./enter-name');
  };

  return (
    <div className="landing-screen">
      <div className="landing-content">
        <div className="camera-icon">
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
            <rect x="15" y="25" width="50" height="35" rx="4" stroke="currentColor" strokeWidth="2"/>
            <circle cx="40" cy="42" r="12" stroke="currentColor" strokeWidth="2"/>
            <circle cx="40" cy="42" r="8" fill="currentColor"/>
            <rect x="35" y="20" width="10" height="5" rx="2" fill="currentColor"/>
            <circle cx="55" cy="32" r="2" fill="currentColor"/>
            {/* Decorative lines */}
            <path d="M 25 20 L 20 15 M 55 20 L 60 15" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
        </div>

        <h1 className="landing-title handwritten">you're in!</h1>

        <p className="landing-subtitle">
          you're now part of
        </p>

        <p className="event-name editorial">{eventName}</p>

        <p className="landing-description">
          take photos and help us<br />
          capture this day
        </p>

        <button className="primary-button" onClick={handleStart}>
          LET'S TAKE PHOTOS →
        </button>
      </div>
    </div>
  );
};

export default Landing;
