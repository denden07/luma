import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Complete.css';

interface CompleteProps {
  shotsLeft: number;
  onTakeAnother?: () => void;
}

const Complete: React.FC<CompleteProps> = ({ shotsLeft, onTakeAnother }) => {
  const navigate = useNavigate();

  const handleTakeAnother = () => {
    if (onTakeAnother) {
      onTakeAnother();
    }
    navigate('../camera');
  };

  const handleDone = () => {
    navigate('../message');
  };

  return (
    <div className="complete-screen">
      <div className="complete-content">
        <div className="camera-photo-icon">
          <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
            <rect x="20" y="30" width="60" height="45" rx="6" stroke="currentColor" strokeWidth="2.5"/>
            <circle cx="50" cy="52" r="15" stroke="currentColor" strokeWidth="2.5"/>
            <circle cx="50" cy="52" r="10" fill="currentColor"/>
            <rect x="40" y="23" width="20" height="7" rx="3" fill="currentColor"/>
            <circle cx="67" cy="38" r="3" fill="currentColor"/>
            
            {/* Photo polaroids */}
            <g transform="translate(55, 35) rotate(15)">
              <rect width="25" height="30" fill="white" stroke="currentColor" strokeWidth="1.5"/>
              <rect y="0" width="25" height="21" fill="var(--color-warm-gray)"/>
            </g>
            <g transform="translate(65, 40) rotate(-10)">
              <rect width="22" height="27" fill="white" stroke="currentColor" strokeWidth="1.5"/>
              <rect y="0" width="22" height="19" fill="var(--color-warm-gray)"/>
            </g>
          </svg>
        </div>

        <h1 className="complete-title handwritten">thank you!</h1>

        <p className="complete-message">
          your photo is in the album
        </p>

        {shotsLeft > 0 ? (
          <>
            <p className="shots-remaining">
              you have <span className="handwritten highlight">{shotsLeft}</span> shots left
            </p>

            <div className="complete-actions">
              <button className="primary-button" onClick={handleTakeAnother}>
                TAKE ANOTHER PHOTO
              </button>
              
              <button className="secondary-button" onClick={handleDone}>
                I'M DONE
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="all-done-message handwritten">
              all set!
            </p>
            
            <p className="all-done-subtitle">
              keep capturing the<br />
              beautiful moments
            </p>

            <button className="secondary-button" onClick={handleDone}>
              LEAVE A MESSAGE
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default Complete;
