import React, { useRef, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { savePhoto, getEventPhotos, generateUUID } from '../utils/indexedDBStorage';
import { getParticipant } from '../utils/participant';
import cameraIconSvg from '../assets/images/pwa_camera_assets/youre_in_camera.svg';
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
  const [supportedZoomLevels, setSupportedZoomLevels] = useState<number[]>([0.5, 1, 2]);
  const [activeCameraLabel, setActiveCameraLabel] = useState<string>('');
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [hasAcknowledgedContentNotice, setHasAcknowledgedContentNotice] = useState(() => {
    return eventToken ? localStorage.getItem(`luma-content-notice-${eventToken}`) === 'accepted' : false;
  });
  const navigate = useNavigate();
  
  const device = getUserAgent();
  const isHTTPS = window.location.protocol === 'https:';
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  useEffect(() => {
    // Reset zoom to 1x on initial load (especially important for Android)
    setZoom(1);
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
      
      // Mark video as not ready when switching cameras
      setIsVideoReady(false);
      
      // Use requestAnimationFrame to ensure React has rendered the video element
      requestAnimationFrame(() => {
        if (videoRef.current && streamRef.current) {
          console.log('[useEffect] Attaching stream to video element');
          videoRef.current.srcObject = streamRef.current;
          
          // Add loadedmetadata listener to ensure video is ready
          const handleLoadedMetadata = () => {
            console.log('[useEffect] Video metadata loaded');
            console.log('[useEffect] Video dimensions:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight);
            
            // Mark video as ready once dimensions are available
            if (videoRef.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
              setIsVideoReady(true);
              console.log('[useEffect] ✅ Video ready for capture');
            } else {
              console.warn('[useEffect] ⚠️ Video metadata loaded but dimensions still 0');
            }
          };
          
          videoRef.current.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
          
          videoRef.current.play().then(() => {
            console.log('[useEffect] ✅ Video playing successfully');
          }).catch(error => {
            console.error('[useEffect] ❌ Video play failed:', error);
            // Try playing again after a short delay (helps on iOS)
            setTimeout(() => {
              if (videoRef.current) {
                videoRef.current.play().catch(e => {
                  console.error('[useEffect] ❌ Retry play failed:', e);
                });
              }
            }, 100);
          });
        } else {
          console.error('[useEffect] ❌ videoRef or streamRef is null after RAF');
        }
      });
    }
  }, [permissionState, streamVersion]);

  const updatePhotoCount = async () => {
    if (eventToken) {
      const photos = await getEventPhotos(eventToken);
      setPhotoCount(photos.length);
      // Get latest photo for preview (use thumbnail)
      if (photos.length > 0) {
        setLatestPhotoUrl(photos[0].thumbnailUrl); // IndexedDB returns newest first
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
      
      // If no deviceId provided and on Android, enumerate and select best rear camera
      if (!deviceId && device.isAndroid && isInitialLoad.current) {
        console.log('[startCamera] Android detected - enumerating cameras to select best rear camera');
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const cameras = devices.filter(d => d.kind === 'videoinput');
          
          console.log('[startCamera] Available cameras:', cameras.length);
          cameras.forEach((cam, idx) => {
            console.log(`[startCamera]   Camera ${idx}:`, cam.label);
          });
          
          // Find rear cameras, excluding telephoto/zoom lenses
          const rearCameras = cameras.filter(cam => {
            const label = cam.label.toLowerCase();
            const isRear = label.includes('back') || label.includes('rear');
            
            // Comprehensive telephoto detection
            const isTelephoto = label.includes('telephoto') || 
                              label.includes('tele') ||
                              label.includes('zoom') || 
                              label.includes('2x') || label.includes('3x') || 
                              label.includes('5x') || label.includes('10x') ||
                              label.includes('periscope') ||
                              label.match(/\d+x/) || // Catches any "Nx" pattern
                              (label.includes('camera') && (label.includes(' 2 ') || label.includes('(2)'))) ||
                              // Filter out higher numbered cameras (Camera 3, Camera 4, etc.)
                              // These are usually telephoto on multi-camera phones
                              label.match(/camera\s*[3-9]/) || label.match(/camera\s*\d{2,}/);
            
            return isRear && !isTelephoto;
          });
          
          console.log('[startCamera] Non-telephoto rear cameras:', rearCameras.length);
          rearCameras.forEach((cam, idx) => {
            console.log(`[startCamera]   Rear camera ${idx}:`, cam.label);
          });
          
          // Prefer ultra-wide or main camera, or lowest numbered camera
          let selectedCamera = rearCameras.find(cam => 
            cam.label.toLowerCase().includes('ultra') || 
            cam.label.toLowerCase().includes('wide')
          );
          
          // If not found, prefer Camera 0 or Camera 1 (main cameras)
          if (!selectedCamera) {
            selectedCamera = rearCameras.find(cam => 
              cam.label.toLowerCase().match(/camera\s*[0-1](?!\d)/)
            );
          }
          
          // Fallback to first non-telephoto rear camera
          if (!selectedCamera && rearCameras.length > 0) {
            selectedCamera = rearCameras[0];
          }
          
          if (selectedCamera) {
            console.log('[startCamera] ✅ Selected Android camera:', selectedCamera.label);
            deviceId = selectedCamera.deviceId;
          } else {
            console.log('[startCamera] ⚠️ No suitable rear camera found, using facingMode');
          }
        } catch (e) {
          console.log('[startCamera] Could not enumerate devices, using facingMode:', e);
        }
      }
      
      if (deviceId) {
        // Use specific device ID when switching cameras
        console.log('[startCamera] Building constraints with deviceId:', deviceId);
        constraints = {
          video: { 
            deviceId: { exact: deviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false,
        };
      } else {
        // Use facingMode preference for initial load
        console.log('[startCamera] Building constraints with facingMode: environment');
        constraints = {
          video: { 
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false,
        };
      }

      console.log('[startCamera] Calling getUserMedia with constraints:', JSON.stringify(constraints));
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[startCamera] getUserMedia succeeded');
      
      const track = mediaStream.getVideoTracks()[0];
      const settings = track?.getSettings();
      console.log('[startCamera] ✅ Camera access granted');
      console.log('[startCamera] Track label:', track?.label);
      console.log('[startCamera] Track settings:', settings);
      console.log('[startCamera] Track capabilities:', track?.getCapabilities());
      console.log('[startCamera] Track readyState:', track?.readyState);
      
      // Store active camera label for on-screen display
      setActiveCameraLabel(track?.label || 'Unknown Camera');
      
      // Check if we accidentally got a zoomed camera
      if (settings?.deviceId) {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const selectedDevice = allDevices.find(d => d.deviceId === settings.deviceId);
        if (selectedDevice) {
          const label = selectedDevice.label.toLowerCase();
          if (label.includes('telephoto') || label.includes('tele') || 
              label.includes('zoom') || label.includes('2x') || 
              label.includes('3x') || label.match(/\d+x/) ||
              label.match(/camera\s*[3-9]/) || label.match(/camera\s*\d{2,}/)) {
            console.warn('[startCamera] ⚠️ WARNING: Selected camera appears to be telephoto/zoom:', selectedDevice.label);
            console.warn('[startCamera] This may cause unwanted zoom effect');
            
            // Try to switch to a better camera automatically
            if (isInitialLoad.current) {
              console.log('[startCamera] Attempting to switch to non-telephoto camera...');
              const devices = await navigator.mediaDevices.enumerateDevices();
              const cameras = devices.filter(d => d.kind === 'videoinput');
              
              // Find non-telephoto rear cameras
              const nonTelephotoRear = cameras.filter(cam => {
                const l = cam.label.toLowerCase();
                const isRear = l.includes('back') || l.includes('rear');
                const isTele = l.includes('telephoto') || l.includes('tele') || 
                             l.includes('zoom') || l.match(/\d+x/) ||
                             l.match(/camera\s*[3-9]/) || l.match(/camera\s*\d{2,}/);
                return isRear && !isTele && cam.deviceId !== settings.deviceId;
              });
              
              console.log('[startCamera] Found alternative cameras:', nonTelephotoRear.length);
              
              // Prefer Camera 0 or Camera 1
              let betterCamera = nonTelephotoRear.find(cam =>
                cam.label.toLowerCase().match(/camera\s*[0-1](?!\d)/)
              );
              
              // Or prefer wide/ultra-wide
              if (!betterCamera) {
                betterCamera = nonTelephotoRear.find(cam =>
                  cam.label.toLowerCase().includes('wide') ||
                  cam.label.toLowerCase().includes('ultra')
                );
              }
              
              // Or just take first available
              if (!betterCamera && nonTelephotoRear.length > 0) {
                betterCamera = nonTelephotoRear[0];
              }
              
              if (betterCamera) {
                console.log('[startCamera] 🔄 Switching to better camera:', betterCamera.label);
                // Restart with the better camera
                await startCamera(betterCamera.deviceId);
                return; // Exit early, new camera will continue the flow
              } else {
                console.log('[startCamera] ⚠️ No better camera found, continuing with telephoto');
              }
            }
          }
        }
      }
      
      // Log actual zoom level from camera
      if (settings) {
        console.log('[startCamera] Current zoom from camera settings:', (settings as any).zoom || 'not reported');
      }
      
      // Store stream in ref
      streamRef.current = mediaStream;
      console.log('[startCamera] Stream stored in ref');
      
      // Mark initial load as complete
      isInitialLoad.current = false;
      
      // Determine supported zoom levels
      if (track) {
        const capabilities = track.getCapabilities() as any;
        if (capabilities.zoom) {
          const minZoom = capabilities.zoom.min || 1;
          const maxZoom = capabilities.zoom.max || 1;
          console.log('[startCamera] Zoom range:', minZoom, '-', maxZoom);
          
          // Determine which preset zoom levels are supported
          const presetLevels = [0.5, 1, 2];
          const supported = presetLevels.filter(level => level >= minZoom && level <= maxZoom);
          
          // Always include 1x if possible
          if (!supported.includes(1) && minZoom <= 1 && maxZoom >= 1) {
            supported.push(1);
            supported.sort((a, b) => a - b);
          }
          
          console.log('[startCamera] Supported zoom levels:', supported);
          setSupportedZoomLevels(supported);
          
          // If current zoom is not supported, reset to 1x
          if (!supported.includes(zoom)) {
            console.log('[startCamera] Current zoom not supported, resetting to 1x');
            setZoom(1);
          }
        } else {
          console.log('[startCamera] Zoom not supported on this camera');
          setSupportedZoomLevels([1]); // Only show 1x
        }
      }
      
      // Increment stream version to trigger useEffect
      setStreamVersion(prev => prev + 1);
      console.log('[startCamera] Stream version incremented to trigger attachment');
      
      // For Android on initial load, explicitly ensure zoom starts at 1x (not zoomed)
      if (device.isAndroid && isInitialLoad.current && mediaStream.getVideoTracks().length > 0) {
        const track = mediaStream.getVideoTracks()[0];
        const capabilities = track.getCapabilities() as any;
        
        if (capabilities.zoom) {
          try {
            console.log('[startCamera] Android initial load - resetting zoom to 1x to avoid telephoto zoom');
            const minZoom = capabilities.zoom.min || 1;
            const maxZoom = capabilities.zoom.max || 1;
            
            // Only reset if 1x is in range
            if (minZoom <= 1 && maxZoom >= 1) {
              await track.applyConstraints({
                // @ts-ignore
                advanced: [{ zoom: 1 }]
              });
              setZoom(1); // Update state as well
              console.log('[startCamera] ✅ Android zoom reset to 1x (range: ' + minZoom + '-' + maxZoom + ')');
            } else {
              console.log('[startCamera] ⚠️ 1x not in zoom range, using minZoom:', minZoom);
              await track.applyConstraints({
                // @ts-ignore
                advanced: [{ zoom: minZoom }]
              });
              setZoom(minZoom);
            }
          } catch (e) {
            console.log('[startCamera] Could not reset zoom:', e);
          }
        }
      }
      
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
        
        // For iOS: Prefer "Back Dual Wide Camera"
        if (device.isIOS) {
          targetCamera = cameras.find(cam => 
            cam.label.includes('Back Dual Wide')
          ) || null;
          
          // Fallback to any rear camera
          if (!targetCamera) {
            targetCamera = cameras.find(cam => 
              cam.label.toLowerCase().includes('back')
            ) || null;
          }
        } else {
          // For Android: Avoid telephoto/zoom lenses
          const rearCameras = cameras.filter(cam => {
            const label = cam.label.toLowerCase();
            const isRear = label.includes('back') || label.includes('rear');
            
            // Comprehensive telephoto detection
            const isTelephoto = label.includes('telephoto') || 
                              label.includes('tele') ||
                              label.includes('zoom') || 
                              label.includes('2x') || label.includes('3x') || 
                              label.includes('5x') || label.includes('10x') ||
                              label.includes('periscope') ||
                              label.match(/\d+x/) || // Catches any "Nx" pattern
                              (label.includes('camera') && (label.includes(' 2 ') || label.includes('(2)'))) ||
                              // Filter out higher numbered cameras (Camera 3, Camera 4, etc.)
                              label.match(/camera\s*[3-9]/) || label.match(/camera\s*\d{2,}/);
            
            return isRear && !isTelephoto;
          });
          
          console.log('[switchCamera] Android non-telephoto rear cameras:', rearCameras.length);
          rearCameras.forEach((cam, idx) => {
            console.log(`[switchCamera]   Option ${idx}:`, cam.label);
          });
          
          // Prefer ultra-wide or wide camera
          targetCamera = rearCameras.find(cam => 
            cam.label.toLowerCase().includes('ultra') || 
            cam.label.toLowerCase().includes('wide')
          ) || null;
          
          // If not found, prefer Camera 0 or Camera 1 (main cameras)
          if (!targetCamera) {
            targetCamera = rearCameras.find(cam => 
              cam.label.toLowerCase().match(/camera\s*[0-1](?!\d)/)
            ) || null;
          }
          
          // Fallback to first non-telephoto rear camera
          if (!targetCamera && rearCameras.length > 0) {
            targetCamera = rearCameras[0];
          }
          
          // Last resort: any rear camera
          if (!targetCamera) {
            targetCamera = cameras.find(cam => 
              cam.label.toLowerCase().includes('back')
            ) || null;
          }
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
    console.log('[changeZoom] Requested zoom:', newZoom);
    console.log('[changeZoom] Current zoom:', zoom);
    console.log('[changeZoom] Supported levels:', supportedZoomLevels);
    
    setZoom(newZoom);
    
    // Apply zoom to current stream without restarting camera
    if (streamRef.current && streamRef.current.getVideoTracks().length > 0) {
      const track = streamRef.current.getVideoTracks()[0];
      const capabilities = track.getCapabilities() as any;
      
      console.log('[changeZoom] Track capabilities:', capabilities);
      
      if (capabilities.zoom) {
        try {
          const minZoom = capabilities.zoom.min || 1;
          const maxZoom = capabilities.zoom.max || 1;
          
          console.log('[changeZoom] Camera zoom range:', minZoom, '-', maxZoom);
          
          // Clamp zoom to supported range
          const clampedZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
          
          console.log('[changeZoom] Clamped zoom value:', clampedZoom);
          
          // Only apply if within range
          if (clampedZoom >= minZoom && clampedZoom <= maxZoom) {
            await track.applyConstraints({
              // @ts-ignore
              advanced: [{ zoom: clampedZoom }]
            });
            console.log('[changeZoom] ✅ Zoom applied successfully:', clampedZoom);
          } else {
            console.log('[changeZoom] ⚠️ Requested zoom out of range, ignoring');
          }
        } catch (e) {
          console.error('[changeZoom] ❌ Could not apply zoom:', e);
        }
      } else {
        console.log('[changeZoom] ⚠️ Zoom not supported on this camera');
      }
    } else {
      console.log('[changeZoom] ⚠️ No active stream or track');
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !eventToken || isCapturing) return;

    // Prevent double-capture
    setIsCapturing(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Check if video has valid dimensions (critical for iOS/Android)
    if (!video.videoWidth || !video.videoHeight) {
      console.error('[capturePhoto] Video not ready - dimensions are 0');
      console.error('[capturePhoto] videoWidth:', video.videoWidth, 'videoHeight:', video.videoHeight);
      console.error('[capturePhoto] readyState:', video.readyState);
      alert('Camera not ready yet. Please wait a moment and try again.');
      setIsCapturing(false);
      return;
    }
    
    console.log('[capturePhoto] Capturing photo:', video.videoWidth, 'x', video.videoHeight);
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    console.log('[capturePhoto] Output size:', canvas.width, 'x', canvas.height);
    
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

    // Draw video frame with scaling
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Store the original capture. Filters are generated only when a guest downloads.
    canvas.toBlob(async (blob) => {
      if (blob) {
        // Save photo locally - no automatic upload
        const participant = getParticipant(eventToken);
        if (!participant) {
          console.error('[capturePhoto] No participant found');
          alert('Session expired. Please restart.');
          return;
        }
        
        const participantName = participant.name;
        const participantId = participant.participantId;
        
        console.log('[capturePhoto] Photo blob size:', (blob.size / 1024).toFixed(1), 'KB');
        
        try {
          // Generate a unique UUID for this photo
          const photoId = generateUUID();
          console.log('[capturePhoto] Generated photo ID:', photoId);
          
          await savePhoto(eventToken, participantId, participantName, blob, photoId);
          await updatePhotoCount();
          
          // Still call onCapture for backward compatibility (decrements shots)
          onCapture(blob);
          
          // Show success feedback
          console.log('✅ Photo saved locally with ID:', photoId);
        } catch (error: any) {
          console.error('Failed to save photo:', error);
          alert('Failed to save photo. Please try again.');
        } finally {
          // Re-enable capture button
          setIsCapturing(false);
        }
      } else {
        // Re-enable capture button if blob creation failed
        setIsCapturing(false);
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

  const acknowledgeContentNotice = () => {
    if (eventToken) localStorage.setItem(`luma-content-notice-${eventToken}`, 'accepted');
    setHasAcknowledgedContentNotice(true);
  };

  // Show loading while checking permission
  if (permissionState === 'checking' || permissionState === 'prompt') {
    return (
      <div className="camera-loading">
        <div className="loading-content">
          <div className="camera-icon">
            <img src={cameraIconSvg} alt="Camera" width="120" height="120" />
          </div>
          <div className="loading-spinner"></div>
          <h2>Initializing Camera</h2>
          <p className="loading-hint">Preparing your capture experience...</p>
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
        <div className="polaroid-container"> 
          <div className="polaroid-frame">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted
                className="camera-preview"
              />
            </div>
        </div>
 
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
            <span className="shots-number handwritten" key={shotsLeft}>{shotsLeft}</span>
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

        {!hasAcknowledgedContentNotice && (
          <div className="content-notice" role="dialog" aria-label="Photo sharing notice">
            <p>Please share only event-appropriate photos. Do not upload nudity, explicit content, or unrelated images.</p>
            <button type="button" onClick={acknowledgeContentNotice}>I understand</button>
          </div>
        )}

        {/* Debug: Show active camera name (especially for Android troubleshooting) */}
        {activeCameraLabel && (device.isAndroid || device.isIOS) && (
          <div className="camera-debug-info">
            📷 {activeCameraLabel}
            {activeCameraLabel.toLowerCase().match(/camera\s*[3-9]|camera\s*\d{2,}|telephoto|tele|zoom|\d+x/) && (
              <span style={{ display: 'block', fontSize: '10px', marginTop: '4px' }}>
                ⚠️ Telephoto detected - may look zoomed
              </span>
            )}
            <span style={{ display: 'block', fontSize: '10px', marginTop: '4px', opacity: 0.8 }}>
              Zoom: {supportedZoomLevels.join('x, ')}x
            </span>
          </div>
        )}

        <div className="camera-footer">
          {/* Zoom Controls */}
          <div className="zoom-controls">
            {supportedZoomLevels.includes(0.5) && (
              <button 
                className={`zoom-button ${zoom === 0.5 ? 'active' : ''}`}
                onClick={() => changeZoom(0.5)}
              >
                0.5x
              </button>
            )}
            {supportedZoomLevels.includes(1) && (
              <button 
                className={`zoom-button ${zoom === 1 ? 'active' : ''}`}
                onClick={() => changeZoom(1)}
              >
                1x
              </button>
            )}
            {supportedZoomLevels.includes(2) && (
              <button 
                className={`zoom-button ${zoom === 2 ? 'active' : ''}`}
                onClick={() => changeZoom(2)}
              >
                2x
              </button>
            )}
          </div>

          <div className="camera-controls-row">
          <button 
            className="camera-control switch-camera"
            onClick={switchCamera}
            aria-label="Switch camera"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
              <path d="M20 4h-3.17L15 2H9L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h4.05l1.83-2h4.24l1.83 2H20v12zM12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z"/>
            </svg>
          </button>

          <button 
            className="capture-button"
            onClick={capturePhoto}
            disabled={shotsLeft <= 0 || !isVideoReady || isCapturing || !hasAcknowledgedContentNotice}
            aria-label="Capture photo"
            title={
              isCapturing ? 'Processing...' :
              !isVideoReady ? 'Camera loading...' : 
              shotsLeft <= 0 ? 'No shots left' :
              !hasAcknowledgedContentNotice ? 'Acknowledge the photo sharing notice first' :
              'Capture photo'
            }
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
