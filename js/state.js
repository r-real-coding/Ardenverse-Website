import { apiGetData } from './api.js';

export let GALLERY    = [];
export let CHARACTERS = [];
export let PLANETS    = [];
export let LORE_CATS  = [];
export let LORE       = [];
export let TAGS       = [];

export async function loadAll() {
  const stores  = ['gallery', 'characters', 'planets', 'loreCategories', 'lore', 'tags'];
  const results = await Promise.allSettled(stores.map(s => apiGetData(s)));
  const [gallery, characters, planets, loreCats, lore, tags] = results.map((r, i) => {
    if (r.status === 'rejected') { console.error(`Failed to load ${stores[i]}:`, r.reason); return null; }
    return r.value;
  });
  GALLERY    = (gallery     || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  CHARACTERS = (characters  || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  PLANETS    = (planets     || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  LORE_CATS  = (loreCats    || []).sort((a, b) => (a.order     || 0) - (b.order     || 0));
  LORE       = (lore        || []).sort((a, b) => (a.title     || '').localeCompare(b.title || ''));
  TAGS       = (tags        || []).sort((a, b) => (a.name      || '').localeCompare(b.name  || ''));
  const failed = results.filter(r => r.status === 'rejected').length;
  if (failed > 0) throw new Error(`${failed} of 6 data stores failed to load`);
}

export function setGallery(arr)    { GALLERY    = arr; }
export function setCharacters(arr) { CHARACTERS = arr; }
export function setPlanets(arr)    { PLANETS    = arr; }
export function setLoreCats(arr)   { LORE_CATS  = arr; }
export function setLore(arr)       { LORE       = arr; }
export function setTags(arr)       { TAGS       = arr; }
