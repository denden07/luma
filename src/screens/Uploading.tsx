import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Uploading.css';

interface UploadingProps {
  photoBlob?: Blob | null;
  onUploadComplete?: () => void;
}

const Uploading: React.FC<UploadingProps> = ({ onUploadComplete }) => {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    simulateUpload();
  }, []);

  const simulateUpload = async () => {
    // Simulate upload progress
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 10;
      });
    }, 200);

    // Simulate upload completion
    setTimeout(() => {
      clearInterval(interval);
      setProgress(100);
      
      if (onUploadComplete) {
        onUploadComplete();
      }
      
      setTimeout(() => {
        navigate('../complete');
      }, 500);
    }, 2500);
  };

  const retryUpload = () => {
    setError(false);
    setProgress(0);
    simulateUpload();
  };

  if (error) {
    return (
      <div className="uploading-screen error">
        <div className="uploading-content">
          <h2 className="error-title">Couldn't save that shot.</h2>
          <p className="error-message">Please check your connection and try again.</p>
          <button className="primary-button" onClick={retryUpload}>
            TRY AGAIN
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="uploading-screen">
      <div className="uploading-content">
        <div className="polaroid-stack">
          <div className="polaroid polaroid-1"></div>
          <div className="polaroid polaroid-2"></div>
          <div className="polaroid polaroid-3"></div>
        </div>

        <div className="upload-icon">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>

        <h2 className="uploading-title handwritten">uploading to<br />the album...</h2>

        <div className="upload-progress">
          <div className="upload-progress-bar" style={{ width: `${progress}%` }}></div>
        </div>

        <p className="upload-percentage">{progress}%</p>
      </div>
    </div>
  );
};

export default Uploading;
