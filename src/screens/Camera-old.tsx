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
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'checking'>('checking');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const navigate = useNavigate();
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isHTTPS = window.location.protocol === 'https:';
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  useEffect(() => {
    checkPermissionAndStartCamera();
    return () => {
      stopCamera();
    };
  }, [facingMode]);

  const checkPermissionAndStartCamera = async () => {
    try {
      // Check HTTPS requirement for iOS
      if (isIOS && !isHTTPS && !isLocalhost) {
        setPermissionState('denied');
        setErrorMessage('iOS requires HTTPS for camera access. Please use localhost or HTTPS.');
        return;
      }

      // For iOS, skip Permissions API and go straight to getUserMedia
      // because iOS Safari doesn't support permissions.query for camera
      if (!isIOS && navigator.permissions && navigator.permissions.query) {
        try {
          const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
          console.log('Camera permission status:', permissionStatus.state);
          
          if (permissionStatus.state === 'denied') {
            setPermissionState('denied');
            setErrorMessage('Camera permission was denied.');
            return;
          }
        } catch (e) {
          console.log('Permissions API not available, will try getUserMedia directly');
        }
      }

      // Try to get camera access (this will prompt if needed)
      setPermissionState('prompt');
      console.log('Requesting camera with facingMode:', facingMode);
      
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: facingMode
        },
        audio: false,
      });
      
      console.log('Camera access granted');
      setPermissionState('granted');
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error: any) {
      console.error('Camera access error:', error);
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      
      // Check the specific error type
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermissionState('denied');
        setErrorMessage('Camera permission was denied. Please allow camera access.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setPermissionState('denied');
        setErrorMessage('No camera found on this device.');
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        setPermissionState('denied');
        setErrorMessage('Camera is already in use by another application.');
      } else if (error.name === 'OverconstrainedError') {
        setPermissionState('denied');
        setErrorMessage('Camera constraints not supported. Try switching camera.');
      } else if (error.name === 'NotSupportedError') {
        setPermissionState('denied');
        setErrorMessage('Camera not supported on this browser.');
      } else {
        setPermissionState('denied');
        setErrorMessage(`Camera error: ${error.message || 'Unknown error'}`);
      }
    }
  };

  const startCamera = async () => {
    await checkPermissionAndStartCamera();
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
        navigate('../developing');
      }
    }, 'image/jpeg', 0.9);
  };

  // Show loading while checking permission
  if (permissionState === 'checking' || permissionState === 'prompt') {
    return (
      <div className="camera-loading">
        <h2>Starting Camera...</h2>
        <p>Please allow camera access when prompted</p>
      </div>
    );
  }

  // Show error only if explicitly denied
  if (permissionState === 'denied') {
    // Check if this is an HTTPS issue on iOS
    const isHTTPSError = isIOS && !isHTTPS && !isLocalhost;
    
    return (
      <div className="camera-error">
        <h2>Camera Access Issue</h2>
        
        {isHTTPSError ? (
          <>
            <p style={{ marginBottom: '20px' }}><strong>iOS requires HTTPS for camera access</strong></p>
            <p>You're accessing via HTTP on iOS. To fix this:</p>
            <ol style={{ textAlign: 'left', padding: '0 20px', maxWidth: '500px', margin: '20px auto' }}>
              <li>On your computer, access the site at <code>https://localhost:5173</code> (if running locally)</li>
              <li>Or set up a local HTTPS proxy (like ngrok or localtunnel)</li>
              <li>Or test on your computer's Chrome browser first</li>
            </ol>
            <div style={{ background: 'rgba(255,255,255,0.1)', padding: '15px', borderRadius: '8px', marginTop: '20px', fontSize: '14px' }}>
              <strong>Current URL:</strong><br/>
              {window.location.href}
            </div>
          </>
        ) : isIOS ? (
          <>
            <p>{errorMessage || 'Camera permission needed'}</p>
            <p style={{ fontSize: '14px', marginTop: '10px' }}>To enable camera access on iPhone:</p>
            <ol style={{ textAlign: 'left', padding: '0 20px', maxWidth: '400px', margin: '20px auto', fontSize: '14px' }}>
              <li>Open <strong>Settings</strong></li>
              <li>Scroll down to <strong>Safari</strong></li>
              <li>Tap <strong>Camera</strong></li>
              <li>Select <strong>Allow</strong></li>
              <li>Return here and tap Refresh</li>
            </ol>
            <button className="primary-button" onClick={() => window.location.reload()}>
              Refresh Page
            </button>
          </>
        ) : (
          <>
            <p>{errorMessage || 'Please allow camera access to take photos'}</p>
            <button className="primary-button" onClick={startCamera}>
              Try Again
            </button>
          </>
        )}
        
        <div style={{ marginTop: '20px', fontSize: '12px', opacity: 0.7 }}>
          Debug: {navigator.userAgent.includes('iPhone') ? 'iPhone' : navigator.userAgent.includes('iPad') ? 'iPad' : 'Other'} | 
          {isHTTPS ? ' HTTPS' : ' HTTP'} | 
          {isLocalhost ? ' localhost' : ' remote'}
        </div>
        
        <button 
          className="secondary-button" 
          onClick={() => navigate('../enter-name')}
          style={{ marginTop: '20px' }}
        >
          Go Back
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
