import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Developing.css';

interface DevelopingProps {
  onComplete?: () => void;
}

const Developing: React.FC<DevelopingProps> = ({ onComplete }) => {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (onComplete) {
        onComplete();
      }
      navigate('/uploading');
    }, 2000);

    return () => clearTimeout(timer);
  }, [navigate, onComplete]);

  return (
    <div className="developing-screen">
      <div className="developing-content">
        <div className="film-icon">
          <svg width="120" height="160" viewBox="0 0 120 160" fill="none">
            <rect x="20" y="20" width="80" height="120" fill="var(--color-film-yellow)" rx="4"/>
            <rect x="30" y="30" width="60" height="80" fill="var(--color-charcoal)"/>
            <text x="60" y="130" textAnchor="middle" fill="var(--color-charcoal)" fontSize="24" fontWeight="bold">202</text>
            {/* Film perforations */}
            <rect x="10" y="30" width="8" height="10" fill="var(--color-film-yellow)"/>
            <rect x="10" y="50" width="8" height="10" fill="var(--color-film-yellow)"/>
            <rect x="10" y="70" width="8" height="10" fill="var(--color-film-yellow)"/>
            <rect x="10" y="90" width="8" height="10" fill="var(--color-film-yellow)"/>
            <rect x="102" y="30" width="8" height="10" fill="var(--color-film-yellow)"/>
            <rect x="102" y="50" width="8" height="10" fill="var(--color-film-yellow)"/>
            <rect x="102" y="70" width="8" height="10" fill="var(--color-film-yellow)"/>
            <rect x="102" y="90" width="8" height="10" fill="var(--color-film-yellow)"/>
          </svg>
        </div>

        <h2 className="developing-title handwritten">developing your photo...</h2>
        
        <p className="developing-subtitle">
          please don't close this page
        </p>

        <div className="progress-indicator">
          <div className="progress-bar"></div>
        </div>
      </div>
    </div>
  );
};

export default Developing;
