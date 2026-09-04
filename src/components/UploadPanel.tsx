import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getUploadStats, uploadPendingPhotos, type UploadProgress } from '../services/uploadService';
import Modal from './Modal';
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
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);

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

  const requestUpload = () => {
    if (!isUploading && stats.totalPending > 0) {
      setShowUploadConfirm(true);
    }
  };

  const confirmUpload = async () => {
    setShowUploadConfirm(false);
    await handleUpload();
  };

  const handleRetry = async () => {
    await handleUpload();
  };

  if (stats.totalPending === 0 && !uploadResult) {
    return null; // Hide panel if nothing to upload
  }

  const percentComplete = progress ? (progress.completed / progress.total) * 100 : 0;

  const uploadTotal = progress?.total ?? stats.totalPending;
  const uploadCompleted = progress?.completed ?? 0;

  return (
    <div className={`upload-panel ${isUploading ? 'is-uploading' : ''}`}>
      <div className="upload-stats">
        <div className="upload-count">
          {stats.totalPending > 0 && (
            <>
              <span className="count">{stats.totalPending}</span>
              <span className="upload-copy">{stats.totalPending === 1 ? 'photo ready' : 'photos ready'}</span>
            </>
          )}
          {stats.failedCount > 0 && (
            <div className="upload-failed-count">
              {stats.failedCount} failed
            </div>
          )}
        </div>
      </div>

      {!isUploading && !uploadResult && (
        <button
          className="upload-button"
          onClick={requestUpload}
          disabled={stats.totalPending === 0 || isUploading}
          aria-label={`Upload ${stats.totalPending} ${stats.totalPending === 1 ? 'photo' : 'photos'}`}
          title="Upload photos"
        >
          <svg className="upload-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2">
            <path d="M12 16V4m0 0-4 4m4-4 4 4M4 20h16" />
          </svg>
          <span className="upload-button-label">Upload</span>
        </button>
      )}

      {isUploading && (
        createPortal(
          <div className="upload-blocking-screen" role="status" aria-live="assertive" aria-label="Uploading photos">
            <div className="upload-blocking-content">
              <div className="upload-spinner" aria-hidden="true"></div>
              <p className="upload-blocking-label">Saving your photos</p>
              <p className="upload-blocking-message">Please wait while each photo is safely added to the album.</p>
              <p className="upload-blocking-count">{uploadCompleted} of {uploadTotal}</p>
              <div className="upload-blocking-track" aria-hidden="true">
                <div style={{ width: `${percentComplete}%` }}></div>
              </div>
            </div>
          </div>,
          document.body
        )
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

      <Modal isOpen={showUploadConfirm} onClose={() => setShowUploadConfirm(false)} className="upload-confirm-modal">
        <h2>Upload {stats.totalPending} {stats.totalPending === 1 ? 'photo' : 'photos'}?</h2>
        <p>Once uploaded, photos are shared with the host and cannot be deleted. Choose your best shots.</p>
        <div className="upload-confirm-actions">
          <button onClick={() => setShowUploadConfirm(false)}>Cancel</button>
          <button onClick={confirmUpload}>Upload</button>
        </div>
      </Modal>
    </div>
  );
};

export default UploadPanel;
