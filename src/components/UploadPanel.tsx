import React, { useState, useEffect } from 'react';
import { getUploadStats, uploadPendingPhotos, type UploadProgress } from '../services/uploadService';
import './UploadPanel.css';

interface UploadPanelProps {
  eventId: string;
  onUploadComplete?: () => void;
}

const UploadPanel: React.FC<UploadPanelProps> = ({ eventId, onUploadComplete }) => {
  const [stats, setStats] = useState({ pendingCount: 0, failedCount: 0, totalPending: 0 });
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [uploadResult, setUploadResult] = useState<'success' | 'partial' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    loadStats();
  }, [eventId]);

  const loadStats = async () => {
    try {
      const uploadStats = await getUploadStats(eventId);
      setStats(uploadStats);
    } catch (error) {
      console.error('Failed to load upload stats:', error);
    }
  };

  const handleUpload = async () => {
    // Prevent duplicate uploads
    if (isUploading) {
      console.log('[UploadPanel] Upload already in progress, ignoring');
      return;
    }

    setIsUploading(true);
    setUploadResult(null);
    setErrorMessage('');

    try {
      console.log('[UploadPanel] Starting upload for event:', eventId);
      const result = await uploadPendingPhotos(eventId, (progress) => {
        console.log('[UploadPanel] Progress:', progress);
        setProgress(progress);
      });
      
      console.log('[UploadPanel] Upload complete:', {
        succeeded: result.succeeded.length,
        failed: result.failed.length,
        failedPhotos: result.failed.map(f => ({ id: f.photo.id, error: f.error }))
      });

      if (result.failed.length === 0) {
        setUploadResult('success');
      } else if (result.succeeded.length > 0) {
        setUploadResult('partial');
        const failedErrors = result.failed.map(f => f.error).join(', ');
        setErrorMessage(`${result.failed.length} photo(s) failed: ${failedErrors}`);
      } else {
        setUploadResult('error');
        const failedErrors = result.failed.map(f => f.error).join(', ');
        setErrorMessage(`Upload failed: ${failedErrors}`);
      }

      // Reload stats after upload
      await loadStats();

      if (onUploadComplete) {
        onUploadComplete();
      }
    } catch (error) {
      console.error('[UploadPanel] ❌ Upload exception:', error);
      if (error instanceof Error) {
        console.error('[UploadPanel] Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
      }
      setUploadResult('error');
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      setProgress(null);
    }
  };

  const handleRetry = async () => {
    await handleUpload();
  };

  if (stats.totalPending === 0 && !uploadResult) {
    return null; // Hide panel if nothing to upload
  }

  const percentComplete = progress ? (progress.completed / progress.total) * 100 : 0;

  return (
    <div className="upload-panel">
      <div className="upload-stats">
        <div className="upload-count">
          {stats.totalPending > 0 && (
            <>
              <span className="count">{stats.totalPending}</span>{' '}
              {stats.totalPending === 1 ? 'photo' : 'photos'} ready to upload
            </>
          )}
          {stats.failedCount > 0 && (
            <div style={{ fontSize: '14px', color: '#FF6B6B', marginTop: '4px' }}>
              {stats.failedCount} failed
            </div>
          )}
        </div>
      </div>

      {!isUploading && !uploadResult && (
        <button
          className="upload-button"
          onClick={handleUpload}
          disabled={stats.totalPending === 0 || isUploading}
        >
          <span className="icon">↑</span>
          Upload {stats.totalPending} {stats.totalPending === 1 ? 'Photo' : 'Photos'}
        </button>
      )}

      {isUploading && progress && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${percentComplete}%` }}></div>
          </div>
          <div className="progress-text">
            Uploading... {progress.completed} / {progress.total}
          </div>
        </div>
      )}

      {uploadResult === 'success' && (
        <div className="upload-status success">
          ✓ All photos uploaded successfully!
        </div>
      )}

      {uploadResult === 'partial' && (
        <div className="upload-status error">
          ⚠ {errorMessage}
          <button className="retry-button" onClick={handleRetry}>
            Retry Failed Uploads
          </button>
        </div>
      )}

      {uploadResult === 'error' && (
        <div className="upload-status error">
          ✗ {errorMessage}
          <button className="retry-button" onClick={handleRetry}>
            Retry Upload
          </button>
        </div>
      )}
    </div>
  );
};

export default UploadPanel;
