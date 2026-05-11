import { apiGetData } from './api.js';

export let FS_GALLERY = [];
export let FS_TAGS    = [];

export async function loadFanservice() {
  const [gallery, tags] = await Promise.allSettled([
    apiGetData('fanservice'),
    apiGetData('fanserviceTags'),
  ]);
  FS_GALLERY = ((gallery.status === 'fulfilled' ? gallery.value : null) || [])
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  FS_TAGS    = ((tags.status    === 'fulfilled' ? tags.value    : null) || [])
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export function setFsGallery(arr) { FS_GALLERY = arr; }
export function setFsTags(arr)    { FS_TAGS    = arr; }
