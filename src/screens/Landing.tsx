import React from 'react';
import { useNavigate } from 'react-router-dom';
import cameraIconSvg from '../assets/images/pwa_camera_assets/youre_in_camera.svg';
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
          <img src={cameraIconSvg} alt="Camera" width="120" height="120" />
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
