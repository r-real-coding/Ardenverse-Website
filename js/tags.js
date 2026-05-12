import { CHARACTERS, PLANETS, TAGS, setTags, GALLERY, LORE, setLore } from './state.js';
import { apiPutData, newUuid } from './api.js';
import { esc, showToast, showPrompt, showConfirm, notifyDataChanged } from './utils.js';

// Gallery upload modal state (shared with gallery.js)
export const mState = {
  file: null, imageKey: null, editUuid: null,
  chars: [], themes: [], planets: [], customTags: [], displayTags: [],
  setFiles: [], setImageKeys: [],
};

export function populateUploadTags() {
  document.getElementById('upload-char-tags').innerHTML =
    CHARACTERS.map(c =>
      `<button class="modal-tag-opt char" data-type="char" data-id="${esc(c.slug)}" data-label="${esc(c.name)}">${esc(c.name)}</button>`
    ).join('');

  const themeTags = TAGS.filter(t => t.kind === 'theme');
  document.getElementById('upload-theme-tags').innerHTML =
    themeTags.map(t =>
      `<button class="modal-tag-opt" data-type="theme" data-id="${esc(t.name)}" data-label="${esc(t.name)}">${esc(t.name)}<span class="modal-tag-del" data-del-name="${esc(t.name)}" data-del-kind="theme" title="Delete tag">×</span></button>`
    ).join('')
    + `<button class="modal-tag-add" data-context="upload-theme">+ New Theme</button>`;

  document.getElementById('upload-planet-tags').innerHTML =
    PLANETS.map(p =>
      `<button class="modal-tag-opt planet" data-type="planet" data-id="${esc(p.slug)}" data-label="${esc(p.name)}">${esc(p.name)}</button>`
    ).join('');

  const custTags = TAGS.filter(t => t.kind === 'custom');
  document.getElementById('upload-custom-tags').innerHTML =
    custTags.map(t =>
      `<button class="modal-tag-opt" data-type="custom" data-id="${esc(t.name)}" data-label="${esc(t.name)}">${esc(t.name)}<span class="modal-tag-del" data-del-name="${esc(t.name)}" data-del-kind="custom" title="Delete tag">×</span></button>`
    ).join('')
    + `<button class="modal-tag-add" data-context="upload-custom">+ New Tag</button>`;

  document.querySelectorAll('#uploadModal .modal-tag-opt').forEach(btn => {
    const { type, id } = btn.dataset;
    const selected =
      (type === 'char'   && mState.chars.includes(id))      ||
      (type === 'theme'  && mState.themes.includes(id))     ||
      (type === 'planet' && mState.planets.includes(id))    ||
      (type === 'custom' && mState.customTags.includes(id));
    btn.classList.toggle('selected', selected);
  });
}

export function modalToggleTag(btn) {
  btn.classList.toggle('selected');
  const { type, id, label } = btn.dataset;
  const sel = btn.classList.contains('selected');
  if (type === 'char')   sel ? mState.chars.push(id)      : (mState.chars      = mState.chars.filter(x => x !== id));
  if (type === 'theme')  sel ? mState.themes.push(id)     : (mState.themes     = mState.themes.filter(x => x !== id));
  if (type === 'planet') sel ? mState.planets.push(id)    : (mState.planets    = mState.planets.filter(x => x !== id));
  if (type === 'custom') sel ? mState.customTags.push(id) : (mState.customTags = mState.customTags.filter(x => x !== id));
  if (sel) { if (!mState.displayTags.includes(label)) mState.displayTags.push(label); }
  else mState.displayTags = mState.displayTags.filter(x => x !== label);
}

// Lore tag state
export const lState = { tags: [] };

export function populateLoreCustomTags() {
  const customTags = TAGS.filter(t => t.kind === 'custom');
  const container  = document.getElementById('lore-custom-tags');
  container.innerHTML =
    customTags.map(t =>
      `<button class="modal-tag-opt" data-name="${esc(t.name)}">${esc(t.name)}<span class="modal-tag-del" data-del-name="${esc(t.name)}" data-del-kind="custom" title="Delete tag">×</span></button>`
    ).join('')
    + `<button class="modal-tag-add" data-context="lore">+ New Tag</button>`;
  container.querySelectorAll('.modal-tag-opt').forEach(btn => {
    btn.classList.toggle('selected', lState.tags.includes(btn.dataset.name));
  });
}

export function loreToggleTag(btn) {
  btn.classList.toggle('selected');
  const name = btn.dataset.name;
  if (btn.classList.contains('selected')) {
    if (!lState.tags.includes(name)) lState.tags.push(name);
  } else {
    lState.tags = lState.tags.filter(x => x !== name);
  }
}

export async function deleteTag(name, kind) {
  const updatedTags = TAGS.filter(t => t.name !== name);
  setTags(updatedTags);

  const field = kind === 'theme' ? 'themes' : 'customTags';
  for (const item of GALLERY) {
    item[field] = (item[field] || []).filter(v => v !== name);
    item.tags   = (item.tags   || []).filter(v => v !== name);
  }
  if (kind === 'custom') {
    for (const entry of LORE) {
      if ((entry.tags || []).includes(name)) entry.tags = entry.tags.filter(v => v !== name);
    }
  }

  try {
    await apiPutData('tags', updatedTags);
    await apiPutData('gallery', GALLERY);
    if (kind === 'custom') await apiPutData('lore', LORE);
    showToast('Tag deleted');
    notifyDataChanged();
    populateUploadTags();
    populateLoreCustomTags();
  } catch {
    showToast('Failed to delete tag — please reload', true);
  }
}

export async function addCustomTagInline(context) {
  showPrompt('New Tag', 'Tag name (will be available everywhere)', 'e.g. Mystery', '', async name => {
    const kind     = context === 'upload-theme' ? 'theme' : 'custom';
    const existing = TAGS.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (existing) { showToast('Tag already exists', true); return; }
    const tag = { uuid: newUuid(), name, kind, createdAt: Date.now() };
    TAGS.push(tag);
    TAGS.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    setTags(TAGS);
    await apiPutData('tags', TAGS);
    if (context === 'lore') populateLoreCustomTags();
    else populateUploadTags();
    showToast('Tag added');
  });
}

export function initTags() {
  document.getElementById('uploadModal').addEventListener('click', e => {
    const delBtn = e.target.closest('.modal-tag-del');
    if (delBtn && delBtn.closest('#uploadModal')) {
      e.stopPropagation();
      const { delName, delKind } = delBtn.dataset;
      showConfirm('Delete Tag', `Delete "${delName}"? It will be removed from all gallery and lore entries.`, () => deleteTag(delName, delKind));
      return;
    }
    const opt    = e.target.closest('.modal-tag-opt');
    if (opt && opt.closest('#uploadModal')) modalToggleTag(opt);
    const addBtn = e.target.closest('.modal-tag-add');
    if (addBtn && addBtn.closest('#uploadModal')) addCustomTagInline(addBtn.dataset.context || 'upload-custom');
  });

  document.getElementById('lore-custom-tags').addEventListener('click', e => {
    const delBtn = e.target.closest('.modal-tag-del');
    if (delBtn) {
      e.stopPropagation();
      const { delName, delKind } = delBtn.dataset;
      showConfirm('Delete Tag', `Delete "${delName}"? It will be removed from all gallery and lore entries.`, () => deleteTag(delName, delKind));
      return;
    }
    const opt    = e.target.closest('.modal-tag-opt');
    if (opt) loreToggleTag(opt);
    const addBtn = e.target.closest('.modal-tag-add');
    if (addBtn) addCustomTagInline('lore');
  });
}
