import { FS_GALLERY, FS_TAGS, setFsGallery, setFsTags } from './fanservice-state.js';
import { apiPutData, apiUploadImage, apiDeleteImage, imageUrl, newUuid } from './api.js';
import { esc, showToast, showConfirm, showPrompt, revokeUrl, validateFileSize, notifyDataChanged } from './utils.js';
import { isSubscriber } from './membership.js';

let _filters        = { theme: new Set(), customTag: new Set() };
let _lightboxItems  = [];
let _lightboxIndex  = 0;

// ── Upload modal state ────────────────────────────────────────────────────────
export const mState = {
  file: null, imageKey: null, editUuid: null,
  themes: [], customTags: [], displayTags: [],
  visibility: 'private',
};

// ── Tag population ────────────────────────────────────────────────────────────
export function populateTags() {
  const themeTags  = FS_TAGS.filter(t => t.kind === 'theme');
  const customTags = FS_TAGS.filter(t => t.kind === 'custom');

  document.getElementById('fs-upload-theme-tags').innerHTML =
    themeTags.map(t =>
      `<button class="modal-tag-opt" data-type="theme" data-id="${esc(t.name)}" data-label="${esc(t.name)}">${esc(t.name)}<span class="modal-tag-del" data-del-name="${esc(t.name)}" data-del-kind="theme" title="Delete tag">×</span></button>`
    ).join('') + `<button class="modal-tag-add" data-context="theme">+ New Theme</button>`;

  document.getElementById('fs-upload-custom-tags').innerHTML =
    customTags.map(t =>
      `<button class="modal-tag-opt" data-type="custom" data-id="${esc(t.name)}" data-label="${esc(t.name)}">${esc(t.name)}<span class="modal-tag-del" data-del-name="${esc(t.name)}" data-del-kind="custom" title="Delete tag">×</span></button>`
    ).join('') + `<button class="modal-tag-add" data-context="custom">+ New Tag</button>`;

  document.querySelectorAll('#fsUploadModal .modal-tag-opt').forEach(btn => {
    const { type, id } = btn.dataset;
    const selected =
      (type === 'theme'  && mState.themes.includes(id))     ||
      (type === 'custom' && mState.customTags.includes(id));
    btn.classList.toggle('selected', selected);
  });
}

function _toggleTag(btn) {
  btn.classList.toggle('selected');
  const { type, id, label } = btn.dataset;
  const sel = btn.classList.contains('selected');
  if (type === 'theme')  sel ? mState.themes.push(id)     : (mState.themes     = mState.themes.filter(x => x !== id));
  if (type === 'custom') sel ? mState.customTags.push(id) : (mState.customTags = mState.customTags.filter(x => x !== id));
  if (sel) { if (!mState.displayTags.includes(label)) mState.displayTags.push(label); }
  else mState.displayTags = mState.displayTags.filter(x => x !== label);
}

async function _addTag(context) {
  showPrompt('New Tag', 'Tag name', 'e.g. Fantasy', '', async name => {
    const kind = context === 'theme' ? 'theme' : 'custom';
    if (FS_TAGS.find(t => t.name.toLowerCase() === name.toLowerCase())) {
      showToast('Tag already exists', true); return;
    }
    const tag = { uuid: newUuid(), name, kind, createdAt: Date.now() };
    FS_TAGS.push(tag);
    FS_TAGS.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    setFsTags(FS_TAGS);
    await apiPutData('fanserviceTags', FS_TAGS);
    populateTags();
    showToast('Tag added');
  });
}

// ── Tag deletion ──────────────────────────────────────────────────────────────
async function deleteFsTag(name, kind) {
  const updatedTags = FS_TAGS.filter(t => t.name !== name);
  setFsTags(updatedTags);
  const field = kind === 'theme' ? 'themes' : 'customTags';
  for (const item of FS_GALLERY) {
    if ((item[field] || []).includes(name)) {
      item[field] = item[field].filter(v => v !== name);
      item.tags   = (item.tags || []).filter(v => v !== name);
    }
  }
  try {
    await apiPutData('fanserviceTags', updatedTags);
    await apiPutData('fanservice', FS_GALLERY);
    showToast('Tag deleted');
    notifyDataChanged();
    populateTags();
  } catch {
    showToast('Failed to delete tag — please reload', true);
  }
}

// ── Filter bar ────────────────────────────────────────────────────────────────
function _setCount(id, size) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = size > 0 ? size : '';
  el.classList.toggle('visible', size > 0);
}

export function buildFilterBar() {
  const themeNames = [...new Set([
    ...FS_TAGS.filter(t => t.kind === 'theme').map(t => t.name),
    ...FS_GALLERY.flatMap(g => g.themes || []),
  ])].sort();

  document.getElementById('fs-filter-themes').innerHTML =
    _makeFilterBtn('theme', 'all', 'All', _filters.theme.size === 0)
    + themeNames.map(t => _makeFilterBtn('theme', t, t, _filters.theme.has(t))).join('');
  _setCount('fg-fs-themes-count', _filters.theme.size);

  const customTagNames = [...new Set(FS_GALLERY.flatMap(g => g.customTags || []))].sort();
  const ctEl = document.getElementById('fs-filter-custom-tags');
  if (ctEl) {
    document.getElementById('fg-fs-custom-tags').style.display = customTagNames.length ? '' : 'none';
    ctEl.innerHTML = _makeFilterBtn('customTag', 'all', 'All', _filters.customTag.size === 0)
      + customTagNames.map(t => _makeFilterBtn('customTag', t, t, _filters.customTag.has(t))).join('');
    _setCount('fg-fs-custom-tags-count', _filters.customTag.size);
  }
}

function _makeFilterBtn(type, val, label, active) {
  return `<button class="filter-btn${active ? ' active' : ''}" data-filter-type="${esc(type)}" data-filter-val="${esc(val)}">${esc(label)}</button>`;
}

function _setVisibilityBtn(val) {
  document.querySelectorAll('#fsVisibilityGroup .visibility-radio-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === val);
  });
}

function _toggleFilter(type, val) {
  if (val === 'all') {
    _filters[type].clear();
  } else {
    if (_filters[type].has(val)) _filters[type].delete(val);
    else _filters[type].add(val);
  }
  renderGallery();
  buildFilterBar();
}

// ── Gallery render ────────────────────────────────────────────────────────────
export function renderGallery() {
  const isAdmin  = document.body.classList.contains('admin-mode');
  const isMember = isAdmin || isSubscriber();
  const paywall  = document.getElementById('fs-gallery-paywall');
  const controls = document.getElementById('fs-gallery-controls');
  const count    = document.getElementById('fs-gallery-count');
  const grid     = document.getElementById('fs-gallery-grid');

  // Gallery always visible; paywall becomes a compact "subscribe" banner for non-members
  if (controls) controls.style.display = '';
  if (count)    count.style.display    = '';
  if (grid)     grid.style.display     = '';
  if (paywall) {
    if (isMember) { paywall.style.display = 'none'; paywall.classList.remove('inline'); }
    else          { paywall.style.display = '';     paywall.classList.add('inline'); }
  }

  const search = document.getElementById('fs-gallery-search').value.toLowerCase();

  const items = FS_GALLERY.filter(item => {
    const isLocked = !isMember && item.visibility !== 'public';
    // Locked items always shown (blurred) — skip filtering for them
    if (isLocked) return true;
    if (_filters.theme.size > 0     && !(item.themes     || []).some(v => _filters.theme.has(v)))     return false;
    if (_filters.customTag.size > 0 && !(item.customTags || []).some(v => _filters.customTag.has(v))) return false;
    if (search) {
      const hay = [
        item.title, item.desc,
        ...(item.tags || []), ...(item.themes || []), ...(item.customTags || []),
      ].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  // Lightbox only for items the current user can actually open
  _lightboxItems = items.filter(i => i.imageKey && (isMember || i.visibility === 'public'));
  count.textContent = `Showing ${items.length} of ${FS_GALLERY.length} image${FS_GALLERY.length !== 1 ? 's' : ''}`;

  if (items.length === 0 && !isAdmin) {
    grid.innerHTML = `<div class="empty-state"><div class="big-icon">⬡</div>
      <div style="font-family:'Orbitron',sans-serif;font-size:0.7rem;letter-spacing:0.2em;">No images yet</div></div>`;
    return;
  }

  const html = items.map(item => {
    const isLocked = !isMember && item.visibility !== 'public';
    const lbIdx    = isLocked ? -1 : _lightboxItems.findIndex(x => x.uuid === item.uuid);
    const imgSrc   = item.imageKey ? imageUrl(item.imageKey) : null;
    const visLabel = item.visibility === 'public' ? 'public' : 'private';
    const itemAttrs = isLocked ? '' : (imgSrc
      ? `data-lb-idx="${lbIdx}" role="button" tabindex="0" aria-label="${esc(item.title)}"`
      : 'style="cursor:default;"');
    return `<div class="gallery-item${isLocked ? ' gallery-item--locked' : ''}" data-uuid="${esc(item.uuid)}" ${itemAttrs}>
      ${imgSrc
        ? `<img class="gallery-thumb" src="${esc(imgSrc)}" alt="${esc(item.title)}" loading="lazy" width="400" height="533">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;
            background:var(--bg-elevated);color:var(--text-muted);font-size:0.7rem;
            letter-spacing:0.1em;font-family:'Orbitron',sans-serif;">NO IMAGE</div>`}
      ${isLocked ? `<div class="gallery-item__lock">
        <div class="gallery-item__lock-icon">🔒</div>
        <div class="gallery-item__lock-label">Members Only</div>
      </div>` : ''}
      ${isAdmin ? `<div class="visibility-badge visibility-badge--${esc(visLabel)}">${esc(visLabel)}</div>` : ''}
      <div class="gallery-overlay">
        <div class="gallery-item-title">${esc(item.title)}</div>
        <div class="gallery-item-desc">${esc(item.desc || '')}</div>
        <div class="tag-row">${(item.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      </div>
      <div class="card-admin-bar">
        <button class="card-admin-btn" data-action="edit-img" data-uuid="${esc(item.uuid)}">Edit</button>
        <button class="card-admin-btn del" data-action="del-img" data-uuid="${esc(item.uuid)}" data-title="${esc(item.title)}">Del</button>
      </div>
    </div>`;
  }).join('');

  grid.innerHTML = html;

  if (isAdmin) {
    const addCard = document.createElement('div');
    addCard.className = 'add-card-grid';
    addCard.innerHTML = `<div class="add-icon" style="width:40px;height:40px;font-size:1.3rem;">+</div>
      <div class="add-label" style="font-size:0.65rem;">Add Image</div>`;
    addCard.addEventListener('click', openUploadModal);
    grid.appendChild(addCard);
  }
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
export function openLightbox(idx) {
  if (idx < 0 || idx >= _lightboxItems.length) return;
  _lightboxIndex = idx;
  const item = _lightboxItems[idx];
  const img  = document.getElementById('fs-lightbox-img');
  img.src    = imageUrl(item.imageKey);
  img.alt    = item.title;
  document.getElementById('fs-lightbox-title').textContent = item.title;
  document.getElementById('fs-lightbox-desc').textContent  = item.desc || '';
  document.getElementById('fs-lightbox-tags').innerHTML    = (item.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');
  document.getElementById('fs-lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('fs-lightbox-close').focus();
}

export function closeLightbox() {
  document.getElementById('fs-lightbox').classList.remove('open');
  document.body.style.overflow = '';
}

export function lightboxNav(d) {
  if (!_lightboxItems.length) return;
  openLightbox((_lightboxIndex + d + _lightboxItems.length) % _lightboxItems.length);
}

// ── Upload modal ──────────────────────────────────────────────────────────────
function _modalValidate() {
  const hasFil   = !!(mState.file || mState.imageKey);
  const hasTitle = !!document.getElementById('fsModalTitle').value.trim();
  const setDot   = (id, ok, lbl) => {
    document.getElementById(id).className = 'modal-v-dot' + (ok ? ' ok' : '');
    document.getElementById(id + '-lbl').textContent = lbl;
  };
  setDot('fs-mv-file',  hasFil,   hasFil   ? 'Image ready' : 'No image');
  setDot('fs-mv-title', hasTitle, hasTitle ? 'Title set'   : 'No title');
  document.getElementById('fsModalSubmitBtn').disabled = !(hasFil && hasTitle);
}

function _resetModal() {
  mState.file = null; mState.imageKey = null; mState.editUuid = null;
  mState.themes = []; mState.customTags = []; mState.displayTags = [];
  mState.visibility = 'private';
  _setVisibilityBtn('private');
  document.getElementById('fsModalTitle').value = '';
  document.getElementById('fsModalDesc').value  = '';
  document.getElementById('fsModalPreviewImg').style.display  = 'none';
  document.getElementById('fsModalPreviewImg').src            = '';
  document.getElementById('fsModalPreviewName').style.display = 'none';
  document.getElementById('fsModalDropZone').style.display    = '';
  document.getElementById('fsModalReplaceBtn').classList.remove('visible');
  document.getElementById('fsModalSuccess').classList.remove('visible');
  document.getElementById('fsModalSubmitBtn').classList.remove('saving');
  document.getElementById('fsModalSubmitBtn').disabled        = true;
  document.getElementById('fsImgDeleteBtn').style.display     = 'none';
  document.getElementById('fsUploadModalTitle').textContent   = 'New Image Entry';
  document.getElementById('fsModalSubmitLabel').textContent   = 'Save to Gallery';
  populateTags();
  _modalValidate();
}

export function openUploadModal() {
  _resetModal();
  document.getElementById('fsUploadModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('fsModalTitle').focus(), 50);
}

export function closeUploadModal() {
  const img = document.getElementById('fsModalPreviewImg');
  if (img.src.startsWith('blob:')) revokeUrl(img.src);
  img.src = '';
  document.getElementById('fsUploadModal').classList.remove('open');
  document.body.style.overflow = '';
}

export function openEditImage(itemUuid) {
  const item = FS_GALLERY.find(x => x.uuid === itemUuid);
  if (!item) return;
  _resetModal();
  mState.editUuid   = itemUuid;
  mState.imageKey   = item.imageKey  || null;
  mState.themes     = [...(item.themes     || [])];
  mState.customTags = [...(item.customTags || [])];
  mState.displayTags= [...(item.tags       || [])];
  mState.visibility = item.visibility || 'private';
  _setVisibilityBtn(mState.visibility);
  if (item.imageKey) {
    const img = document.getElementById('fsModalPreviewImg');
    img.src = imageUrl(item.imageKey); img.style.display = 'block';
    document.getElementById('fsModalDropZone').style.display    = 'none';
    document.getElementById('fsModalPreviewName').textContent   = 'Existing image';
    document.getElementById('fsModalPreviewName').style.display = 'block';
    document.getElementById('fsModalReplaceBtn').classList.add('visible');
  }
  document.getElementById('fsModalTitle').value            = item.title || '';
  document.getElementById('fsModalDesc').value             = item.desc  || '';
  document.getElementById('fsUploadModalTitle').textContent= 'Edit Image';
  document.getElementById('fsModalSubmitLabel').textContent= 'Save Changes';
  document.getElementById('fsImgDeleteBtn').style.display  = '';
  populateTags();
  _modalValidate();
  document.getElementById('fsUploadModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function _handleImageFile(file) {
  if (!validateFileSize(file)) return;
  mState.file = file;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('fsModalPreviewImg');
    img.src = e.target.result; img.style.display = 'block';
    document.getElementById('fsModalDropZone').style.display = 'none';
  };
  reader.onerror = () => showToast('Failed to read image file', true);
  reader.readAsDataURL(file);
  document.getElementById('fsModalPreviewName').textContent   = file.name;
  document.getElementById('fsModalPreviewName').style.display = 'block';
  document.getElementById('fsModalReplaceBtn').classList.add('visible');
  _modalValidate();
}

export async function saveImage() {
  const title = document.getElementById('fsModalTitle').value.trim();
  const desc  = document.getElementById('fsModalDesc').value.trim();
  const btn   = document.getElementById('fsModalSubmitBtn');
  btn.classList.add('saving'); btn.disabled = true;

  const existing = mState.editUuid ? FS_GALLERY.find(x => x.uuid === mState.editUuid) : null;
  let imageKey   = mState.imageKey;

  if (mState.file instanceof File) {
    try {
      const newKey = await apiUploadImage(mState.file);
      if (existing?.imageKey && existing.imageKey !== newKey) {
        await apiDeleteImage(existing.imageKey).catch(() => {});
      }
      imageKey = newKey;
    } catch (err) {
      showToast(err.message || 'Image upload failed', true);
      btn.classList.remove('saving'); btn.disabled = false;
      return;
    }
  }

  const entry = {
    uuid:       mState.editUuid || newUuid(),
    title, desc, imageKey,
    visibility: mState.visibility || 'private',
    themes:     [...mState.themes],
    customTags: [...mState.customTags],
    tags:       [...mState.displayTags],
    createdAt:  existing ? existing.createdAt : Date.now(),
  };

  if (mState.editUuid) {
    const idx = FS_GALLERY.findIndex(x => x.uuid === mState.editUuid);
    if (idx >= 0) FS_GALLERY[idx] = entry; else { FS_GALLERY.unshift(entry); FS_GALLERY.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); }
  } else {
    FS_GALLERY.unshift(entry);
    FS_GALLERY.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  try {
    await apiPutData('fanservice', FS_GALLERY);
  } catch {
    showToast('Failed to save gallery', true);
    btn.classList.remove('saving'); btn.disabled = false;
    return;
  }

  btn.classList.remove('saving');
  document.getElementById('fsModalSuccess').classList.add('visible');
  notifyDataChanged();
  showToast(mState.editUuid ? 'Image updated' : 'Image saved');
  setTimeout(closeUploadModal, 1000);
}

export function confirmDeleteImage(itemUuid, title) {
  showConfirm('Delete Image', `Delete "${title}"? This cannot be undone.`, () => deleteImage(itemUuid));
}

export async function deleteImage(itemUuid) {
  const item     = FS_GALLERY.find(x => x.uuid === itemUuid);
  const snapshot = [...FS_GALLERY];
  const updated  = FS_GALLERY.filter(x => x.uuid !== itemUuid);
  setFsGallery(updated);
  try {
    await apiPutData('fanservice', updated);
  } catch {
    setFsGallery(snapshot);
    showToast('Failed to delete — please try again', true);
    notifyDataChanged();
    return;
  }
  if (item?.imageKey) await apiDeleteImage(item.imageKey).catch(() => {});
  notifyDataChanged();
  showToast('Image deleted');
}

export function deleteCurrentImage() {
  const uuid  = mState.editUuid;
  const title = document.getElementById('fsModalTitle').value.trim();
  showConfirm('Delete Image', `Delete "${title}"? This cannot be undone.`, async () => {
    closeUploadModal();
    await deleteImage(uuid);
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initFsGallery() {
  ['fs-filter-themes', 'fs-filter-custom-tags'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', e => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      _toggleFilter(btn.dataset.filterType, btn.dataset.filterVal);
    });
  });

  document.getElementById('fs-gallery-grid').addEventListener('click', e => {
    const adminBtn = e.target.closest('[data-action]');
    if (adminBtn) {
      e.stopPropagation();
      const { action, uuid, title } = adminBtn.dataset;
      if (action === 'edit-img') openEditImage(uuid);
      if (action === 'del-img')  confirmDeleteImage(uuid, title);
      return;
    }
    const card = e.target.closest('.gallery-item[data-lb-idx]');
    if (card) openLightbox(parseInt(card.dataset.lbIdx, 10));
  });

  document.getElementById('fs-lightbox').addEventListener('click', e => {
    if (e.target === document.getElementById('fs-lightbox')) closeLightbox();
  });
  document.getElementById('fs-lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('fs-lightbox-prev').addEventListener('click', () => lightboxNav(-1));
  document.getElementById('fs-lightbox-next').addEventListener('click', () => lightboxNav(1));

  let _touchStartX = 0;
  document.getElementById('fs-lightbox').addEventListener('touchstart', e => {
    _touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });
  document.getElementById('fs-lightbox').addEventListener('touchend', e => {
    const delta = e.changedTouches[0].screenX - _touchStartX;
    if (Math.abs(delta) > 50) lightboxNav(delta < 0 ? 1 : -1);
  }, { passive: true });

  document.getElementById('fs-gallery-grid').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      const card = e.target.closest('.gallery-item[data-lb-idx]');
      if (card) { e.preventDefault(); openLightbox(parseInt(card.dataset.lbIdx, 10)); }
    }
  });

  const drop = document.getElementById('fsModalDropZone');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) _handleImageFile(f);
  });
  document.getElementById('fsModalFileInput').addEventListener('change', e => {
    if (e.target.files[0]) _handleImageFile(e.target.files[0]);
  });
  document.getElementById('fsModalReplaceBtn').addEventListener('click', () => {
    document.getElementById('fsModalFileInput').click();
  });

  document.getElementById('fsModalTitle').addEventListener('input', _modalValidate);
  document.getElementById('fsImgDeleteBtn').addEventListener('click', deleteCurrentImage);
  document.getElementById('fsModalSubmitBtn').addEventListener('click', saveImage);
  document.getElementById('fsUploadModal').querySelector('.close-btn').addEventListener('click', closeUploadModal);
  document.getElementById('fsUploadModal').addEventListener('click', function(e) {
    if (e.target === this) closeUploadModal();
  });

  document.getElementById('fsUploadModal').addEventListener('click', e => {
    const delBtn = e.target.closest('.modal-tag-del');
    if (delBtn) {
      e.stopPropagation();
      const { delName, delKind } = delBtn.dataset;
      showConfirm('Delete Tag', `Delete "${delName}"? It will be removed from all fanservice items.`, () => deleteFsTag(delName, delKind));
      return;
    }
    const opt    = e.target.closest('.modal-tag-opt');
    if (opt) _toggleTag(opt);
    const addBtn = e.target.closest('.modal-tag-add');
    if (addBtn) _addTag(addBtn.dataset.context || 'custom');
  });

  document.getElementById('fs-gallery-search').addEventListener('input', renderGallery);

  document.getElementById('fsVisibilityGroup')?.addEventListener('click', e => {
    const btn = e.target.closest('.visibility-radio-btn');
    if (!btn) return;
    mState.visibility = btn.dataset.val;
    _setVisibilityBtn(btn.dataset.val);
  });
}
