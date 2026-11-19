import type { WebsiteAsset, WebsiteAssetUsage } from '../services/websiteService';

export const assetsForInvitationSection = (
  assets: WebsiteAsset[],
  usage: WebsiteAssetUsage,
  storyPaths: string[],
  galleryPaths: string[],
  sharePath: string,
): WebsiteAsset[] => assets.filter(asset => {
  if (asset.asset_usage !== null) return asset.asset_usage === usage;
  const path = asset.storage_path;
  const inStory = storyPaths.includes(path);
  const inGallery = galleryPaths.includes(path);
  const inShare = sharePath === path;
  if (usage === 'story') return inStory;
  if (usage === 'share') return inShare;
  return inGallery || (!inStory && !inShare);
});
