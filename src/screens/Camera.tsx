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
  const streamRef = useRef<MediaStream | null>(null);
  const isInitialLoad = useRef(true);
  const [zoom, setZoom] = useState<number>(1);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'checking'>('checking');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [photoCount, setPhotoCount] = useState(0);
  const [latestPhotoUrl, setLatestPhotoUrl] = useState<string | null>(null);
  const [streamVersion, setStreamVersion] = useState(0);
  const navigate = useNavigate();
  
  const device = getUserAgent();
  const isHTTPS = window.location.protocol === 'https:';
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  useEffect(() => {
    startCamera();
    updatePhotoCount();
    
    return () => {
      stopCamera();
    };
  }, []); // Only run on mount, do not restart on facingMode change

  // Attach stream to video element after React renders
  useEffect(() => {
    if (permissionState === 'granted' && streamRef.current) {
      console.log('[useEffect] Stream version changed:', streamVersion);
      console.log('[useEffect] Waiting for video element to be ready...');
      
      // Use requestAnimationFrame to ensure React has rendered the video element
      requestAnimationFrame(() => {
        if (videoRef.current && streamRef.current) {
          console.log('[useEffect] Attaching stream to video element');
          videoRef.current.srcObject = streamRef.current;
          
          videoRef.current.play().then(() => {
            console.log('[useEffect] ✅ Video playing successfully');
          }).catch(error => {
            console.error('[useEffect] ❌ Video play failed:', error);
          });
        } else {
          console.error('[useEffect] ❌ videoRef or streamRef is null after RAF');
        }
      });
    }
  }, [permissionState, streamVersion]);

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

  const stopCamera = () => {
    console.log('[stopCamera] Stopping camera...');
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      console.log('[stopCamera] Stopping', tracks.length, 'track(s)');
      tracks.forEach(track => {
        console.log('[stopCamera] Stopping track:', track.label, 'state:', track.readyState);
        track.stop();
      });
      streamRef.current = null;
      console.log('[stopCamera] Stream ref cleared');
    } else {
      console.log('[stopCamera] No active stream to stop');
    }
  };

  const startCamera = async (deviceId?: string) => {
    console.log('[startCamera] Called with deviceId:', deviceId || 'none (using facingMode)');
    console.log('[startCamera] Device info:', device);
    console.log('[startCamera] isHTTPS:', isHTTPS, 'isLocalhost:', isLocalhost);
    
    try {
      // Check HTTPS requirement for iOS
      if (device.isIOS && !isHTTPS && !isLocalhost) {
        console.error('[startCamera] iOS requires HTTPS');
        setPermissionState('denied');
        setErrorMessage('iOS requires HTTPS for camera access.');
        return;
      }

      // Check HTTPS requirement for Android Chrome
      if (device.isAndroid && device.isChrome && !isHTTPS && !isLocalhost) {
        console.error('[startCamera] Android Chrome requires HTTPS');
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
      stopCamera();

      // Only set permission state to 'prompt' on initial load
      // During camera switching, keep the video element mounted
      if (isInitialLoad.current) {
        console.log('[startCamera] Setting permission state to prompt (initial load)');
        setPermissionState('prompt');
      } else {
        console.log('[startCamera] Keeping permission state as granted (camera switching)');
      }
      
      let constraints: MediaStreamConstraints;
      
      if (deviceId) {
        // Use specific device ID when switching cameras
        console.log('[startCamera] Building constraints with deviceId:', deviceId);
        constraints = {
          video: { 
            deviceId: { exact: deviceId }
          },
          audio: false,
        };
      } else {
        // Use facingMode preference for initial load
        console.log('[startCamera] Building constraints with facingMode: environment');
        constraints = {
          video: { 
            facingMode: { ideal: 'environment' }
          },
          audio: false,
        };
      }

      console.log('[startCamera] Calling getUserMedia with constraints:', JSON.stringify(constraints));
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[startCamera] getUserMedia succeeded');
      
      const track = mediaStream.getVideoTracks()[0];
      console.log('[startCamera] ✅ Camera access granted');
      console.log('[startCamera] Track label:', track?.label);
      console.log('[startCamera] Track settings:', track?.getSettings());
      console.log('[startCamera] Track capabilities:', track?.getCapabilities());
      console.log('[startCamera] Track readyState:', track?.readyState);
      
      // Store stream in ref
      streamRef.current = mediaStream;
      console.log('[startCamera] Stream stored in ref');
      
      // Mark initial load as complete
      isInitialLoad.current = false;
      
      // Increment stream version to trigger useEffect
      setStreamVersion(prev => prev + 1);
      console.log('[startCamera] Stream version incremented to trigger attachment');
      
      // Apply zoom if not default (after getting the stream)
      if (zoom !== 1 && mediaStream.getVideoTracks().length > 0) {
        console.log('[startCamera] Applying zoom:', zoom);
        const track = mediaStream.getVideoTracks()[0];
        const capabilities = track.getCapabilities() as any;
        
        if (capabilities.zoom) {
          try {
            const minZoom = capabilities.zoom.min || 1;
            const maxZoom = capabilities.zoom.max || 1;
            const clampedZoom = Math.max(minZoom, Math.min(maxZoom, zoom));
            
            await track.applyConstraints({
              // @ts-ignore
              advanced: [{ zoom: clampedZoom }]
            });
            console.log('[startCamera] ✅ Zoom applied:', clampedZoom);
          } catch (e) {
            console.log('[startCamera] ❌ Zoom not supported on this camera:', e);
          }
        } else {
          console.log('[startCamera] Zoom not available in capabilities');
        }
      }
      
      // Apply torch (flash) if enabled and supported
      if (flashEnabled && mediaStream.getVideoTracks().length > 0) {
        console.log('[startCamera] Applying torch (flash enabled)');
        const track = mediaStream.getVideoTracks()[0];
        const capabilities = track.getCapabilities() as any;
        
        if (capabilities.torch) {
          try {
            await track.applyConstraints({
              // @ts-ignore - torch is not in TypeScript types yet
              advanced: [{ torch: true }]
            });
            console.log('[startCamera] ✅ Torch applied');
          } catch (e) {
            console.log('[startCamera] ❌ Torch not supported on this camera:', e);
            setFlashEnabled(false); // Disable flash if not supported
          }
        } else {
          console.log('[startCamera] Torch not available on this camera');
          setFlashEnabled(false); // Disable flash if not supported
        }
      }
      
      // Set permission state to granted (after streamVersion is set)
      // This will trigger the useEffect that attaches the stream to the video element
      console.log('[startCamera] Setting permission state to granted');
      setPermissionState('granted');
      console.log('[startCamera] ✅ Camera started successfully (stream will be attached by useEffect after React renders)');  
    } catch (error: any) {
      console.error('[startCamera] ❌❌❌ Camera access error:', error);
      console.error('[startCamera] Error name:', error.name);
      console.error('[startCamera] Error message:', error.message);
      console.error('[startCamera] Error stack:', error.stack);
      
      // Check the specific error type
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        console.error('[startCamera] Permission denied');
        setPermissionState('denied');
        setErrorMessage('Camera permission was denied. Please allow camera access.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        console.error('[startCamera] No camera found');
        setPermissionState('denied');
        setErrorMessage('No camera found on this device.');
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        console.error('[startCamera] Camera in use');
        setPermissionState('denied');
        setErrorMessage('Camera is already in use by another application.');
      } else if (error.name === 'OverconstrainedError') {
        console.error('[startCamera] Constraints not supported');
        setPermissionState('denied');
        setErrorMessage('Camera constraints not supported. Try a different zoom level.');
      } else if (error.name === 'NotSupportedError') {
        console.error('[startCamera] Not supported');
        setPermissionState('denied');
        setErrorMessage('Camera not supported on this browser.');
      } else {
        console.error('[startCamera] Unknown error');
        setPermissionState('denied');
        setErrorMessage(`Camera error: ${error.message || 'Unknown error'}`);
      }
    }
  };

  const switchCamera = async () => {
    console.log('[switchCamera] ==================== SWITCH CAMERA CALLED ====================');
    try {
      // Get all available video input devices
      console.log('[switchCamera] Enumerating devices...');
      const devices = await navigator.mediaDevices.enumerateDevices();
      console.log('[switchCamera] All devices:', devices);
      
      const cameras = devices.filter(device => device.kind === 'videoinput');
      console.log('[switchCamera] Available cameras:', cameras.length);
      cameras.forEach((cam, idx) => {
        console.log(`[switchCamera]   Camera ${idx}:`, {
          deviceId: cam.deviceId,
          label: cam.label,
          groupId: cam.groupId
        });
      });
      
      if (cameras.length < 2) {
        console.warn('[switchCamera] ⚠️ Only one camera available, cannot switch');
        return;
      }
      
      // Get the currently active camera's facing mode
      const currentTrack = streamRef.current?.getVideoTracks()[0];
      const currentSettings = currentTrack?.getSettings();
      const currentFacingMode = currentSettings?.facingMode;
      const currentLabel = currentTrack?.label || '';
      
      console.log('[switchCamera] Current camera:', {
        deviceId: currentSettings?.deviceId,
        label: currentLabel,
        facingMode: currentFacingMode,
        settings: currentSettings
      });
      
      // Determine which camera to switch to
      let targetCamera: MediaDeviceInfo | null = null;
      
      if (currentFacingMode === 'environment' || currentLabel.toLowerCase().includes('back')) {
        // Currently on rear camera, switch to front
        console.log('[switchCamera] Currently on REAR camera, switching to FRONT');
        targetCamera = cameras.find(cam => 
          cam.label.toLowerCase().includes('front')
        ) || cameras.find(cam => 
          cam.deviceId !== currentSettings?.deviceId
        ) || null;
      } else {
        // Currently on front camera (or unknown), switch to rear
        console.log('[switchCamera] Currently on FRONT camera, switching to REAR');
        
        // Prefer "Back Dual Wide Camera" for rear
        targetCamera = cameras.find(cam => 
          cam.label.includes('Back Dual Wide')
        ) || null;
        
        // Fallback to any rear camera
        if (!targetCamera) {
          targetCamera = cameras.find(cam => 
            cam.label.toLowerCase().includes('back')
          ) || null;
        }
        
        // Fallback to environment facing mode
        if (!targetCamera) {
          targetCamera = cameras.find(cam => 
            cam.deviceId !== currentSettings?.deviceId
          ) || null;
        }
      }
      
      if (!targetCamera) {
        console.error('[switchCamera] ❌ Could not find target camera');
        return;
      }
      
      console.log('[switchCamera] 🔄 Switching to:', {
        deviceId: targetCamera.deviceId,
        label: targetCamera.label,
      });
      
      // Start the new camera using its device ID
      console.log('[switchCamera] Calling startCamera with deviceId:', targetCamera.deviceId);
      await startCamera(targetCamera.deviceId);
      console.log('[switchCamera] ✅ Switch completed successfully');
    } catch (error) {
      console.error('[switchCamera] ❌❌❌ Failed to switch camera:', error);
      console.error('[switchCamera] Error details:', {
        name: (error as any).name,
        message: (error as any).message,
        stack: (error as any).stack
      });
       
      // Attempt recovery: try to restart with any available camera
      console.log('[switchCamera] Attempting recovery...');
      try {
        await startCamera();
        console.log('[switchCamera] ✅ Recovery succeeded');
      } catch (recoveryError) {
        console.error('[switchCamera] ❌ Recovery failed:', recoveryError);
      }
    }
  };

  const toggleFlash = async () => {
    setFlashEnabled(!flashEnabled);
    
    // Apply flash to current stream
    if (streamRef.current && streamRef.current.getVideoTracks().length > 0) {
      const track = streamRef.current.getVideoTracks()[0];
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
    if (streamRef.current && streamRef.current.getVideoTracks().length > 0) {
      const track = streamRef.current.getVideoTracks()[0];
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
            <button className="primary-button" onClick={() => startCamera()}>
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
