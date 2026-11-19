import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WebsiteAsset } from '../src/services/websiteService';
import { assetsForInvitationSection } from '../src/utils/websiteAssets';

const asset = (id: string, asset_usage: WebsiteAsset['asset_usage']): WebsiteAsset => ({
  id,
  storage_path: `/events/event/website-assets/${id}.jpg`,
  original_filename: `${id}.jpg`,
  asset_usage,
  created_at: '2030-01-01T00:00:00Z',
});

test('new invitation uploads appear only in their chosen image picker', () => {
  const assets = [asset('story', 'story'), asset('gallery', 'gallery'), asset('share', 'share')];
  for (const usage of ['story', 'gallery', 'share'] as const) {
    assert.deepEqual(assetsForInvitationSection(assets, usage, [], [], '').map(item => item.id), [usage]);
  }
});

test('existing shared image references remain editable without exposing legacy uploads everywhere', () => {
  const assets = [asset('old-story', null), asset('old-gallery', null), asset('old-share', null), asset('old-unused', null), asset('old-shared', null)];
  const story = [assets[0].storage_path, assets[4].storage_path];
  const gallery = [assets[1].storage_path, assets[4].storage_path];
  const share = assets[2].storage_path;
  assert.deepEqual(assetsForInvitationSection(assets, 'story', story, gallery, share).map(item => item.id), ['old-story', 'old-shared']);
  assert.deepEqual(assetsForInvitationSection(assets, 'gallery', story, gallery, share).map(item => item.id), ['old-gallery', 'old-unused', 'old-shared']);
  assert.deepEqual(assetsForInvitationSection(assets, 'share', story, gallery, share).map(item => item.id), ['old-share']);
});
