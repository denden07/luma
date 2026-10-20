import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Copy, Eye, EyeOff, Globe2, LayoutTemplate, LoaderCircle, Monitor, Plus, Smartphone, Tablet, Trash2, X } from 'lucide-react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { deleteEventCover, getEventsByHostCode, getPhotoUrl, uploadEventCover } from '../../services/dataService';
import type { Event } from '../../services/dataService';
import { createWebsiteDraft, deleteWebsiteAsset, ensureWebsiteSections, getEventWebsite, getWebsiteAssets, publishEventWebsite, saveEventWebsite, slugifyInvitationName, uploadWebsiteAsset } from '../../services/websiteService';
import type { WebsiteAsset } from '../../services/websiteService';
import type { WebsiteDocument, WebsiteTemplateId } from '../../services/websiteService';
import { getHostCode } from '../../utils/hostAuth';
import { copyTextToClipboard } from '../../utils/clipboard';
import { showCopySuccessPopup } from '../../components/CopySuccessPopup';
import templateSampleImage from '../../assets/images/pwa_camera_assets/example-filter-photo.jpg';
import InvitationDocument from './InvitationDocument';
import Modal from '../../components/Modal';
import './WebsiteBuilder.css';

type EntourageGroup = { id: string; title: string; members: string[] };

const defaultEntourageGroups = (): EntourageGroup[] => [
  { id: 'sponsors', title: 'Sponsors', members: [] },
  { id: 'bridesmaids', title: 'Bridesmaids', members: [] },
  { id: 'groomsmen', title: 'Groomsmen', members: [] },
  { id: 'flower-girls', title: 'Flower Girls', members: [] },
];

const entourageGroups = (content: Record<string, unknown> | undefined): EntourageGroup[] => {
  if (Array.isArray(content?.groups)) {
    const groups = content.groups.filter((group): group is Record<string, unknown> => typeof group === 'object' && group !== null).map(group => ({
      id: typeof group.id === 'string' ? group.id : crypto.randomUUID(),
      title: typeof group.title === 'string' ? group.title : 'Wedding Party',
      members: Array.isArray(group.members) ? group.members.filter((member): member is string => typeof member === 'string') : [],
    }));
    if (groups.length > 0) return groups;
  }
  return defaultEntourageGroups();
};

const WebsiteBuilder = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<Event | null>(null);
  const [document, setDocument] = useState<WebsiteDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isDirty, setIsDirty] = useState(false);
  const [slug, setSlug] = useState('');
  const [hasEditedSlug, setHasEditedSlug] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [websiteAssets, setWebsiteAssets] = useState<WebsiteAsset[]>([]);
  const [isUploadingGalleryImage, setIsUploadingGalleryImage] = useState(false);
  const [previewedGalleryAsset, setPreviewedGalleryAsset] = useState<WebsiteAsset | null>(null);
  const [isCoverPreviewOpen, setIsCoverPreviewOpen] = useState(false);
  const revision = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingSave = useRef<{ revision: number; promise: Promise<void> } | null>(null);
  const navigate = useNavigate();
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    isDirty && currentLocation.pathname !== nextLocation.pathname);

  const markDirty = () => {
    revision.current += 1;
    setIsDirty(true);
    setSaveState('idle');
  };

  const saveDraft = useCallback(async (draft: WebsiteDocument, snapshot: number) => {
    const hostCode = getHostCode();
    if (!eventId || !hostCode) {
      setSaveState('error');
      throw new Error('Host access is required to save this invitation.');
    }
    setSaveState('saving');
    let pending = pendingSave.current;
    if (!pending || pending.revision !== snapshot) {
      const promise = saveQueue.current.catch(() => undefined)
        .then(() => saveEventWebsite(eventId, hostCode, draft))
        .then(() => undefined);
      pending = { revision: snapshot, promise };
      pendingSave.current = pending;
      saveQueue.current = promise;
    }
    try {
      await pending.promise;
      if (revision.current === snapshot) {
        setIsDirty(false);
        setSaveState('saved');
      }
    } catch (saveError) {
      setSaveState('error');
      throw saveError;
    } finally {
      if (pendingSave.current === pending) pendingSave.current = null;
    }
  }, [eventId]);

  useEffect(() => {
    let isCurrent = true;
    const hostCode = getHostCode();

    setIsLoading(true);
    setEvent(null);
    setDocument(null);
    setWebsiteAssets([]);
    setPreviewedGalleryAsset(null);
    setIsCoverPreviewOpen(false);

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
        const [website, assets] = await Promise.all([
          getEventWebsite(ownedEvent.id, hostCode),
          getWebsiteAssets(ownedEvent.id, hostCode),
        ]);
        if (isCurrent) {
          setDocument(ensureWebsiteSections(website?.draft_document ?? createWebsiteDraft(ownedEvent.name, ownedEvent.date, 'garden', ownedEvent.cover_photo_path)));
          setWebsiteAssets(assets);
          setSlug(website?.public_slug ?? slugifyInvitationName(ownedEvent.name));
          setHasEditedSlug(Boolean(website?.public_slug));
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
    if (blocker.state === 'blocked') return;
    const timeout = window.setTimeout(() => {
      void saveDraft(document, revision.current).catch(saveError => {
        console.error('Could not autosave invitation draft:', saveError);
      });
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [document, event, isDirty, blocker.state, saveDraft]);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let current = true;
    if (!document) {
      blocker.reset();
      return;
    }
    void saveDraft(document, revision.current).then(() => {
      if (current) blocker.proceed();
    }).catch(saveError => {
      console.error('Could not save invitation before leaving:', saveError);
      if (current) blocker.reset();
    });
    return () => { current = false; };
  }, [blocker, document, saveDraft]);

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

    const nextDocument: WebsiteDocument = document
      ? {
        ...document,
        template_id: templateId,
        theme: {
          ...document.theme,
          palette_id: templateId,
          font_pair_id: templateId === 'classic' ? 'editorial' : document.theme.font_pair_id,
        },
      }
      : createWebsiteDraft(event.name, event.date, templateId, event.cover_photo_path);
    setDocument(nextDocument);
    markDirty();
    try {
      await saveDraft(nextDocument, revision.current);
    } catch {
      setSaveState('error');
    }
  };

  const templates: Array<{ id: WebsiteTemplateId; name: string; description: string }> = [
    { id: 'garden', name: 'Photo Letter', description: 'A photo-first invitation with quiet editorial type.' },
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
  const coverPosition = typeof heroContent.cover_position === 'string' ? heroContent.cover_position : 'center';
  const story = document?.sections.find(section => section.type === 'story');
  const details = document?.sections.find(section => section.type === 'details');
  const closing = document?.sections.find(section => section.type === 'closing');
  const gallery = document?.sections.find(section => section.type === 'gallery');
  const entourage = document?.sections.find(section => section.type === 'entourage');
  const rsvp = document?.sections.find(section => section.type === 'rsvp');
  const contentText = (content: Record<string, unknown> | undefined, field: string) => typeof content?.[field] === 'string' ? content[field] as string : '';
  const galleryPhotoPaths = Array.isArray(gallery?.content.photo_paths) ? gallery.content.photo_paths.filter((path): path is string => typeof path === 'string') : [];
  const galleryLayout = contentText(gallery?.content, 'layout') || 'grid';
  const galleryLimit = galleryLayout === 'strip' || galleryLayout === 'carousel' ? 5 : 6;
  const currentEntourageGroups = entourageGroups(entourage?.content);

  const updateHero = (field: 'couple_names' | 'date' | 'message' | 'cover_photo_path' | 'cover_position', value: string) => {
    if (!document) return;
    setDocument({
      ...document,
      sections: document.sections.map(section => section.type === 'hero'
        ? { ...section, content: { ...section.content, [field]: value } }
        : section),
    });
    markDirty();
    if (field === 'couple_names' && !hasEditedSlug) setSlug(slugifyInvitationName(value));
  };

  const updateSection = (sectionId: string | undefined, field: string, value: string) => {
    if (!document || !sectionId) return;
    setDocument({
      ...document,
      sections: document.sections.map(section => section.id === sectionId
        ? { ...section, content: { ...section.content, [field]: value } }
        : section),
    });
    markDirty();
  };

  const updateTheme = (field: 'palette_id' | 'font_pair_id', value: string) => {
    if (!document) return;
    setDocument({ ...document, theme: { ...document.theme, [field]: value } });
    markDirty();
  };

  const toggleGalleryPhoto = (storagePath: string) => {
    if (!galleryPhotoPaths.includes(storagePath) && galleryPhotoPaths.length >= galleryLimit) {
      setPublishError(`Choose up to ${galleryLimit} photos for this gallery layout.`);
      return;
    }
    const paths = galleryPhotoPaths.includes(storagePath)
      ? galleryPhotoPaths.filter(path => path !== storagePath)
      : [...galleryPhotoPaths, storagePath];
    if (!document || !gallery?.id) return;
    setDocument({ ...document, sections: document.sections.map(section => section.id === gallery.id ? { ...section, content: { ...section.content, photo_paths: paths } } : section) });
    markDirty();
  };

  const updateEntourageGroups = (groups: EntourageGroup[]) => {
    if (!document || !entourage?.id) return;
    setDocument({ ...document, sections: document.sections.map(section => section.id === entourage.id ? { ...section, content: { ...section.content, groups } } : section) });
    markDirty();
  };

  const uploadGalleryImage = async (file: File | null) => {
    const hostCode = getHostCode();
    if (!file || !hostCode) return;
    setIsUploadingGalleryImage(true);
    try {
      const asset = await uploadWebsiteAsset(event.id, hostCode, file);
      setWebsiteAssets(current => [asset, ...current]);
      if (!galleryPhotoPaths.includes(asset.storage_path)) toggleGalleryPhoto(asset.storage_path);
    } catch {
      setPublishError('Could not upload the invitation image. Please try again.');
    } finally {
      setIsUploadingGalleryImage(false);
    }
  };

  const deleteGalleryImage = async (asset: WebsiteAsset) => {
    const hostCode = getHostCode();
    if (!hostCode || !document || !gallery?.id) return;
    try {
      await deleteWebsiteAsset(event.id, hostCode, asset.id);
      const paths = galleryPhotoPaths.filter(path => path !== asset.storage_path);
      setWebsiteAssets(current => current.filter(current => current.id !== asset.id));
      setDocument({ ...document, sections: document.sections.map(section => section.id === gallery.id ? { ...section, content: { ...section.content, photo_paths: paths } } : section) });
      markDirty();
      setPreviewedGalleryAsset(null);
    } catch {
      setPublishError('Could not remove the invitation image. Please try again.');
    }
  };

  const toggleSection = (sectionId: string) => {
    if (!document) return;
    setDocument({
      ...document,
      sections: document.sections.map(section => section.id === sectionId ? { ...section, visible: !section.visible } : section),
    });
    markDirty();
  };

  const moveSection = (sectionId: string, direction: -1 | 1) => {
    if (!document) return;
    const index = document.sections.findIndex(section => section.id === sectionId);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= document.sections.length) return;
    const sections = [...document.sections];
    [sections[index], sections[destination]] = [sections[destination], sections[index]];
    setDocument({ ...document, sections });
    markDirty();
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

  const removeCover = async () => {
    const hostCode = getHostCode();
    if (!hostCode || !document) return;
    try {
      const updatedEvent = await deleteEventCover(event.id, hostCode);
      setEvent(updatedEvent);
      updateHero('cover_photo_path', '');
      setIsCoverPreviewOpen(false);
    } catch {
      setPublishError('Could not remove the cover photo. Please try again.');
    }
  };

  const publishWebsite = async () => {
    const hostCode = getHostCode();
    if (!hostCode || !document) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      await saveDraft(document, revision.current);
      const published = await publishEventWebsite(event.id, hostCode, slug);
      setSlug(published.public_slug ?? slug);
    } catch (publishFailure) {
      setPublishError(publishFailure instanceof Error ? publishFailure.message : 'Could not publish invitation website');
    } finally {
      setIsPublishing(false);
    }
  };

  const copyInvitationUrl = async () => {
    const normalizedSlug = slugifyInvitationName(slug);
    if (!normalizedSlug) {
      setPublishError('Add names or a valid invitation URL before copying.');
      return;
    }
    try {
      await copyTextToClipboard(`${window.location.origin}/${normalizedSlug}`);
      showCopySuccessPopup('Invitation URL copied.');
    } catch {
      setPublishError('Could not copy the invitation URL. Please try again.');
    }
  };

  return (
    <main className="website-builder">
      <header className="website-builder-header">
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
        <div className={`website-builder-save-state ${saveState}`} role="status">
          {saveState === 'saving' && <><LoaderCircle size={15} aria-hidden="true" /> Saving draft</>}
          {saveState === 'saved' && <><Check size={15} aria-hidden="true" /> Draft saved</>}
          {saveState === 'error' && <>Could not save invitation draft. Your edits are still here. <button type="button" onClick={() => { if (document) void saveDraft(document, revision.current).catch(saveError => console.error('Could not retry invitation save:', saveError)); }}>Retry save</button></>}
        </div>
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
                <img src={templateSampleImage} alt="" />
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
        <form className={`website-editor-panel ${isEditorCollapsed ? 'collapsed' : ''}`} onSubmit={(submission) => { submission.preventDefault(); publishWebsite(); }}>
          <div className="website-editor-panel-heading">
            <div>
              <p className="website-builder-kicker">Step 2</p>
              <h2>Make it yours</h2>
            </div>
            <LayoutTemplate size={21} aria-hidden="true" />
            <button type="button" className="editor-collapse-button" onClick={() => setIsEditorCollapsed(collapsed => !collapsed)} aria-expanded={!isEditorCollapsed} aria-label={isEditorCollapsed ? 'Expand editor controls' : 'Minimize editor controls'}>{isEditorCollapsed ? <ChevronDown size={20} aria-hidden="true" /> : <ChevronUp size={20} aria-hidden="true" />}</button>
          </div>
          <div className="website-editor-scroll">
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
          {coverPhotoUrl && <div className="website-cover-actions"><button type="button" onClick={() => setIsCoverPreviewOpen(true)}><Eye size={16} aria-hidden="true" /> Preview cover</button><button type="button" onClick={removeCover}><Trash2 size={16} aria-hidden="true" /> Remove cover</button></div>}
          {coverPhotoUrl && <label htmlFor="invitation-cover-position">Photo position
            <select id="invitation-cover-position" value={coverPosition} onChange={(input) => updateHero('cover_position', input.target.value)}>
              <option value="left center">Left</option>
              <option value="center">Center</option>
              <option value="right center">Right</option>
            </select>
          </label>}
          <fieldset className="website-section-fields">
            <legend>Our Story</legend>
            <label htmlFor="invitation-story-title">Section title
              <input id="invitation-story-title" value={contentText(story?.content, 'title')} onChange={(input) => updateSection(story?.id, 'title', input.target.value)} maxLength={80} />
            </label>
            <label htmlFor="invitation-story">Story
              <textarea id="invitation-story" value={contentText(story?.content, 'body')} onChange={(input) => updateSection(story?.id, 'body', input.target.value)} maxLength={800} rows={4} />
            </label>
          </fieldset>
          <fieldset className="website-section-fields">
            <legend>Photo gallery</legend>
            <label htmlFor="invitation-gallery-title">Section title
              <input id="invitation-gallery-title" value={contentText(gallery?.content, 'title')} onChange={(input) => updateSection(gallery?.id, 'title', input.target.value)} maxLength={80} />
            </label>
            <label htmlFor="invitation-gallery-layout">Layout
              <select id="invitation-gallery-layout" value={contentText(gallery?.content, 'layout') || 'grid'} onChange={(input) => updateSection(gallery?.id, 'layout', input.target.value)}>
                <option value="grid">Grid</option>
                <option value="strip">Photo strip</option>
                <option value="carousel">Carousel</option>
              </select>
            </label>
            <label className="website-gallery-upload" htmlFor="invitation-gallery-upload"><span>{isUploadingGalleryImage ? 'Uploading image...' : 'Add invitation photos'}</span><input id="invitation-gallery-upload" type="file" accept="image/jpeg,image/png,image/webp" disabled={isUploadingGalleryImage} onChange={(input) => uploadGalleryImage(input.target.files?.[0] ?? null)} /></label>
            <p className="gallery-selection-count" role="status">{galleryPhotoPaths.length} of {galleryLimit} photos selected</p>
            <div className="website-gallery-picker" aria-label="Select invitation photos for the gallery">
              {websiteAssets.length === 0 ? <p>Upload engagement or pre-wedding photos for this invitation.</p> : websiteAssets.map(asset => <div className={`website-gallery-asset ${galleryPhotoPaths.includes(asset.storage_path) ? 'selected' : ''}`} key={asset.id}><button type="button" className="gallery-asset-select" onClick={() => toggleGalleryPhoto(asset.storage_path)} aria-pressed={galleryPhotoPaths.includes(asset.storage_path)} title={galleryPhotoPaths.includes(asset.storage_path) ? 'Remove from invitation gallery' : 'Add to invitation gallery'}><img src={getPhotoUrl(asset.storage_path)} alt={asset.original_filename} onError={(image) => { image.currentTarget.style.display = 'none'; image.currentTarget.parentElement?.parentElement?.classList.add('unavailable'); }} /><span>{asset.original_filename}</span></button><div className="gallery-asset-actions"><button type="button" onClick={() => setPreviewedGalleryAsset(asset)} aria-label={`Preview ${asset.original_filename}`} title="Preview image"><Eye size={15} aria-hidden="true" /></button><button type="button" onClick={() => deleteGalleryImage(asset)} aria-label={`Delete ${asset.original_filename}`} title="Delete image"><Trash2 size={15} aria-hidden="true" /></button></div></div>)}
            </div>
          </fieldset>
          <fieldset className="website-section-fields">
            <legend>Entourage</legend>
            <label htmlFor="invitation-entourage-title">Section title<input id="invitation-entourage-title" value={contentText(entourage?.content, 'title')} onChange={(input) => updateSection(entourage?.id, 'title', input.target.value)} maxLength={80} /></label>
            <div className="entourage-groups">
              {currentEntourageGroups.map(group => <div className="entourage-group" key={group.id}>
                <label htmlFor={`entourage-title-${group.id}`}>Category<input id={`entourage-title-${group.id}`} value={group.title} onChange={(input) => updateEntourageGroups(currentEntourageGroups.map(current => current.id === group.id ? { ...current, title: input.target.value } : current))} maxLength={80} /></label>
                <label htmlFor={`entourage-members-${group.id}`}>Names, one per line<textarea id={`entourage-members-${group.id}`} value={group.members.join('\n')} onChange={(input) => updateEntourageGroups(currentEntourageGroups.map(current => current.id === group.id ? { ...current, members: input.target.value.split('\n') } : current))} maxLength={800} rows={3} /></label>
                <button type="button" onClick={() => updateEntourageGroups(currentEntourageGroups.filter(current => current.id !== group.id))} disabled={currentEntourageGroups.length === 1} aria-label={`Remove ${group.title}`} title="Remove group"><Trash2 size={16} aria-hidden="true" /> Remove</button>
              </div>)}
              <button type="button" className="add-entourage-group" onClick={() => updateEntourageGroups([...currentEntourageGroups, { id: crypto.randomUUID(), title: 'New Group', members: [] }])}><Plus size={16} aria-hidden="true" /> Add group</button>
            </div>
          </fieldset>
          <fieldset className="website-section-fields">
            <legend>RSVP</legend>
            <label htmlFor="invitation-rsvp-title">Section title<input id="invitation-rsvp-title" value={contentText(rsvp?.content, 'title')} onChange={(input) => updateSection(rsvp?.id, 'title', input.target.value)} maxLength={80} /></label>
            <label htmlFor="invitation-rsvp-button">Button label<input id="invitation-rsvp-button" value={contentText(rsvp?.content, 'button_label')} onChange={(input) => updateSection(rsvp?.id, 'button_label', input.target.value)} maxLength={40} /></label>
          </fieldset>
          <fieldset className="website-section-fields">
            <legend>Event details</legend>
            <label htmlFor="invitation-venue">Venue or reception place
              <input id="invitation-venue" value={contentText(details?.content, 'venue')} onChange={(input) => updateSection(details?.id, 'venue', input.target.value)} maxLength={160} />
            </label>
            <label htmlFor="invitation-venue-time">Venue time
              <input id="invitation-venue-time" value={contentText(details?.content, 'venue_time')} onChange={(input) => updateSection(details?.id, 'venue_time', input.target.value)} maxLength={80} placeholder="e.g. Reception at 6:00 PM" />
            </label>
            <label htmlFor="invitation-venue-directions-url">Venue Google Maps link
              <input id="invitation-venue-directions-url" type="url" inputMode="url" value={contentText(details?.content, 'venue_directions_url')} onChange={(input) => updateSection(details?.id, 'venue_directions_url', input.target.value)} placeholder="https://maps.google.com/..." maxLength={500} />
            </label>
            <label htmlFor="invitation-ceremony-place">Ceremony place
              <input id="invitation-ceremony-place" value={contentText(details?.content, 'ceremony_place')} onChange={(input) => updateSection(details?.id, 'ceremony_place', input.target.value)} maxLength={160} />
            </label>
            <label htmlFor="invitation-ceremony-time">Ceremony time
              <input id="invitation-ceremony-time" value={contentText(details?.content, 'ceremony_time')} onChange={(input) => updateSection(details?.id, 'ceremony_time', input.target.value)} maxLength={80} />
            </label>
            <label htmlFor="invitation-ceremony-directions-url">Ceremony Google Maps link
              <input id="invitation-ceremony-directions-url" type="url" inputMode="url" value={contentText(details?.content, 'ceremony_directions_url')} onChange={(input) => updateSection(details?.id, 'ceremony_directions_url', input.target.value)} placeholder="https://maps.google.com/..." maxLength={500} />
            </label>
          </fieldset>
          <fieldset className="website-section-fields">
            <legend>Closing</legend>
            <label htmlFor="invitation-closing">Message
              <textarea id="invitation-closing" value={contentText(closing?.content, 'message')} onChange={(input) => updateSection(closing?.id, 'message', input.target.value)} maxLength={280} rows={3} />
            </label>
          </fieldset>
          <fieldset className="website-theme-controls">
            <legend>Style</legend>
            <p>Choose a restrained color direction and heading style.</p>
            <span className="website-theme-label">Palette</span>
            <div className="website-palette-options" role="radiogroup" aria-label="Invitation color palette">
              {[
                { id: 'garden', name: 'Garden' },
                { id: 'modern', name: 'Midnight' },
                { id: 'classic', name: 'Heirloom' },
              ].map(option => <button key={option.id} type="button" className={`palette-swatch palette-${option.id} ${document?.theme.palette_id === option.id ? 'selected' : ''}`} onClick={() => updateTheme('palette_id', option.id)} role="radio" aria-checked={document?.theme.palette_id === option.id}><span aria-hidden="true" /><small>{option.name}</small></button>)}
            </div>
            <span className="website-theme-label">Heading style</span>
            <div className="website-font-options" role="radiogroup" aria-label="Invitation heading style">
              {[
                { id: 'modern', name: 'Clean' },
                { id: 'editorial', name: 'Editorial' },
                { id: 'classic', name: 'Classic' },
              ].map(option => <button key={option.id} type="button" className={`font-option font-${option.id} ${document?.theme.font_pair_id === option.id ? 'selected' : ''}`} onClick={() => updateTheme('font_pair_id', option.id)} role="radio" aria-checked={document?.theme.font_pair_id === option.id}>{option.name}</button>)}
            </div>
          </fieldset>
          <fieldset className="website-section-manager">
            <legend>Section order</legend>
            <p>Choose what guests see and arrange the flow of your invitation.</p>
            <div>
              {document?.sections.map((section, index) => (
                <div className="website-section-row" key={section.id}>
                  <span>{section.type === 'hero' ? 'Cover' : section.type === 'rsvp' ? 'RSVP' : section.type}</span>
                  <div>
                    <button type="button" onClick={() => toggleSection(section.id)} aria-label={`${section.visible ? 'Hide' : 'Show'} ${section.type}`} title={section.visible ? 'Hide section' : 'Show section'}>
                      {section.visible ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
                    </button>
                    <button type="button" onClick={() => moveSection(section.id, -1)} disabled={index === 0} aria-label={`Move ${section.type} up`} title="Move up"><ArrowUp size={16} aria-hidden="true" /></button>
                    <button type="button" onClick={() => moveSection(section.id, 1)} disabled={index === document.sections.length - 1} aria-label={`Move ${section.type} down`} title="Move down"><ArrowDown size={16} aria-hidden="true" /></button>
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
          <div className="website-publish-fields">
            <label htmlFor="invitation-slug">Invitation URL
              <span className="website-slug-input"><span>{window.location.host}/</span><input id="invitation-slug" value={slug} onChange={(input) => { setSlug(slugifyInvitationName(input.target.value)); setHasEditedSlug(true); }} required /><button type="button" onClick={copyInvitationUrl} aria-label="Copy invitation URL" title="Copy invitation URL"><Copy size={16} aria-hidden="true" /></button></span>
            </label>
            {publishError && <p className="website-publish-error" role="alert">{publishError}</p>}
            <button type="submit" className="website-publish-button" disabled={isPublishing}>
              <Globe2 size={17} aria-hidden="true" />
              {isPublishing ? 'Publishing...' : 'Publish invitation'}
            </button>
          </div>
          </div>
        </form>

        <div className="website-live-preview" aria-label="Live invitation preview">
          <div className="website-preview-toolbar"><span className="website-preview-label"><Eye size={16} aria-hidden="true" /> Live preview</span><span><button type="button" className={previewMode === 'desktop' ? 'active' : ''} onClick={() => setPreviewMode('desktop')} aria-label="Desktop preview" title="Desktop preview"><Monitor size={17} aria-hidden="true" /></button><button type="button" className={previewMode === 'tablet' ? 'active' : ''} onClick={() => setPreviewMode('tablet')} aria-label="Tablet preview" title="Tablet preview"><Tablet size={17} aria-hidden="true" /></button><button type="button" className={previewMode === 'mobile' ? 'active' : ''} onClick={() => setPreviewMode('mobile')} aria-label="Mobile preview" title="Mobile preview"><Smartphone size={17} aria-hidden="true" /></button></span></div>
          <div className={`invitation-preview-device ${previewMode}`}>{document && <InvitationDocument document={document} eventName={event.name} preview />}</div>
        </div>
      </section>
      <Modal isOpen={Boolean(previewedGalleryAsset)} onClose={() => setPreviewedGalleryAsset(null)} className="website-image-preview-modal">
        {previewedGalleryAsset && <div className="website-image-preview"><img src={getPhotoUrl(previewedGalleryAsset.storage_path)} alt={previewedGalleryAsset.original_filename} /><div><p>{previewedGalleryAsset.original_filename}</p><button type="button" onClick={() => setPreviewedGalleryAsset(null)}><X size={16} aria-hidden="true" /> Close preview</button><button type="button" className="delete-preview-image" onClick={() => deleteGalleryImage(previewedGalleryAsset)}><Trash2 size={16} aria-hidden="true" /> Delete image</button></div></div>}
      </Modal>
      <Modal isOpen={isCoverPreviewOpen} onClose={() => setIsCoverPreviewOpen(false)} className="website-image-preview-modal">
        {coverPhotoUrl && <div className="website-image-preview"><img src={coverPhotoUrl} alt="Invitation cover preview" /><div><p>Cover photo</p><button type="button" onClick={() => setIsCoverPreviewOpen(false)}><X size={16} aria-hidden="true" /> Close preview</button><button type="button" className="delete-preview-image" onClick={removeCover}><Trash2 size={16} aria-hidden="true" /> Remove cover</button></div></div>}
      </Modal>
    </main>
  );
};

export default WebsiteBuilder;