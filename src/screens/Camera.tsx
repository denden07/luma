import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Camera.css';

interface CameraProps {
  shotsLeft: number;
  onCapture: (blob: Blob) => void;
}

const Camera: React.FC<CameraProps> = ({ shotsLeft, onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [facingMode]);

  const startCamera = async () => {
    try {
      setPermissionDenied(false);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode },
        audio: false,
      });
      
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Camera access error:', error);
      setPermissionDenied(true);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Apply flash effect
    if (flashEnabled) {
      const flashDiv = document.querySelector('.flash-effect') as HTMLElement;
      if (flashDiv) {
        flashDiv.style.opacity = '1';
        setTimeout(() => {
          flashDiv.style.opacity = '0';
        }, 100);
      }
    }

    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        onCapture(blob);
        navigate('/developing');
      }
    }, 'image/jpeg', 0.9);
  };

  if (permissionDenied) {
    return (
      <div className="camera-error">
        <h2>Camera Permission Needed</h2>
        <p>Please allow camera access to take photos</p>
        <button className="primary-button" onClick={startCamera}>
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="camera-screen">
      <div className="flash-effect"></div>
      
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        className="camera-preview"
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className="camera-overlay">
        <div className="camera-header">
          <div className="shots-counter">
            <span className="shots-label">shots left</span>
            <span className="shots-number handwritten">{shotsLeft}</span>
          </div>

          <button 
            className="camera-control flash-toggle"
            onClick={() => setFlashEnabled(!flashEnabled)}
            aria-label="Toggle flash"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill={flashEnabled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>
            </svg>
          </button>
        </div>

        <div className="camera-footer">
          <button 
            className="camera-control switch-camera"
            onClick={switchCamera}
            aria-label="Switch camera"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 9V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
              <path d="M7 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2"/>
              <circle cx="14" cy="15" r="3"/>
              <polyline points="14 9 14 6"/>
              <polyline points="10 15 7 15"/>
            </svg>
          </button>

          <button 
            className="capture-button"
            onClick={capturePhoto}
            disabled={shotsLeft <= 0}
            aria-label="Capture photo"
          >
            <div className="capture-button-inner"></div>
          </button>

          <div className="camera-control-spacer"></div>
        </div>
      </div>
    </div>
  );
};

export default Camera;
