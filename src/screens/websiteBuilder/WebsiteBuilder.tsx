import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Eye, Globe2, LayoutTemplate, LoaderCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { getEventsByHostCode, getPhotoUrl, uploadEventCover } from '../../services/dataService';
import type { Event } from '../../services/dataService';
import { createWebsiteDraft, getEventWebsite, publishEventWebsite, saveEventWebsite } from '../../services/websiteService';
import type { WebsiteDocument, WebsiteTemplateId } from '../../services/websiteService';
import { getHostCode } from '../../utils/hostAuth';
import './WebsiteBuilder.css';

const WebsiteBuilder = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<Event | null>(null);
  const [document, setDocument] = useState<WebsiteDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isDirty, setIsDirty] = useState(false);
  const [slug, setSlug] = useState('');
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let isCurrent = true;
    const hostCode = getHostCode();

    if (!eventId || !hostCode) {
      setError('This event is unavailable.');
      setIsLoading(false);
      return;
    }

    getEventsByHostCode(hostCode)
      .then(async events => {
        if (!isCurrent) return;
        const ownedEvent = events.find(candidate => candidate.id === eventId) ?? null;
        setEvent(ownedEvent);
        if (!ownedEvent) {
          setError('You do not have access to this event.');
          return;
        }
        const website = await getEventWebsite(ownedEvent.id, hostCode);
        if (isCurrent) {
          setDocument(website?.draft_document ?? createWebsiteDraft(ownedEvent.name, ownedEvent.date, 'garden', ownedEvent.cover_photo_path));
          setSlug(website?.public_slug ?? ownedEvent.name);
        }
      })
      .catch(() => {
        if (isCurrent) setError('We could not load this event. Please try again.');
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => { isCurrent = false; };
  }, [eventId]);

  useEffect(() => {
    if (!isDirty || !document || !event) return;
    const hostCode = getHostCode();
    if (!hostCode) return;

    const timeout = window.setTimeout(async () => {
      setSaveState('saving');
      try {
        await saveEventWebsite(event.id, hostCode, document);
        setSaveState('saved');
        setIsDirty(false);
      } catch {
        setSaveState('error');
      }
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [document, event, isDirty]);

  if (isLoading) {
    return <main className="website-builder-state"><p>Loading invitation workspace...</p></main>;
  }

  if (error || !event) {
    return (
      <main className="website-builder-state">
        <p>{error}</p>
        <button type="button" onClick={() => navigate('/host')}>Back to events</button>
      </main>
    );
  }

  const selectTemplate = async (templateId: WebsiteTemplateId) => {
    const hostCode = getHostCode();
    if (!hostCode) return;

    const nextDocument = createWebsiteDraft(event.name, event.date, templateId, event.cover_photo_path);
    setDocument(nextDocument);
    setIsDirty(false);
    setSaveState('saving');
    try {
      await saveEventWebsite(event.id, hostCode, nextDocument);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  };

  const templates: Array<{ id: WebsiteTemplateId; name: string; description: string }> = [
    { id: 'garden', name: 'Garden Letter', description: 'Romantic florals and a soft arrival.' },
    { id: 'modern', name: 'City Vow', description: 'Editorial type with a confident reveal.' },
    { id: 'classic', name: 'Sunday Heirloom', description: 'Timeless details and quiet motion.' },
  ];

  const hero = document?.sections.find(section => section.type === 'hero');
  const heroContent = hero?.content ?? {};
  const heroNames = typeof heroContent.couple_names === 'string' ? heroContent.couple_names : event.name;
  const heroDate = typeof heroContent.date === 'string' ? heroContent.date : '';
  const heroMessage = typeof heroContent.message === 'string' ? heroContent.message : '';
  const coverPhotoPath = typeof heroContent.cover_photo_path === 'string' ? heroContent.cover_photo_path : event.cover_photo_path;
  const coverPhotoUrl = coverPhotoPath ? getPhotoUrl(coverPhotoPath) : undefined;

  const updateHero = (field: 'couple_names' | 'date' | 'message' | 'cover_photo_path', value: string) => {
    if (!document) return;
    setDocument({
      ...document,
      sections: document.sections.map(section => section.type === 'hero'
        ? { ...section, content: { ...section.content, [field]: value } }
        : section),
    });
    setIsDirty(true);
    setSaveState('idle');
  };

  const uploadCover = async (file: File | null) => {
    const hostCode = getHostCode();
    if (!file || !hostCode) return;

    setIsUploadingCover(true);
    setPublishError(null);
    try {
      const updatedEvent = await uploadEventCover(event.id, hostCode, file);
      setEvent(updatedEvent);
      updateHero('cover_photo_path', updatedEvent.cover_photo_path ?? '');
    } catch {
      setPublishError('Could not upload the cover photo. Please try again.');
    } finally {
      setIsUploadingCover(false);
    }
  };

  const publishWebsite = async () => {
    const hostCode = getHostCode();
    if (!hostCode || !document) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      await saveEventWebsite(event.id, hostCode, document);
      const published = await publishEventWebsite(event.id, hostCode, slug);
      setSlug(published.public_slug ?? slug);
      setSaveState('saved');
      setIsDirty(false);
    } catch (publishFailure) {
      setPublishError(publishFailure instanceof Error ? publishFailure.message : 'Could not publish invitation website');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <main className="website-builder">
      <header className="website-builder-header">
        <button
          type="button"
          className="website-builder-back"
          onClick={() => navigate(`/host/dashboard/${event.id}`)}
          aria-label="Back to event dashboard"
          title="Back to event dashboard"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div>
          <p className="website-builder-eyebrow">Invitation website</p>
          <h1>{event.name}</h1>
        </div>
      </header>

      <section className="website-builder-intro" aria-labelledby="website-builder-title">
        <div>
          <p className="website-builder-kicker">Step 1</p>
          <h2 id="website-builder-title">Choose a starting mood</h2>
          <p>Every detail stays editable. Start with the invitation feeling that fits your day.</p>
        </div>
        <p className={`website-builder-save-state ${saveState}`} role="status">
          {saveState === 'saving' && <><LoaderCircle size={15} aria-hidden="true" /> Saving draft</>}
          {saveState === 'saved' && <><Check size={15} aria-hidden="true" /> Draft saved</>}
          {saveState === 'error' && 'Could not save. Choose a template again to retry.'}
        </p>
      </section>

      <section className="template-gallery" aria-label="Invitation templates">
        {templates.map(template => {
          const isSelected = document?.template_id === template.id;
          return (
            <button
              key={template.id}
              type="button"
              className={`template-option template-${template.id} ${isSelected ? 'selected' : ''}`}
              onClick={() => selectTemplate(template.id)}
              aria-pressed={isSelected}
            >
              <span className="template-art" aria-hidden="true">
                <span className="template-art-names">Avery<br />&amp; Jordan</span>
                <span className="template-art-date">SEPTEMBER 21</span>
              </span>
              <span className="template-copy">
                <strong>{template.name}</strong>
                <small>{template.description}</small>
              </span>
              {isSelected && <span className="template-selected"><Check size={15} aria-hidden="true" /> Selected</span>}
            </button>
          );
        })}
      </section>

      <section className="website-editor-workspace">
        <form className="website-editor-panel" onSubmit={(submission) => { submission.preventDefault(); publishWebsite(); }}>
          <div className="website-editor-panel-heading">
            <div>
              <p className="website-builder-kicker">Step 2</p>
              <h2>Make it yours</h2>
            </div>
            <LayoutTemplate size={21} aria-hidden="true" />
          </div>
          <label htmlFor="invitation-names">Names
            <input id="invitation-names" value={heroNames} onChange={(input) => updateHero('couple_names', input.target.value)} maxLength={120} />
          </label>
          <label htmlFor="invitation-date">Date
            <input id="invitation-date" value={heroDate} onChange={(input) => updateHero('date', input.target.value)} maxLength={80} />
          </label>
          <label htmlFor="invitation-message">Invitation message
            <textarea id="invitation-message" value={heroMessage} onChange={(input) => updateHero('message', input.target.value)} maxLength={280} rows={4} />
          </label>
          <label className="website-cover-picker" htmlFor="invitation-cover">Cover photo
            <span>{isUploadingCover ? 'Uploading cover...' : 'Choose photo'}</span>
            <input id="invitation-cover" type="file" accept="image/jpeg,image/png,image/webp" disabled={isUploadingCover} onChange={(input) => uploadCover(input.target.files?.[0] ?? null)} />
          </label>
          <div className="website-publish-fields">
            <label htmlFor="invitation-slug">Invitation URL
              <span className="website-slug-input"><span>{window.location.host}/</span><input id="invitation-slug" value={slug} onChange={(input) => setSlug(input.target.value)} required /></span>
            </label>
            {publishError && <p className="website-publish-error" role="alert">{publishError}</p>}
            <button type="submit" className="website-publish-button" disabled={isPublishing}>
              <Globe2 size={17} aria-hidden="true" />
              {isPublishing ? 'Publishing...' : 'Publish invitation'}
            </button>
          </div>
        </form>

        <div className="website-live-preview" aria-label="Live invitation preview">
          <div className="website-preview-label"><Eye size={16} aria-hidden="true" /> Live preview</div>
          <article className={`invitation-preview invitation-preview-${document?.template_id ?? 'garden'} ${coverPhotoUrl ? 'has-cover' : ''}`} style={coverPhotoUrl ? { backgroundImage: `url(${coverPhotoUrl})` } : undefined}>
            <p className="invitation-preview-date">{heroDate}</p>
            <h2>{heroNames}</h2>
            <p className="invitation-preview-message">{heroMessage}</p>
            <span>RSVP</span>
          </article>
        </div>
      </section>
    </main>
  );
};

export default WebsiteBuilder;