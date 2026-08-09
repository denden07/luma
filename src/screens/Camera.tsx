import React, { useRef, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { savePhoto, getEventPhotos } from '../utils/photoStorage';
import { getParticipant } from '../utils/participant';
import './Camera.css';

interface CameraProps {
  shotsLeft: number;
  onCapture: (blob: Blob) => void;
}

// Device and browser detection
const getUserAgent = () => {
  const ua = navigator.userAgent;
  return {
    isIOS: /iPad|iPhone|iPod/.test(ua),
    isAndroid: /Android/.test(ua),
    isSafari: /^((?!chrome|android).)*safari/i.test(ua),
    isChrome: /Chrome/.test(ua) && /Google Inc/.test(navigator.vendor),
    isFirefox: /Firefox/.test(ua),
  };
};

const Camera: React.FC<CameraProps> = ({ shotsLeft, onCapture }) => {
  const { eventToken } = useParams<{ eventToken: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [zoom, setZoom] = useState<number>(1);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'checking'>('checking');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [photoCount, setPhotoCount] = useState(0);
  const [latestPhotoUrl, setLatestPhotoUrl] = useState<string | null>(null);
  const navigate = useNavigate();
  
  const device = getUserAgent();
  const isHTTPS = window.location.protocol === 'https:';
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  useEffect(() => {
    checkPermissionAndStartCamera();
    updatePhotoCount();
    
    return () => {
      stopCamera();
    };
  }, [facingMode]); // Only restart camera when facing mode changes

  const updatePhotoCount = () => {
    if (eventToken) {
      const photos = getEventPhotos(eventToken);
      setPhotoCount(photos.length);
      // Get latest photo for preview
      if (photos.length > 0) {
        setLatestPhotoUrl(photos[photos.length - 1].dataUrl);
      }
    }
  };

  const checkPermissionAndStartCamera = async () => {
    try {
      // Check HTTPS requirement for iOS
      if (device.isIOS && !isHTTPS && !isLocalhost) {
        setPermissionState('denied');
        setErrorMessage('iOS requires HTTPS for camera access.');
        return;
      }

      // Check HTTPS requirement for Android Chrome
      if (device.isAndroid && device.isChrome && !isHTTPS && !isLocalhost) {
        setPermissionState('denied');
        setErrorMessage('Chrome on Android requires HTTPS for camera access.');
        return;
      }

      // For mobile devices, skip Permissions API and go straight to getUserMedia
      if (!device.isIOS && !device.isAndroid && navigator.permissions && navigator.permissions.query) {
        try {
          const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
          console.log('Camera permission status:', permissionStatus.state);
          
          if (permissionStatus.state === 'denied') {
            setPermissionState('denied');
            setErrorMessage('Camera permission was denied.');
            return;
          }
        } catch (e) {
          console.log('Permissions API not available');
        }
      }

      // Stop existing stream before requesting new one
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }

      // Request camera access
      setPermissionState('prompt');
      console.log('Requesting camera with facingMode:', facingMode, 'zoom:', zoom);
      
      const constraints: MediaStreamConstraints = {
        video: { 
          facingMode: facingMode,
        },
        audio: false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Apply zoom if supported (after getting the stream)
      if (zoom !== 1 && mediaStream.getVideoTracks().length > 0) {
        const track = mediaStream.getVideoTracks()[0];
        const capabilities = track.getCapabilities() as any;
        
        if (capabilities.zoom) {
          try {
            await track.applyConstraints({
              // @ts-ignore
              advanced: [{ zoom: zoom }]
            });
            console.log('Zoom applied:', zoom);
          } catch (e) {
            console.log('Zoom not supported on this camera:', e);
          }
        }
      }
      
      // Apply torch (flash) if enabled and supported
      if (flashEnabled && mediaStream.getVideoTracks().length > 0) {
        const track = mediaStream.getVideoTracks()[0];
        const capabilities = track.getCapabilities() as any;
        
        if (capabilities.torch) {
          try {
            await track.applyConstraints({
              // @ts-ignore - torch is not in TypeScript types yet
              advanced: [{ torch: true }]
            });
          } catch (e) {
            console.log('Torch not supported on this camera');
          }
        }
      }
      
      console.log('Camera access granted');
      setPermissionState('granted');
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error: any) {
      console.error('Camera access error:', error);
      
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
        setErrorMessage('Camera constraints not supported. Try a different zoom level.');
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
      setStream(null);
    }
  };

  const switchCamera = async () => {
    // Stop current stream and wait a moment for cleanup
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
      });
      setStream(null);
    }
    
    // Small delay to ensure cleanup completes on mobile devices
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Change facing mode - useEffect will detect this and restart camera
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);
  };

  const toggleFlash = async () => {
    setFlashEnabled(!flashEnabled);
    
    // Apply flash to current stream
    if (stream && stream.getVideoTracks().length > 0) {
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities() as any;
      
      if (capabilities.torch) {
        try {
          await track.applyConstraints({
            // @ts-ignore - torch is not in TypeScript types yet
            advanced: [{ torch: !flashEnabled }]
          });
        } catch (e) {
          console.log('Could not toggle torch');
        }
      }
    }
  };

  const changeZoom = async (newZoom: number) => {
    setZoom(newZoom);
    
    // Apply zoom to current stream without restarting camera
    if (stream && stream.getVideoTracks().length > 0) {
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities() as any;
      
      if (capabilities.zoom) {
        try {
          const minZoom = capabilities.zoom.min || 1;
          const maxZoom = capabilities.zoom.max || 1;
          
          // Clamp zoom to supported range
          const clampedZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
          
          await track.applyConstraints({
            // @ts-ignore
            advanced: [{ zoom: clampedZoom }]
          });
          console.log('Zoom applied:', clampedZoom);
        } catch (e) {
          console.log('Could not apply zoom:', e);
        }
      } else {
        console.log('Zoom not supported on this camera');
      }
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !eventToken) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Apply flash effect (visual only)
    const flashDiv = document.querySelector('.flash-effect') as HTMLElement;
    if (flashDiv) {
      flashDiv.style.opacity = '1';
      setTimeout(() => {
        flashDiv.style.opacity = '0';
      }, 150);
    }

    ctx.drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
      if (blob) {
        // Save photo locally instead of uploading
        const participant = getParticipant(eventToken);
        const participantName = participant?.name || 'Unknown';
        
        try {
          await savePhoto(eventToken, participantName, blob);
          updatePhotoCount();
          
          // Still call onCapture for backward compatibility (but won't upload)
          onCapture(blob);
          
          // Show success feedback
          console.log('Photo saved locally!');
        } catch (error) {
          console.error('Failed to save photo:', error);
          alert('Failed to save photo. Storage may be full.');
        }
      }
    }, 'image/jpeg', 0.92);
  };

  const handleExit = () => {
    stopCamera();
    navigate('../');
  };

  const openGallery = () => {
    navigate('../gallery');
  };

  // Show loading while checking permission
  if (permissionState === 'checking' || permissionState === 'prompt') {
    return (
      <div className="camera-loading">
        <h2>Starting Camera...</h2>
        <p>Please allow camera access when prompted</p>
        <div className="device-info">
          {device.isIOS && 'iOS Safari'}
          {device.isAndroid && device.isChrome && 'Android Chrome'}
          {device.isAndroid && device.isFirefox && 'Android Firefox'}
          {device.isAndroid && !device.isChrome && !device.isFirefox && 'Android Browser'}
        </div>
      </div>
    );
  }

  // Show error only if explicitly denied
  if (permissionState === 'denied') {
    const isHTTPSError = (device.isIOS || (device.isAndroid && device.isChrome)) && !isHTTPS && !isLocalhost;
    
    return (
      <div className="camera-error">
        <h2>Camera Access Issue</h2>
        
        {isHTTPSError ? (
          <>
            <p style={{ marginBottom: '20px' }}>
              <strong>{device.isIOS ? 'iOS' : 'Android Chrome'} requires HTTPS for camera access</strong>
            </p>
            <p>Current connection is not secure. Options:</p>
            <ol style={{ textAlign: 'left', padding: '0 20px', maxWidth: '500px', margin: '20px auto' }}>
              <li>Use HTTPS (recommended for production)</li>
              <li>Test on desktop Chrome first (works with HTTP)</li>
              <li>Use ngrok for temporary HTTPS tunnel</li>
            </ol>
          </>
        ) : device.isIOS ? (
          <>
            <p>{errorMessage}</p>
            <p style={{ fontSize: '14px', marginTop: '10px' }}>To enable camera on iPhone:</p>
            <ol style={{ textAlign: 'left', padding: '0 20px', maxWidth: '400px', margin: '20px auto', fontSize: '14px' }}>
              <li>Open <strong>Settings</strong></li>
              <li>Scroll to <strong>Safari</strong></li>
              <li>Tap <strong>Camera</strong></li>
              <li>Select <strong>Allow</strong></li>
              <li>Return and tap Refresh</li>
            </ol>
            <button className="primary-button" onClick={() => window.location.reload()}>
              Refresh Page
            </button>
          </>
        ) : device.isAndroid ? (
          <>
            <p>{errorMessage}</p>
            <p style={{ fontSize: '14px', marginTop: '10px' }}>To enable camera on Android:</p>
            <ol style={{ textAlign: 'left', padding: '0 20px', maxWidth: '400px', margin: '20px auto', fontSize: '14px' }}>
              <li>Tap the <strong>lock icon</strong> in address bar</li>
              <li>Tap <strong>Permissions</strong></li>
              <li>Set <strong>Camera</strong> to <strong>Allow</strong></li>
              <li>Refresh the page</li>
            </ol>
            <button className="primary-button" onClick={() => window.location.reload()}>
              Refresh Page
            </button>
          </>
        ) : (
          <>
            <p>{errorMessage}</p>
            <button className="primary-button" onClick={startCamera}>
              Try Again
            </button>
          </>
        )}
        
        <button 
          className="secondary-button" 
          onClick={handleExit}
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
        muted
        className="camera-preview"
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className="camera-overlay">
        <div className="camera-header">
          <button 
            className="camera-control exit-button"
            onClick={handleExit}
            aria-label="Exit camera"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>

          <div className="shots-counter">
            <span className="shots-label">shots left</span>
            <span className="shots-number handwritten">{shotsLeft}</span>
          </div>

          <button 
            className="camera-control flash-toggle"
            onClick={toggleFlash}
            aria-label="Toggle flash"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill={flashEnabled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>
            </svg>
          </button>
        </div>

        <div className="camera-footer">
          {/* Zoom Controls */}
          <div className="zoom-controls">
            <button 
              className={`zoom-button ${zoom === 0.5 ? 'active' : ''}`}
              onClick={() => changeZoom(0.5)}
            >
              0.5x
            </button>
            <button 
              className={`zoom-button ${zoom === 1 ? 'active' : ''}`}
              onClick={() => changeZoom(1)}
            >
              1x
            </button>
            <button 
              className={`zoom-button ${zoom === 2 ? 'active' : ''}`}
              onClick={() => changeZoom(2)}
            >
              2x
            </button>
          </div>

          <div className="camera-controls-row">
          <button 
            className="camera-control switch-camera"
            onClick={switchCamera}
            aria-label="Switch camera"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 9V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
              <path d="M7 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2"/>
              <circle cx="14" cy="15" r="3"/>
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

          <button 
            className="camera-control gallery-button"
            onClick={openGallery}
            aria-label="View gallery"
          >
            {latestPhotoUrl ? (
              <>
                <img src={latestPhotoUrl} alt="Latest" className="gallery-preview" />
                {photoCount > 0 && (
                  <span className="gallery-badge">{photoCount}</span>
                )}
              </>
            ) : (
              <>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                {photoCount > 0 && (
                  <span className="gallery-badge">{photoCount}</span>
                )}
              </>
            )}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Camera;
