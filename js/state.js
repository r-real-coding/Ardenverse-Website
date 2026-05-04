import { dbGetAll } from './db.js';

export let GALLERY      = [];
export let CHARACTERS   = [];
export let PLANETS      = [];
export let LORE_CATS    = [];
export let LORE         = [];
export let TAGS         = [];

export async function loadAll() {
  [GALLERY, CHARACTERS, PLANETS, LORE_CATS, LORE, TAGS] = await Promise.all([
    dbGetAll('gallery'),
    dbGetAll('characters'),
    dbGetAll('planets'),
    dbGetAll('loreCategories'),
    dbGetAll('lore'),
    dbGetAll('tags'),
  ]);
  GALLERY.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  CHARACTERS.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  PLANETS.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  LORE_CATS.sort((a, b) => (a.order || 0) - (b.order || 0));
  LORE.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  TAGS.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export function setGallery(arr)    { GALLERY    = arr; }
export function setCharacters(arr) { CHARACTERS = arr; }
export function setPlanets(arr)    { PLANETS    = arr; }
export function setLoreCats(arr)   { LORE_CATS  = arr; }
export function setLore(arr)       { LORE       = arr; }
export function setTags(arr)       { TAGS       = arr; }
