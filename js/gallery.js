import { GALLERY, CHARACTERS, PLANETS, TAGS, setGallery } from './state.js';
import { apiPutData, apiUploadImage, apiDeleteImage, imageUrl, newUuid } from './api.js';
import { esc, showToast, showConfirm, revokeUrl, validateFileSize, notifyDataChanged } from './utils.js';
import { mState, populateUploadTags } from './tags.js';
import { isSubscriber } from './membership.js';

let _filters = { char: 'all', theme: 'all', planet: 'all' };
let _lightboxItems  = [];
let _lightboxIndex  = 0;

// ── Filter bar ────────────────────────────────────────────────────────────────
export function buildFilterBar() {
  const charSlugs  = [...new Set(GALLERY.flatMap(g => g.chars   || []))];
  const charLabels = {};
  CHARACTERS.forEach(c => { charLabels[c.slug] = c.name; });

  document.getElementById('filter-chars').innerHTML =
    makeFilterBtn('char', 'all', 'All', _filters.char === 'all')
    + charSlugs.map(s => makeFilterBtn('char', s, charLabels[s] || s, _filters.char === s)).join('');

  const themeNames = [...new Set([
    ...TAGS.filter(t => t.kind === 'theme').map(t => t.name),
    ...GALLERY.flatMap(g => g.themes || []),
  ])].sort();
  document.getElementById('filter-themes').innerHTML =
    makeFilterBtn('theme', 'all', 'All', _filters.theme === 'all')
    + themeNames.map(t => makeFilterBtn('theme', t, t, _filters.theme === t)).join('');

  const planetSlugs  = [...new Set(GALLERY.flatMap(g => g.planets || []))];
  const planetLabels = {};
  PLANETS.forEach(p => { planetLabels[p.slug] = p.name; });
  document.getElementById('filter-planets').innerHTML =
    makeFilterBtn('planet', 'all', 'All', _filters.planet === 'all')
    + planetSlugs.map(s => makeFilterBtn('planet', s, planetLabels[s] || s, _filters.planet === s)).join('');
}

function makeFilterBtn(type, val, label, active) {
  return `<button class="filter-btn${active ? ' active' : ''}" data-filter-type="${esc(type)}" data-filter-val="${esc(val)}">${esc(label)}</button>`;
}

export function setFilter(type, val) {
  _filters[type] = val;
  renderGallery();
  buildFilterBar();
}

// ── Gallery render ────────────────────────────────────────────────────────────
export function renderGallery() {
  const isAdmin  = document.body.classList.contains('admin-mode');
  const paywall  = document.getElementById('gallery-paywall');
  const controls = document.getElementById('gallery-controls');
  const count    = document.getElementById('gallery-count');
  const grid     = document.getElementById('gallery-grid');

  // Non-subscribers see the paywall; admins always bypass it.
  if (!isAdmin && !isSubscriber()) {
    if (paywall)  paywall.style.display  = '';
    if (controls) controls.style.display = 'none';
    if (count)    count.style.display    = 'none';
    if (grid)     grid.style.display     = 'none';
    return;
  }

  // Subscriber or admin — hide paywall and show content.
  if (paywall)  paywall.style.display  = 'none';
  if (controls) controls.style.display = '';
  if (count)    count.style.display    = '';
  if (grid)     grid.style.display     = '';

  const search  = document.getElementById('gallery-search').value.toLowerCase();

  const items = GALLERY.filter(item => {
    if (_filters.char   !== 'all' && !(item.chars   || []).includes(_filters.char))   return false;
    if (_filters.theme  !== 'all' && !(item.themes  || []).includes(_filters.theme))  return false;
    if (_filters.planet !== 'all' && !(item.planets || []).includes(_filters.planet)) return false;
    if (search) {
      const hay = ((item.title || '') + ' ' + (item.tags || []).join(' ') + ' ' + (item.customTags || []).join(' ')).toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  _lightboxItems = items.filter(i => i.imageKey);
  count.textContent = `Showing ${items.length} of ${GALLERY.length} image${GALLERY.length !== 1 ? 's' : ''}`;

  if (items.length === 0 && !isAdmin) {
    grid.innerHTML = `<div class="empty-state"><div class="big-icon">⬡</div>
      <div style="font-family:'Orbitron',sans-serif;font-size:0.7rem;letter-spacing:0.2em;">No images yet</div></div>`;
    return;
  }

  const html = items.map(item => {
    const lbIdx  = _lightboxItems.findIndex(x => x.uuid === item.uuid);
    const imgSrc = item.imageKey ? imageUrl(item.imageKey) : null;
    return `<div class="gallery-item" data-uuid="${esc(item.uuid)}"
        ${imgSrc ? `data-lb-idx="${lbIdx}"` : 'style="cursor:default;"'}>
      ${imgSrc
        ? `<img class="gallery-thumb" src="${esc(imgSrc)}" alt="${esc(item.title)}" loading="lazy">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;
            background:var(--bg-elevated);color:var(--text-muted);font-size:0.7rem;
            letter-spacing:0.1em;font-family:'Orbitron',sans-serif;">NO IMAGE</div>`}
      <div class="gallery-overlay">
        <div class="gallery-item-title">${esc(item.title)}</div>
        <div class="gallery-item-desc">${esc(item.desc || '')}</div>
        <div class="tag-row">${(() => {
          const charNames   = new Set(CHARACTERS.filter(c => (item.chars   || []).includes(c.slug)).map(c => c.name.toLowerCase()));
          const planetNames = new Set(PLANETS.filter(p => (item.planets || []).includes(p.slug)).map(p => p.name.toLowerCase()));
          return (item.tags || []).map(t => {
            const tl  = t.toLowerCase();
            const cls = charNames.has(tl) ? 'char' : planetNames.has(tl) ? 'planet' : '';
            return `<span class="tag ${cls}">${esc(t)}</span>`;
          }).join('');
        })()}</div>
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
  document.getElementById('lightbox-img').src = imageUrl(item.imageKey);
  document.getElementById('lightbox-title').textContent = item.title;
  document.getElementById('lightbox-desc').textContent  = item.desc || '';
  document.getElementById('lightbox-tags').innerHTML = (item.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');
  document.getElementById('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
}

export function lightboxNav(d) {
  openLightbox((_lightboxIndex + d + _lightboxItems.length) % _lightboxItems.length);
}

// ── Upload modal ──────────────────────────────────────────────────────────────
function _modalValidate() {
  const hasFil   = !!(mState.file || mState.imageKey);
  const hasTitle = !!document.getElementById('modalTitle').value.trim();
  const setDot   = (id, ok, lbl) => {
    document.getElementById(id).className = 'modal-v-dot' + (ok ? ' ok' : '');
    document.getElementById(id + '-lbl').textContent = lbl;
  };
  setDot('mv-file',  hasFil,   hasFil   ? 'Image ready' : 'No image');
  setDot('mv-title', hasTitle, hasTitle ? 'Title set'   : 'No title');
  document.getElementById('modalSubmitBtn').disabled = !(hasFil && hasTitle);
}

function _resetUploadModal() {
  mState.file = null; mState.imageKey = null; mState.editUuid = null;
  mState.chars = []; mState.themes = []; mState.planets = []; mState.customTags = []; mState.displayTags = [];
  document.getElementById('modalTitle').value = '';
  document.getElementById('modalDesc').value  = '';
  document.getElementById('modalPreviewImg').style.display  = 'none';
  document.getElementById('modalPreviewImg').src            = '';
  document.getElementById('modalPreviewName').style.display = 'none';
  document.getElementById('modalDropZone').style.display    = '';
  document.getElementById('modalReplaceBtn').classList.remove('visible');
  document.getElementById('modalSuccess').classList.remove('visible');
  document.getElementById('modalSubmitBtn').classList.remove('saving');
  document.getElementById('modalSubmitBtn').disabled        = true;
  document.getElementById('imgDeleteBtn').style.display     = 'none';
  document.getElementById('uploadModalTitle').textContent   = 'New Image Entry';
  document.getElementById('modalSubmitLabel').textContent   = 'Save to Gallery';
  populateUploadTags();
  _modalValidate();
}

export function openUploadModal() {
  _resetUploadModal();
  document.getElementById('uploadModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeUploadModal() {
  const img = document.getElementById('modalPreviewImg');
  if (img.src.startsWith('blob:')) { revokeUrl(img.src); }
  img.src = '';
  document.getElementById('uploadModal').classList.remove('open');
  document.body.style.overflow = '';
}

export function openEditImage(itemUuid) {
  const item = GALLERY.find(x => x.uuid === itemUuid);
  if (!item) return;
  _resetUploadModal();
  mState.editUuid  = itemUuid;
  mState.imageKey  = item.imageKey  || null;
  mState.chars     = [...(item.chars      || [])];
  mState.themes    = [...(item.themes     || [])];
  mState.planets   = [...(item.planets    || [])];
  mState.customTags= [...(item.customTags || [])];
  mState.displayTags=  [...(item.tags     || [])];
  if (item.imageKey) {
    const img = document.getElementById('modalPreviewImg');
    img.src = imageUrl(item.imageKey); img.style.display = 'block';
    document.getElementById('modalDropZone').style.display    = 'none';
    document.getElementById('modalPreviewName').textContent   = 'Existing image';
    document.getElementById('modalPreviewName').style.display = 'block';
    document.getElementById('modalReplaceBtn').classList.add('visible');
  }
  document.getElementById('modalTitle').value           = item.title || '';
  document.getElementById('modalDesc').value            = item.desc  || '';
  document.getElementById('uploadModalTitle').textContent = 'Edit Image';
  document.getElementById('modalSubmitLabel').textContent = 'Save Changes';
  document.getElementById('imgDeleteBtn').style.display  = '';
  populateUploadTags();
  _modalValidate();
  document.getElementById('uploadModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function _handleImageFile(file) {
  if (!validateFileSize(file)) return;
  mState.file = file;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('modalPreviewImg');
    img.src = e.target.result; img.style.display = 'block';
    document.getElementById('modalDropZone').style.display = 'none';
  };
  reader.onerror = () => showToast('Failed to read image file', true);
  reader.readAsDataURL(file);
  document.getElementById('modalPreviewName').textContent   = file.name;
  document.getElementById('modalPreviewName').style.display = 'block';
  document.getElementById('modalReplaceBtn').classList.add('visible');
  _modalValidate();
}

export async function saveImage() {
  const title = document.getElementById('modalTitle').value.trim();
  const desc  = document.getElementById('modalDesc').value.trim();
  const btn   = document.getElementById('modalSubmitBtn');
  btn.classList.add('saving'); btn.disabled = true;

  const existing = mState.editUuid ? GALLERY.find(x => x.uuid === mState.editUuid) : null;
  let imageKey   = mState.imageKey;

  // Upload new file if one was selected
  if (mState.file instanceof File) {
    try {
      const newKey = await apiUploadImage(mState.file);
      // Delete old image blob when replacing
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
    chars:      [...mState.chars],
    themes:     [...mState.themes],
    planets:    [...mState.planets],
    customTags: [...mState.customTags],
    tags:       [...mState.displayTags],
    createdAt:  existing ? existing.createdAt : Date.now(),
  };

  if (mState.editUuid) {
    const idx = GALLERY.findIndex(x => x.uuid === mState.editUuid);
    if (idx >= 0) GALLERY[idx] = entry; else GALLERY.unshift(entry);
  } else {
    GALLERY.unshift(entry);
    GALLERY.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  try {
    await apiPutData('gallery', GALLERY);
  } catch {
    showToast('Failed to save gallery', true);
    btn.classList.remove('saving'); btn.disabled = false;
    return;
  }

  btn.classList.remove('saving');
  document.getElementById('modalSuccess').classList.add('visible');
  notifyDataChanged();
  showToast(mState.editUuid ? 'Image updated' : 'Image saved');
  setTimeout(closeUploadModal, 1000);
}

export function confirmDeleteImage(itemUuid, title) {
  showConfirm('Delete Image', `Delete "${title}"? This cannot be undone.`, () => deleteImage(itemUuid));
}

export async function deleteImage(itemUuid) {
  const item = GALLERY.find(x => x.uuid === itemUuid);
  if (item?.imageKey) await apiDeleteImage(item.imageKey).catch(() => {});
  const updated = GALLERY.filter(x => x.uuid !== itemUuid);
  setGallery(updated);
  await apiPutData('gallery', updated);
  notifyDataChanged();
  showToast('Image deleted');
}

export function deleteCurrentImage() {
  confirmDeleteImage(mState.editUuid, document.getElementById('modalTitle').value.trim());
  closeUploadModal();
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initGallery() {
  document.getElementById('filter-chars').addEventListener('click',   _filterClick);
  document.getElementById('filter-themes').addEventListener('click',  _filterClick);
  document.getElementById('filter-planets').addEventListener('click', _filterClick);

  document.getElementById('gallery-grid').addEventListener('click', e => {
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

  document.getElementById('lightbox').addEventListener('click', e => {
    if (e.target === document.getElementById('lightbox')) closeLightbox();
  });
  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('lightbox-prev').addEventListener('click', () => lightboxNav(-1));
  document.getElementById('lightbox-next').addEventListener('click', () => lightboxNav(1));

  const drop = document.getElementById('modalDropZone');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) _handleImageFile(f);
  });
  document.getElementById('modalFileInput').addEventListener('change', e => {
    if (e.target.files[0]) _handleImageFile(e.target.files[0]);
  });
  document.getElementById('modalReplaceBtn').addEventListener('click', () => {
    document.getElementById('modalFileInput').click();
  });

  document.getElementById('modalTitle').addEventListener('input', _modalValidate);
  document.getElementById('imgDeleteBtn').addEventListener('click', deleteCurrentImage);
  document.getElementById('modalSubmitBtn').addEventListener('click', saveImage);
  document.getElementById('uploadModal').querySelector('.close-btn').addEventListener('click', closeUploadModal);
  document.getElementById('uploadModal').addEventListener('click', function(e) {
    if (e.target === this) closeUploadModal();
  });

  document.getElementById('gallery-search').addEventListener('input', renderGallery);
}

function _filterClick(e) {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  const { filterType, filterVal } = btn.dataset;
  setFilter(filterType, filterVal);
}
