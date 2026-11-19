import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, Check, ChevronDown, ChevronUp, Copy, Eye, EyeOff, Globe2, LayoutTemplate, LoaderCircle, Monitor, Plus, Smartphone, Tablet, Trash2, X } from 'lucide-react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { deleteEventCover, getEventsByHostCode, getPhotoUrl, uploadEventCover } from '../../services/dataService';
import type { Event } from '../../services/dataService';
import { createWebsiteDraft, deleteWebsiteAsset, ensureWebsiteSections, getEventWebsite, getWebsiteAssets, publishEventWebsite, saveEventWebsite, uploadWebsiteAsset } from '../../services/websiteService';
import { invitationSlug, invitationSlugTitle, slugifyInvitationName } from '../../utils/invitationSlug';
import { invitationTimeline } from '../../utils/invitationTimeline';
import type { TimelineEntry } from '../../utils/invitationTimeline';
import { invitationColors } from '../../utils/invitationColors';
import { countdownInputValue, countdownTarget } from '../../utils/invitationCountdown';
import type { InvitationColor } from '../../utils/invitationColors';
import type { WebsiteAsset } from '../../services/websiteService';
import type { WebsiteDocument, WebsiteTemplateId } from '../../services/websiteService';
import { getHostCode } from '../../utils/hostAuth';
import { copyTextToClipboard } from '../../utils/clipboard';
import { useInvitationNotice } from '../../components/useInvitationNotice';
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
  const { success: notifySuccess, error: notifyError } = useInvitationNotice();
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

  useEffect(() => {
    if (error) notifyError(error);
  }, [error, notifyError]);

  useEffect(() => {
    if (saveState === 'error') notifyError('Could not save invitation draft. Your edits are still here.');
  }, [saveState, notifyError]);

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
          setDocument(ensureWebsiteSections(website?.draft_document ?? createWebsiteDraft(ownedEvent.name, ownedEvent.date, 'garden', ownedEvent.cover_photo_path, ownedEvent.start_time), ownedEvent.date, ownedEvent.start_time));
          setWebsiteAssets(assets);
          setSlug(website?.public_slug ? invitationSlugTitle(ownedEvent.id, website.public_slug) : slugifyInvitationName(ownedEvent.name));
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
          font_pair_id: templateId === 'modern' ? 'modern' : 'editorial',
        },
      }
      : createWebsiteDraft(event.name, event.date, templateId, event.cover_photo_path, event.start_time);
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
  const shareTitle = typeof heroContent.share_title === 'string' ? heroContent.share_title : '';
  const shareDescription = typeof heroContent.share_description === 'string' ? heroContent.share_description : '';
  const shareImagePath = typeof heroContent.share_image_path === 'string' ? heroContent.share_image_path : '';
  const coverPhotoPath = typeof heroContent.cover_photo_path === 'string' ? heroContent.cover_photo_path : event.cover_photo_path;
  const coverPhotoUrl = coverPhotoPath ? getPhotoUrl(coverPhotoPath) : undefined;
  const coverPosition = typeof heroContent.cover_position === 'string' ? heroContent.cover_position : 'center';
  const story = document?.sections.find(section => section.type === 'story');
  const countdown = document?.sections.find(section => section.type === 'countdown');
  const details = document?.sections.find(section => section.type === 'details');
  const timelineSection = document?.sections.find(section => section.type === 'timeline');
  const attire = document?.sections.find(section => section.type === 'attire');
  const gifts = document?.sections.find(section => section.type === 'gifts');
  const closing = document?.sections.find(section => section.type === 'closing');
  const gallery = document?.sections.find(section => section.type === 'gallery');
  const entourage = document?.sections.find(section => section.type === 'entourage');
  const rsvp = document?.sections.find(section => section.type === 'rsvp');
  const contentText = (content: Record<string, unknown> | undefined, field: string) => typeof content?.[field] === 'string' ? content[field] as string : '';
  const storyPhotoPaths = Array.isArray(story?.content.photo_paths) ? story.content.photo_paths.filter((path): path is string => typeof path === 'string') : [];
  const galleryPhotoPaths = Array.isArray(gallery?.content.photo_paths) ? gallery.content.photo_paths.filter((path): path is string => typeof path === 'string') : [];
  const galleryLayout = contentText(gallery?.content, 'layout') || 'grid';
  const galleryLimit = galleryLayout === 'strip' || galleryLayout === 'carousel' ? 5 : 6;
  const currentEntourageGroups = entourageGroups(entourage?.content);
  const sponsorGroup = currentEntourageGroups.find(group => group.id === 'sponsors') ?? { id: 'sponsors', title: 'Sponsors', members: [] };
  const partyGroups = currentEntourageGroups.filter(group => group.id !== 'sponsors');
  const timeline = invitationTimeline(timelineSection?.content);
  const attireColors = invitationColors(attire?.content);

  const updateHero = (field: 'couple_names' | 'date' | 'message' | 'cover_photo_path' | 'cover_position' | 'share_title' | 'share_description' | 'share_image_path', value: string) => {
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

  const toggleStoryPhoto = (storagePath: string) => {
    if (!storyPhotoPaths.includes(storagePath) && storyPhotoPaths.length >= 2) {
      notifyError('Choose up to two photos for the Our Story collage.');
      return;
    }
    if (!document || !story?.id) return;
    const paths = storyPhotoPaths.includes(storagePath)
      ? storyPhotoPaths.filter(path => path !== storagePath)
      : [...storyPhotoPaths, storagePath];
    setDocument({ ...document, sections: document.sections.map(section => section.id === story.id ? { ...section, content: { ...section.content, photo_paths: paths } } : section) });
    markDirty();
  };

  const toggleGalleryPhoto = (storagePath: string) => {
    if (!galleryPhotoPaths.includes(storagePath) && galleryPhotoPaths.length >= galleryLimit) {
      notifyError(`Choose up to ${galleryLimit} photos for this gallery layout.`);
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

  const updateSponsorGroup = (group: EntourageGroup) => {
    updateEntourageGroups(currentEntourageGroups.some(current => current.id === 'sponsors')
      ? currentEntourageGroups.map(current => current.id === 'sponsors' ? group : current)
      : [group, ...currentEntourageGroups]);
  };

  const updateTimeline = (entries: TimelineEntry[]) => {
    if (!document || !timelineSection?.id) return;
    setDocument({ ...document, sections: document.sections.map(section => section.id === timelineSection.id
      ? { ...section, content: { ...section.content, timeline: entries } }
      : section) });
    markDirty();
  };

  const updateAttireColors = (colors: InvitationColor[]) => {
    if (!document || !attire?.id) return;
    setDocument({ ...document, sections: document.sections.map(section => section.id === attire.id
      ? { ...section, content: { ...section.content, colors } }
      : section) });
    markDirty();
  };

  const uploadGalleryImage = async (file: File | null, destination: 'gallery' | 'story' = 'gallery') => {
    const hostCode = getHostCode();
    if (!file || !hostCode) return;
    if (destination === 'story' && storyPhotoPaths.length >= 2) {
      notifyError('Remove a story photo before uploading another.');
      return;
    }
    setIsUploadingGalleryImage(true);
    try {
      const asset = await uploadWebsiteAsset(event.id, hostCode, file);
      setWebsiteAssets(current => [asset, ...current]);
      if (destination === 'story') toggleStoryPhoto(asset.storage_path);
      else if (!galleryPhotoPaths.includes(asset.storage_path)) toggleGalleryPhoto(asset.storage_path);
    } catch {
      notifyError('Could not upload the invitation image. Please try again.');
    } finally {
      setIsUploadingGalleryImage(false);
    }
  };

  const uploadShareImage = async (file: File | null) => {
    const hostCode = getHostCode();
    if (!file || !hostCode) return;
    setIsUploadingGalleryImage(true);
    try {
      const asset = await uploadWebsiteAsset(event.id, hostCode, file);
      setWebsiteAssets(current => [asset, ...current]);
      updateHero('share_image_path', asset.storage_path);
    } catch {
      notifyError('Could not upload the link preview image. Please try again.');
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
      setDocument({ ...document, sections: document.sections.map(section => {
        if (section.id === gallery.id) return { ...section, content: { ...section.content, photo_paths: paths } };
        if (section.id === story?.id) return { ...section, content: { ...section.content, photo_paths: storyPhotoPaths.filter(path => path !== asset.storage_path) } };
        if (section.type === 'hero' && shareImagePath === asset.storage_path) return { ...section, content: { ...section.content, share_image_path: '' } };
        return section;
      }) });
      markDirty();
      setPreviewedGalleryAsset(null);
    } catch {
      notifyError('Could not remove the invitation image. Please try again.');
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
    if (index < 0 || destination < 0 || destination >= document.sections.length ||
      document.sections[index].type === 'hero' || document.sections[destination].type === 'hero') return;
    const sections = [...document.sections];
    [sections[index], sections[destination]] = [sections[destination], sections[index]];
    setDocument({ ...document, sections });
    markDirty();
  };

  const uploadCover = async (file: File | null) => {
    const hostCode = getHostCode();
    if (!file || !hostCode) return;

    setIsUploadingCover(true);
    try {
      const updatedEvent = await uploadEventCover(event.id, hostCode, file);
      setEvent(updatedEvent);
      updateHero('cover_photo_path', updatedEvent.cover_photo_path ?? '');
    } catch {
      notifyError('Could not upload the cover photo. Please try again.');
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
      notifyError('Could not remove the cover photo. Please try again.');
    }
  };

  const publishWebsite = async () => {
    const hostCode = getHostCode();
    if (!hostCode || !document) return;
    setIsPublishing(true);
    try {
      await saveDraft(document, revision.current);
      const published = await publishEventWebsite(event.id, hostCode, invitationSlug(event.id, slug));
      setSlug(published.public_slug ? invitationSlugTitle(event.id, published.public_slug) : slug);
      notifySuccess('Invitation website published.');
    } catch (publishFailure) {
      notifyError(publishFailure instanceof Error ? publishFailure.message : 'Could not publish invitation website');
    } finally {
      setIsPublishing(false);
    }
  };

  const copyInvitationUrl = async () => {
    const normalizedSlug = slugifyInvitationName(slug);
    if (!normalizedSlug) {
      notifyError('Add names or a valid invitation URL before copying.');
      return;
    }
    try {
      await copyTextToClipboard(`${window.location.origin}/${invitationSlug(event.id, normalizedSlug)}`);
      notifySuccess('Invitation URL copied.');
    } catch {
      notifyError('Could not copy the invitation URL. Please try again.');
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
        {templates.map((template, index) => {
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
                <span className="template-art-kicker">An invitation to celebrate</span>
                <span className="template-art-names">Avery<br />&amp; Jordan</span>
                <span className="template-art-date">SEPTEMBER 21</span>
                <span className="template-art-mark">A <span>&amp;</span> J</span>
              </span>
              <span className="template-copy">
                <span className="template-copy-index">0{index + 1} / 0{templates.length}</span>
                <strong>{template.name}</strong>
                <small>{template.description}</small>
                <span className="template-copy-action">Explore this look <ArrowUpRight size={18} aria-hidden="true" /></span>
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
            <legend>Shared link preview</legend>
            <p>Set the card shown when guests share the published invitation. Blank text uses your invitation names and message.</p>
            <label htmlFor="invitation-share-title">Preview title
              <input id="invitation-share-title" value={shareTitle} onChange={input => updateHero('share_title', input.target.value)} maxLength={120} placeholder={heroNames} />
            </label>
            <label htmlFor="invitation-share-description">Preview description
              <textarea id="invitation-share-description" value={shareDescription} onChange={input => updateHero('share_description', input.target.value)} maxLength={280} rows={3} placeholder={heroMessage} />
            </label>
            <label htmlFor="invitation-share-image">Preview image
              <select id="invitation-share-image" value={shareImagePath} onChange={input => updateHero('share_image_path', input.target.value)}>
                <option value="">Use cover photo</option>
                {websiteAssets.map(asset => <option key={asset.id} value={asset.storage_path}>{asset.original_filename}</option>)}
              </select>
            </label>
            <label className="website-gallery-upload" htmlFor="invitation-share-upload">
              <span>{isUploadingGalleryImage ? 'Uploading image...' : 'Upload link preview image'}</span>
              <input id="invitation-share-upload" type="file" accept="image/jpeg,image/png,image/webp" disabled={isUploadingGalleryImage} onChange={input => { void uploadShareImage(input.target.files?.[0] ?? null); input.target.value = ''; }} />
            </label>
            {(shareImagePath || coverPhotoUrl) && <img className="website-share-image" src={getPhotoUrl(shareImagePath || coverPhotoPath || '')} alt="Selected link preview" />}
          </fieldset>
          <fieldset className="website-section-fields">
            <legend>Countdown</legend>
            <p>Counts down to the event start, or the event date if no start time was set. Set the exact date and time for guests here.</p>
            <label htmlFor="invitation-countdown-title">Section title
              <input id="invitation-countdown-title" value={contentText(countdown?.content, 'title')} onChange={input => updateSection(countdown?.id, 'title', input.target.value)} maxLength={80} />
            </label>
            <label htmlFor="invitation-countdown-target">Date and time
              <input id="invitation-countdown-target" type="datetime-local" value={countdownInputValue(contentText(countdown?.content, 'target_at'))} onChange={input => updateSection(countdown?.id, 'target_at', countdownTarget(input.target.value))} />
            </label>
          </fieldset>
          <fieldset className="website-section-fields">
            <legend>Our Story</legend>
            <label htmlFor="invitation-story-title">Section title
              <input id="invitation-story-title" value={contentText(story?.content, 'title')} onChange={(input) => updateSection(story?.id, 'title', input.target.value)} maxLength={80} />
            </label>
            <label htmlFor="invitation-story">Story
              <textarea id="invitation-story" value={contentText(story?.content, 'body')} onChange={(input) => updateSection(story?.id, 'body', input.target.value)} maxLength={800} rows={4} />
            </label>
            <p>Add up to two photos for a layered collage below your story. Select them in the order you want them shown.</p>
            <label className="website-gallery-upload" htmlFor="invitation-story-upload"><span>{isUploadingGalleryImage ? 'Uploading image...' : 'Add story photo'}</span><input id="invitation-story-upload" type="file" accept="image/jpeg,image/png,image/webp" disabled={isUploadingGalleryImage} onChange={(input) => { void uploadGalleryImage(input.target.files?.[0] ?? null, 'story'); input.target.value = ''; }} /></label>
            <p className="gallery-selection-count" role="status">{storyPhotoPaths.length} of 2 story photos selected</p>
            <div className="website-gallery-picker" aria-label="Select photos for the Our Story collage">
              {websiteAssets.length === 0 ? <p>Upload photos to add them to your story.</p> : websiteAssets.map(asset => <div className={`website-gallery-asset ${storyPhotoPaths.includes(asset.storage_path) ? 'selected' : ''}`} key={asset.id}>
                <button type="button" className="gallery-asset-select" onClick={() => toggleStoryPhoto(asset.storage_path)} aria-pressed={storyPhotoPaths.includes(asset.storage_path)} aria-label={`${storyPhotoPaths.includes(asset.storage_path) ? 'Remove' : 'Add'} ${asset.original_filename} ${storyPhotoPaths.includes(asset.storage_path) ? 'from' : 'to'} Our Story`}><img src={getPhotoUrl(asset.storage_path)} alt="" /><span>{storyPhotoPaths.includes(asset.storage_path) ? `Photo ${storyPhotoPaths.indexOf(asset.storage_path) + 1} - ` : ''}{asset.original_filename}</span></button>
                <div className="gallery-asset-actions"><button type="button" onClick={() => setPreviewedGalleryAsset(asset)} aria-label={`Preview ${asset.original_filename}`} title="Preview image"><Eye size={15} aria-hidden="true" /></button></div>
              </div>)}
            </div>
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
            <legend>Entourage &amp; sponsors</legend>
            <label htmlFor="invitation-entourage-title">Section title<input id="invitation-entourage-title" value={contentText(entourage?.content, 'title')} onChange={(input) => updateSection(entourage?.id, 'title', input.target.value)} maxLength={80} /></label>
            <div className="entourage-groups">
              {partyGroups.map(group => <div className="entourage-group" key={group.id}>
                <label htmlFor={`entourage-title-${group.id}`}>Category<input id={`entourage-title-${group.id}`} value={group.title} onChange={(input) => updateEntourageGroups(currentEntourageGroups.map(current => current.id === group.id ? { ...current, title: input.target.value } : current))} maxLength={80} /></label>
                <label htmlFor={`entourage-members-${group.id}`}>Names, one per line<textarea id={`entourage-members-${group.id}`} value={group.members.join('\n')} onChange={(input) => updateEntourageGroups(currentEntourageGroups.map(current => current.id === group.id ? { ...current, members: input.target.value.split('\n') } : current))} maxLength={800} rows={3} /></label>
                <button type="button" onClick={() => updateEntourageGroups(currentEntourageGroups.filter(current => current.id !== group.id))} aria-label={`Remove ${group.title}`} title="Remove group"><Trash2 size={16} aria-hidden="true" /> Remove</button>
              </div>)}
              <button type="button" className="add-entourage-group" onClick={() => updateEntourageGroups([...currentEntourageGroups, { id: crypto.randomUUID(), title: 'New Group', members: [] }])}><Plus size={16} aria-hidden="true" /> Add group</button>
            </div>
            <div className="entourage-sponsors-fields">
              <span className="website-detail-heading">Sponsors</span>
              <label htmlFor="invitation-sponsors-title">Heading
                <input id="invitation-sponsors-title" value={sponsorGroup.title} onChange={input => updateSponsorGroup({ ...sponsorGroup, title: input.target.value })} maxLength={80} />
              </label>
              <label htmlFor="invitation-sponsors-members">Names, one per line
                <textarea id="invitation-sponsors-members" value={sponsorGroup.members.join('\n')} onChange={input => updateSponsorGroup({ ...sponsorGroup, members: input.target.value.split('\n') })} maxLength={800} rows={4} />
              </label>
            </div>
          </fieldset>
          <fieldset className="website-section-fields">
            <legend>RSVP</legend>
            <label htmlFor="invitation-rsvp-title">Section title<input id="invitation-rsvp-title" value={contentText(rsvp?.content, 'title')} onChange={(input) => updateSection(rsvp?.id, 'title', input.target.value)} maxLength={80} /></label>
            <label htmlFor="invitation-rsvp-button">Button label<input id="invitation-rsvp-button" value={contentText(rsvp?.content, 'button_label')} onChange={(input) => updateSection(rsvp?.id, 'button_label', input.target.value)} maxLength={40} /></label>
          </fieldset>
          <fieldset className="website-section-fields">
            <legend>Event details</legend>
            <label htmlFor="invitation-ceremony-place">Ceremony place
              <input id="invitation-ceremony-place" value={contentText(details?.content, 'ceremony_place')} onChange={(input) => updateSection(details?.id, 'ceremony_place', input.target.value)} maxLength={160} />
            </label>
            <label htmlFor="invitation-ceremony-time">Ceremony time
              <input id="invitation-ceremony-time" value={contentText(details?.content, 'ceremony_time')} onChange={(input) => updateSection(details?.id, 'ceremony_time', input.target.value)} maxLength={80} />
            </label>
            <label htmlFor="invitation-ceremony-directions-url">Ceremony Google Maps link
              <input id="invitation-ceremony-directions-url" type="url" inputMode="url" value={contentText(details?.content, 'ceremony_directions_url')} onChange={(input) => updateSection(details?.id, 'ceremony_directions_url', input.target.value)} placeholder="https://maps.google.com/..." maxLength={500} />
            </label>
            <label htmlFor="invitation-venue">Venue or reception place
              <input id="invitation-venue" value={contentText(details?.content, 'venue')} onChange={(input) => updateSection(details?.id, 'venue', input.target.value)} maxLength={160} />
            </label>
            <label htmlFor="invitation-venue-time">Venue time
              <input id="invitation-venue-time" value={contentText(details?.content, 'venue_time')} onChange={(input) => updateSection(details?.id, 'venue_time', input.target.value)} maxLength={80} placeholder="e.g. Reception at 6:00 PM" />
            </label>
            <label htmlFor="invitation-venue-directions-url">Venue Google Maps link
              <input id="invitation-venue-directions-url" type="url" inputMode="url" value={contentText(details?.content, 'venue_directions_url')} onChange={(input) => updateSection(details?.id, 'venue_directions_url', input.target.value)} placeholder="https://maps.google.com/..." maxLength={500} />
            </label>
          </fieldset>
          <fieldset className="website-section-fields">
            <legend>Timeline</legend>
            <label htmlFor="invitation-timeline-title">Section title
              <input id="invitation-timeline-title" value={contentText(timelineSection?.content, 'title')} onChange={input => updateSection(timelineSection?.id, 'title', input.target.value)} maxLength={80} />
            </label>
            <div className="website-detail-group">
              {timeline.map((entry, index) => <div className="website-timeline-entry" key={entry.id}>
                <label htmlFor={`timeline-time-${entry.id}`}>Time
                  <input id={`timeline-time-${entry.id}`} value={entry.time} onChange={input => updateTimeline(timeline.map(item => item.id === entry.id ? { ...item, time: input.target.value } : item))} maxLength={80} placeholder="e.g. 3:00 PM" />
                </label>
                <label htmlFor={`timeline-title-${entry.id}`}>Event name
                  <input id={`timeline-title-${entry.id}`} value={entry.title} onChange={input => updateTimeline(timeline.map(item => item.id === entry.id ? { ...item, title: input.target.value } : item))} maxLength={120} placeholder="e.g. Ceremony" />
                </label>
                <label htmlFor={`timeline-details-${entry.id}`}>Details (optional)
                  <textarea id={`timeline-details-${entry.id}`} value={entry.details ?? ''} onChange={input => updateTimeline(timeline.map(item => item.id === entry.id ? { ...item, details: input.target.value } : item))} maxLength={400} rows={2} placeholder="e.g. Please arrive 15 minutes early" />
                </label>
                <div className="website-timeline-actions">
                  <button type="button" disabled={index === 0} onClick={() => { const entries = [...timeline]; [entries[index - 1], entries[index]] = [entries[index], entries[index - 1]]; updateTimeline(entries); }} aria-label={`Move timeline item ${index + 1} up`}><ArrowUp size={16} aria-hidden="true" /></button>
                  <button type="button" disabled={index === timeline.length - 1} onClick={() => { const entries = [...timeline]; [entries[index + 1], entries[index]] = [entries[index], entries[index + 1]]; updateTimeline(entries); }} aria-label={`Move timeline item ${index + 1} down`}><ArrowDown size={16} aria-hidden="true" /></button>
                  <button type="button" onClick={() => updateTimeline(timeline.filter(item => item.id !== entry.id))} aria-label={`Remove timeline item ${index + 1}`}><Trash2 size={16} aria-hidden="true" /> Remove</button>
                </div>
              </div>)}
              <button type="button" className="add-entourage-group" onClick={() => updateTimeline([...timeline, { id: crypto.randomUUID(), time: '', title: '', details: '' }])}><Plus size={16} aria-hidden="true" /> Add timeline item</button>
            </div>
          </fieldset>
          <fieldset className="website-section-fields">
            <legend>Clothing motif &amp; colors</legend>
            <label htmlFor="invitation-attire-title">Section title
              <input id="invitation-attire-title" value={contentText(attire?.content, 'title')} onChange={input => updateSection(attire?.id, 'title', input.target.value)} maxLength={80} />
            </label>
            <label htmlFor="invitation-attire-motif">Clothing motif or dress code
              <input id="invitation-attire-motif" value={contentText(attire?.content, 'motif')} onChange={input => updateSection(attire?.id, 'motif', input.target.value)} maxLength={160} placeholder="e.g. Garden formal" />
            </label>
            <label htmlFor="invitation-attire-colors">Color guidance (optional)
              <input id="invitation-attire-colors" value={contentText(attire?.content, 'color_note')} onChange={input => updateSection(attire?.id, 'color_note', input.target.value)} maxLength={160} placeholder="e.g. Sage, cream, and blush" />
            </label>
            <div className="website-attire-palette">
              <span className="website-detail-heading">Clothing color palette</span>
              {attireColors.map((color, index) => <div className="website-attire-color" key={index}>
                <label htmlFor={`attire-color-${index}`}>Color {index + 1}
                  <input id={`attire-color-${index}`} type="color" value={color.hex} onChange={input => updateAttireColors(attireColors.map((current, position) => position === index ? { ...current, hex: input.target.value } : current))} />
                </label>
                <label htmlFor={`attire-color-name-${index}`}>Name (optional)
                  <input id={`attire-color-name-${index}`} value={color.name} onChange={input => updateAttireColors(attireColors.map((current, position) => position === index ? { ...current, name: input.target.value } : current))} maxLength={40} placeholder="e.g. Sage" />
                </label>
                <button type="button" onClick={() => updateAttireColors(attireColors.filter((_, position) => position !== index))} aria-label={`Remove color ${index + 1}`}><Trash2 size={16} aria-hidden="true" /></button>
              </div>)}
              <button type="button" className="add-entourage-group" disabled={attireColors.length >= 6} onClick={() => updateAttireColors([...attireColors, { hex: '#8a9b79', name: '' }])}><Plus size={16} aria-hidden="true" /> Add color</button>
            </div>
          </fieldset>
          <fieldset className="website-section-fields">
            <legend>Gift instructions</legend>
            <label htmlFor="invitation-gifts-title">Section title
              <input id="invitation-gifts-title" value={contentText(gifts?.content, 'title')} onChange={input => updateSection(gifts?.id, 'title', input.target.value)} maxLength={80} />
            </label>
            <label htmlFor="invitation-gifts-instructions">Gift direction or instructions
              <textarea id="invitation-gifts-instructions" value={contentText(gifts?.content, 'instructions')} onChange={input => updateSection(gifts?.id, 'instructions', input.target.value)} maxLength={800} rows={4} placeholder="Share your gift preferences with guests" />
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
                  <span>{section.type === 'hero' ? 'Cover' : section.type === 'countdown' ? 'Countdown' : section.type === 'rsvp' ? 'RSVP' : section.type === 'attire' ? 'Clothing motif & colors' : section.type === 'gifts' ? 'Gift instructions' : section.type === 'timeline' ? 'Timeline' : section.type}</span>
                  <div>
                    <button type="button" onClick={() => toggleSection(section.id)} aria-label={`${section.visible ? 'Hide' : 'Show'} ${section.type}`} title={section.visible ? 'Hide section' : 'Show section'}>
                      {section.visible ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
                    </button>
                    <button type="button" onClick={() => moveSection(section.id, -1)} disabled={index === 0 || section.type === 'hero' || document.sections[index - 1]?.type === 'hero'} aria-label={`Move ${section.type} up`} title="Move up"><ArrowUp size={16} aria-hidden="true" /></button>
                    <button type="button" onClick={() => moveSection(section.id, 1)} disabled={index === document.sections.length - 1 || section.type === 'hero' || document.sections[index + 1]?.type === 'hero'} aria-label={`Move ${section.type} down`} title="Move down"><ArrowDown size={16} aria-hidden="true" /></button>
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
          <div className="website-publish-fields">
            <label htmlFor="invitation-slug">Invitation URL
              <span className="website-slug-input"><span title={`${window.location.host}/${event.id}-`}>{window.location.host}/{event.id}-</span><input id="invitation-slug" value={slug} maxLength={83} onChange={(input) => { setSlug(slugifyInvitationName(input.target.value)); setHasEditedSlug(true); }} required /><button type="button" onClick={copyInvitationUrl} aria-label="Copy invitation URL" title="Copy invitation URL"><Copy size={16} aria-hidden="true" /></button></span>
            </label>
            <button type="submit" className="website-publish-button" disabled={isPublishing}>
              <Globe2 size={17} aria-hidden="true" />
              {isPublishing ? 'Publishing...' : 'Publish invitation'}
            </button>
          </div>
          </div>
        </form>

        <div className="website-live-preview" aria-label="Live invitation preview">
          <div className="website-preview-toolbar"><span className="website-preview-label"><Eye size={16} aria-hidden="true" /> Live preview</span><span><button type="button" className={previewMode === 'desktop' ? 'active' : ''} onClick={() => setPreviewMode('desktop')} aria-label="Desktop preview" title="Desktop preview"><Monitor size={17} aria-hidden="true" /></button><button type="button" className={previewMode === 'tablet' ? 'active' : ''} onClick={() => setPreviewMode('tablet')} aria-label="Tablet preview" title="Tablet preview"><Tablet size={17} aria-hidden="true" /></button><button type="button" className={previewMode === 'mobile' ? 'active' : ''} onClick={() => setPreviewMode('mobile')} aria-label="Mobile preview" title="Mobile preview"><Smartphone size={17} aria-hidden="true" /></button></span></div>
          <div className={`invitation-preview-device ${previewMode}`} tabIndex={0} aria-label={`${previewMode} invitation preview; scroll to see all sections`}>{document && <InvitationDocument document={document} eventName={event.name} preview />}</div>
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