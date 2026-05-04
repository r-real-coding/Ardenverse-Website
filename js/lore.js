import { LORE_CATS, LORE, TAGS, setLore, setLoreCats } from './state.js';
import { dbPut, dbDelete, dbDeleteMany, newUuid } from './db.js';
import { esc, showToast, showConfirm, showPrompt, notifyDataChanged } from './utils.js';
import { md } from './markdown.js';
import { lState, populateLoreCustomTags } from './tags.js';

let _activeLoreUuid = null;
let _expandedCats   = new Set();
let _editingLoreUuid = null;

// ── Sidebar render ────────────────────────────────────────────────────────────
export function renderLoreSidebar() {
  const search  = (document.getElementById('lore-search').value || '').toLowerCase();
  const sidebar = document.getElementById('lore-sidebar');

  const html = LORE_CATS.map(cat => {
    let entries = LORE.filter(l => l.categoryUuid === cat.uuid);
    if (search) {
      entries = entries.filter(e =>
        ((e.title || '') + ' ' + (e.customTags || []).join(' ') + ' ' + (e.content || ''))
          .toLowerCase().includes(search)
      );
      if (entries.length > 0) _expandedCats.add(cat.uuid);
    }
    const isExp = _expandedCats.has(cat.uuid) || !!search;
    return `<div class="lore-cat-group ${isExp ? 'expanded' : ''}">
      <button class="lore-cat ${isExp ? 'expanded' : ''}" data-cat-uuid="${esc(cat.uuid)}">
        <span class="lore-cat-name">${esc(cat.name)}</span>
        <span class="lore-cat-count">${entries.length}</span>
        <span class="lore-cat-arrow">▶</span>
      </button>
      <div class="lore-entries-list">
        ${entries.map(e =>
          `<button class="lore-entry-link${_activeLoreUuid === e.uuid ? ' active' : ''}" data-entry-uuid="${esc(e.uuid)}">${esc(e.title)}</button>`
        ).join('')}
        ${entries.length === 0 && !search ? '<div class="lore-empty-cat">No entries</div>' : ''}
        <button class="lore-add-entry" data-action="add-entry" data-cat-uuid="${esc(cat.uuid)}">+ Add Entry</button>
        <button class="lore-add-entry" style="color:var(--text-muted);" data-action="rename-cat" data-cat-uuid="${esc(cat.uuid)}">↻ Rename Category</button>
        <button class="lore-add-entry" style="color:#e87070;" data-action="del-cat" data-cat-uuid="${esc(cat.uuid)}" data-cat-name="${esc(cat.name)}" data-entry-count="${entries.length}">✕ Delete Category</button>
      </div>
    </div>`;
  }).join('');

  sidebar.innerHTML = html;
}

export function toggleCat(catUuid) {
  if (_expandedCats.has(catUuid)) _expandedCats.delete(catUuid);
  else _expandedCats.add(catUuid);
  renderLoreSidebar();
}

// ── Entry view ────────────────────────────────────────────────────────────────
export function openLoreEntry(loreUuid) {
  const entry = LORE.find(l => l.uuid === loreUuid);
  if (!entry) return;
  _activeLoreUuid = loreUuid;
  _expandedCats.add(entry.categoryUuid);
  renderLoreSidebar();
  const cat     = LORE_CATS.find(c => c.uuid === entry.categoryUuid);
  const isAdmin = document.body.classList.contains('admin-mode');
  document.getElementById('lore-content').innerHTML = `
    <div class="lore-entry-view">
      <div class="lore-entry-hero">
        <div class="lore-breadcrumb">
          <span>Wiki</span>
          <span class="lore-breadcrumb-sep">›</span>
          <span class="lore-breadcrumb-cat">${esc(cat ? cat.name : 'Uncategorized')}</span>
        </div>
        <h1 class="lore-entry-title">${esc(entry.title)}</h1>
        <div class="lore-entry-meta-row">
          <span class="lore-entry-meta-text">${esc(entry.meta || '')}</span>
          <div class="lore-entry-admin">
            <button data-action="edit-lore" data-uuid="${esc(entry.uuid)}">Edit</button>
            <button class="del" data-action="del-lore" data-uuid="${esc(entry.uuid)}" data-title="${esc(entry.title)}">Delete</button>
          </div>
        </div>
      </div>
      <div class="lore-entry-body-wrap">
        ${(entry.customTags || []).length
          ? `<div class="lore-entry-tags">${(entry.customTags || []).map(t => `<span class="tag theme">${esc(t)}</span>`).join('')}</div>`
          : ''}
        <div class="lore-entry-body">${md(entry.content || '')}</div>
      </div>
    </div>`;
  document.getElementById('lore-nav')?.classList.remove('open');
  document.getElementById('lore-sidebar-overlay')?.classList.remove('visible');
}

// ── Category management ───────────────────────────────────────────────────────
export async function addLoreCategory() {
  showPrompt('New Wiki Category', 'Name for the new category', 'e.g. Religions', '', async name => {
    const cat = { uuid: newUuid(), name, order: LORE_CATS.length, createdAt: Date.now() };
    await dbPut('loreCategories', cat);
    LORE_CATS.push(cat);
    LORE_CATS.sort((a, b) => (a.order || 0) - (b.order || 0));
    renderLoreSidebar();
    showToast('Category added');
  });
}

export function renameLoreCategory(catUuid) {
  const cat = LORE_CATS.find(c => c.uuid === catUuid);
  if (!cat) return;
  showPrompt('Rename Category', 'New name for this category', '', cat.name, async name => {
    cat.name = name;
    await dbPut('loreCategories', cat);
    renderLoreSidebar();
    if (_activeLoreUuid) openLoreEntry(_activeLoreUuid);
    showToast('Category renamed');
  });
}

export function confirmDeleteLoreCat(catUuid, name, entryCount) {
  const msg = entryCount > 0
    ? `Delete "${name}" and all ${entryCount} entries inside? This cannot be undone.`
    : `Delete "${name}"?`;
  showConfirm('Delete Category', msg, async () => {
    const entries = LORE.filter(l => l.categoryUuid === catUuid);
    await dbDeleteMany('lore', entries.map(e => e.uuid));
    setLore(LORE.filter(l => l.categoryUuid !== catUuid));
    await dbDelete('loreCategories', catUuid);
    setLoreCats(LORE_CATS.filter(c => c.uuid !== catUuid));
    if (_activeLoreUuid && entries.find(e => e.uuid === _activeLoreUuid)) {
      _activeLoreUuid = null;
      _showEmptyLore();
    }
    renderLoreSidebar();
    notifyDataChanged();
    showToast('Category deleted');
  });
}

// ── Lore entry CRUD ───────────────────────────────────────────────────────────
function _populateLoreCategorySelect() {
  const sel = document.getElementById('lCategory');
  sel.innerHTML = '<option value="">— Select category —</option>'
    + LORE_CATS.map(c => `<option value="${esc(c.uuid)}">${esc(c.name)}</option>`).join('');
}

function _loreValidate() {
  const hasTitle   = !!document.getElementById('lTitle').value.trim();
  const hasCat     = !!document.getElementById('lCategory').value;
  const hasContent = !!document.getElementById('lContent').value.trim();
  const setDot = (id, ok, lbl) => {
    document.getElementById(id).className = 'modal-v-dot' + (ok ? ' ok' : '');
    document.getElementById(id + '-lbl').textContent = lbl;
  };
  setDot('lv-title',   hasTitle,   hasTitle   ? document.getElementById('lTitle').value.trim() : 'No title');
  setDot('lv-cat',     hasCat,     hasCat     ? 'Category set'  : 'No category');
  setDot('lv-content', hasContent, hasContent ? 'Content set'   : 'No content');
  document.getElementById('loreSubmitBtn').disabled = !(hasTitle && hasCat && hasContent);
}

function _resetLoreModal() {
  _editingLoreUuid = null; lState.tags = [];
  ['lTitle', 'lMeta', 'lContent'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('lCategory').value = '';
  document.getElementById('loreSuccess').classList.remove('visible');
  document.getElementById('loreSubmitBtn').classList.remove('saving');
  document.getElementById('loreDeleteBtn').style.display = 'none';
  document.getElementById('loreModalTitle').textContent  = 'New Wiki Entry';
  document.getElementById('loreSubmitLabel').textContent = 'Save Entry';
  _populateLoreCategorySelect();
  populateLoreCustomTags();
  _loreValidate();
}

export function openLoreModal(catUuid) {
  _resetLoreModal();
  if (catUuid) document.getElementById('lCategory').value = catUuid;
  document.getElementById('loreModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  _loreValidate();
}

export function closeLoreModal() {
  document.getElementById('loreModal').classList.remove('open');
  document.body.style.overflow = '';
}

export function openEditLore(loreUuid) {
  const e = LORE.find(x => x.uuid === loreUuid);
  if (!e) return;
  _resetLoreModal();
  _editingLoreUuid = loreUuid;
  document.getElementById('lTitle').value    = e.title       || '';
  document.getElementById('lMeta').value     = e.meta        || '';
  document.getElementById('lContent').value  = e.content     || '';
  document.getElementById('lCategory').value = e.categoryUuid|| '';
  lState.tags = [...(e.customTags || [])];
  populateLoreCustomTags();
  document.getElementById('loreModalTitle').textContent  = 'Edit Wiki Entry';
  document.getElementById('loreSubmitLabel').textContent = 'Save Changes';
  document.getElementById('loreDeleteBtn').style.display = '';
  document.getElementById('loreModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  _loreValidate();
}

export async function saveLore() {
  const title        = document.getElementById('lTitle').value.trim();
  const meta         = document.getElementById('lMeta').value.trim();
  const content      = document.getElementById('lContent').value.trim();
  const categoryUuid = document.getElementById('lCategory').value;
  const btn          = document.getElementById('loreSubmitBtn');
  btn.classList.add('saving'); btn.disabled = true;

  const existing = _editingLoreUuid ? LORE.find(x => x.uuid === _editingLoreUuid) : null;
  const entry = {
    uuid:        _editingLoreUuid || newUuid(),
    title, meta, content, categoryUuid,
    customTags:  [...lState.tags],
    createdAt:   existing ? existing.createdAt : Date.now(),
  };

  await dbPut('lore', entry);

  if (_editingLoreUuid) {
    const idx = LORE.findIndex(x => x.uuid === _editingLoreUuid);
    if (idx >= 0) LORE[idx] = entry;
  } else {
    LORE.push(entry);
  }
  LORE.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  btn.classList.remove('saving');
  document.getElementById('loreSuccess').classList.add('visible');
  _expandedCats.add(categoryUuid);
  _activeLoreUuid = entry.uuid;
  renderLoreSidebar();
  openLoreEntry(entry.uuid);
  notifyDataChanged();
  showToast(_editingLoreUuid ? 'Entry updated' : 'Entry saved');
  setTimeout(closeLoreModal, 1000);
}

export function confirmDeleteLore(loreUuid, title) {
  showConfirm('Delete Entry', `Delete "${title}"? This cannot be undone.`, () => deleteLore(loreUuid));
}

export async function deleteLore(loreUuid) {
  await dbDelete('lore', loreUuid);
  setLore(LORE.filter(x => x.uuid !== loreUuid));
  if (_activeLoreUuid === loreUuid) {
    _activeLoreUuid = null;
    _showEmptyLore();
  }
  renderLoreSidebar();
  notifyDataChanged();
  showToast('Entry deleted');
}

export function deleteCurrentLore() {
  confirmDeleteLore(_editingLoreUuid, document.getElementById('lTitle').value.trim());
  closeLoreModal();
}

function _showEmptyLore() {
  document.getElementById('lore-content').innerHTML = `
    <div class="lore-empty-content">
      <div class="lore-empty-icon">⌬</div>
      <div class="lore-empty-heading">Ardenverse Wiki</div>
      <p class="lore-empty-sub">Select an entry from the sidebar to begin reading.</p>
    </div>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initLore() {
  // Sidebar delegation
  document.getElementById('lore-sidebar').addEventListener('click', e => {
    const catBtn   = e.target.closest('.lore-cat[data-cat-uuid]');
    if (catBtn) { toggleCat(catBtn.dataset.catUuid); return; }

    const entryBtn = e.target.closest('.lore-entry-link[data-entry-uuid]');
    if (entryBtn) { openLoreEntry(entryBtn.dataset.entryUuid); return; }

    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      const { action, catUuid, catName, entryCount } = actionBtn.dataset;
      if (action === 'add-entry')  openLoreModal(catUuid);
      if (action === 'rename-cat') renameLoreCategory(catUuid);
      if (action === 'del-cat')    confirmDeleteLoreCat(catUuid, catName, parseInt(entryCount, 10));
    }
  });

  // Lore content delegation (edit/delete actions)
  document.getElementById('lore-content').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, uuid, title } = btn.dataset;
    if (action === 'edit-lore') openEditLore(uuid);
    if (action === 'del-lore')  confirmDeleteLore(uuid, title);
  });

  // Add category button
  document.getElementById('lore-add-cat-btn').addEventListener('click', addLoreCategory);

  // Mobile sidebar toggle
  const toggle  = document.getElementById('lore-sidebar-toggle');
  const overlay = document.getElementById('lore-sidebar-overlay');
  const nav     = document.getElementById('lore-nav');
  if (toggle) {
    toggle.addEventListener('click', () => {
      nav.classList.toggle('open');
      overlay.classList.toggle('visible');
    });
    overlay.addEventListener('click', () => {
      nav.classList.remove('open');
      overlay.classList.remove('visible');
    });
  }

  // Search
  document.getElementById('lore-search').addEventListener('input', renderLoreSidebar);

  // Modal validation
  ['lTitle', 'lContent'].forEach(id => document.getElementById(id).addEventListener('input', _loreValidate));
  document.getElementById('lCategory').addEventListener('change', _loreValidate);

  // Buttons
  document.getElementById('loreDeleteBtn').addEventListener('click', deleteCurrentLore);
  document.getElementById('loreSubmitBtn').addEventListener('click', saveLore);
  document.getElementById('loreModal').querySelector('.close-btn').addEventListener('click', closeLoreModal);
  document.getElementById('loreModal').addEventListener('click', function(e) {
    if (e.target === this) closeLoreModal();
  });
}
