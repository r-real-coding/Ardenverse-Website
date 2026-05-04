import { CHARACTERS, setCharacters } from './state.js';
import { apiPutData, apiUploadImage, apiDeleteImage, imageUrl, newUuid } from './api.js';
import { esc, showToast, showConfirm, revokeUrl, validateFileSize, notifyDataChanged } from './utils.js';

let _editingCharUuid = null;
const _cState = { file: null, imageKey: null };

const PLACEHOLDER_SVGS = [
  `<div class="char-portrait-placeholder" style="background:linear-gradient(135deg,#041a17 0%,#0d4a40 50%,#020f0d 100%)">⬡</div>`,
  `<div class="char-portrait-placeholder" style="background:linear-gradient(135deg,#020f1e 0%,#0a2040 50%,#020f0d 100%)">◈</div>`,
];

// ── Render ────────────────────────────────────────────────────────────────────
export function renderChars() {
  const grid    = document.getElementById('chars-grid');
  const isAdmin = document.body.classList.contains('admin-mode');
  if (!CHARACTERS.length && !isAdmin) {
    grid.innerHTML = '<div style="padding:3rem;color:var(--text-muted);font-size:0.85rem;">No characters yet.</div>';
    return;
  }
  grid.innerHTML = CHARACTERS.map((c, i) => `
    <div class="char-card" data-char-uuid="${esc(c.uuid)}">
      ${c.imageKey
        ? `<img class="char-portrait" src="${esc(imageUrl(c.imageKey))}" alt="${esc(c.name)}">`
        : PLACEHOLDER_SVGS[i % PLACEHOLDER_SVGS.length]}
      <div class="char-info">
        <div class="char-name">${esc(c.name)}${c.shortName ? ` <span style="color:var(--text-muted);font-size:0.8rem;">/ ${esc(c.shortName)}</span>` : ''}</div>
        <div class="char-title-label">${esc(c.title)}</div>
        <p class="char-excerpt">${esc(c.excerpt || '')}</p>
      </div>
      <div class="card-admin-bar">
        <button class="card-admin-btn" data-action="edit-char" data-uuid="${esc(c.uuid)}">Edit</button>
        <button class="card-admin-btn del" data-action="del-char" data-uuid="${esc(c.uuid)}" data-name="${esc(c.name)}">Del</button>
      </div>
    </div>`).join('')
    + (isAdmin ? `<div class="add-card" id="add-char-card"><div class="add-icon">+</div><div class="add-label">Add Character</div></div>` : '');

  if (isAdmin) {
    document.getElementById('add-char-card').addEventListener('click', openCharModal);
  }
}

// ── Character detail overlay ──────────────────────────────────────────────────
export function openCharDetail(charUuid) {
  const c = CHARACTERS.find(x => x.uuid === charUuid);
  if (!c) return;

  document.getElementById('char-detail-img-wrap').innerHTML = c.imageKey
    ? `<img class="char-detail-img" src="${esc(imageUrl(c.imageKey))}" alt="${esc(c.name)}">`
    : `<div class="char-detail-img-placeholder">⬡</div>`;

  document.getElementById('char-detail-body').innerHTML = `
    <div style="font-family:'Orbitron',sans-serif;font-size:0.6rem;letter-spacing:0.3em;color:var(--cyan);margin-bottom:0.5rem;margin-top:1rem;">CHARACTER FILE</div>
    <h2 style="font-family:'Cinzel',serif;font-size:1.8rem;margin-bottom:0.2rem;">${esc(c.name)}</h2>
    <div style="font-size:0.8rem;color:var(--teal-400);letter-spacing:0.12em;text-transform:uppercase;font-weight:600;margin-bottom:1.5rem;">${esc(c.title)}</div>
    <div class="stat-grid">${(c.stats || []).map(s =>
      `<div class="stat-item"><div class="stat-label">${esc(s.k)}</div><div class="stat-value">${esc(s.v)}</div></div>`
    ).join('')}</div>
    <div class="section-divider"></div>
    ${(c.bio || '').split('\n\n').map(p =>
      `<p style="font-size:0.88rem;color:var(--text-secondary);font-weight:300;line-height:1.9;margin-bottom:1rem;">${esc(p)}</p>`
    ).join('')}
    <div class="char-traits">${(c.traits || []).map(t => `<span class="trait">${esc(t)}</span>`).join('')}</div>`;

  document.getElementById('char-detail').classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeCharDetail() {
  document.getElementById('char-detail').classList.remove('open');
  document.body.style.overflow = '';
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function _charValidate() {
  const hasName  = !!document.getElementById('cName').value.trim();
  const hasTitle = !!document.getElementById('cTitle').value.trim();
  const setDot   = (id, ok, lbl) => {
    document.getElementById(id).className = 'modal-v-dot' + (ok ? ' ok' : '');
    document.getElementById(id + '-lbl').textContent = lbl;
  };
  setDot('cv-name',  hasName,  hasName  ? document.getElementById('cName').value.trim()  : 'No name');
  setDot('cv-title', hasTitle, hasTitle ? document.getElementById('cTitle').value.trim() : 'No title');
  document.getElementById('charSubmitBtn').disabled = !(hasName && hasTitle);
}

function _resetCharModal() {
  _editingCharUuid = null; _cState.file = null; _cState.imageKey = null;
  ['cName','cShort','cTitle','cExcerpt','cBio','cTraits',
   'cs1k','cs1v','cs2k','cs2v','cs3k','cs3v','cs4k','cs4v'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('charPreviewImg').style.display = 'none';
  document.getElementById('charPreviewImg').src           = '';
  document.getElementById('charDropZone').style.display   = '';
  document.getElementById('charReplaceBtn').classList.remove('visible');
  document.getElementById('charSuccess').classList.remove('visible');
  document.getElementById('charSubmitBtn').classList.remove('saving');
  document.getElementById('charDeleteBtn').style.display  = 'none';
  document.getElementById('charModalTitle').textContent   = 'New Character';
  document.getElementById('charSubmitLabel').textContent  = 'Save Character';
  _charValidate();
}

export function openCharModal() {
  _resetCharModal();
  document.getElementById('charModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closeCharModal() {
  const img = document.getElementById('charPreviewImg');
  if (img.src.startsWith('blob:')) { revokeUrl(img.src); }
  img.src = '';
  document.getElementById('charModal').classList.remove('open');
  document.body.style.overflow = '';
}

export function openEditChar(charUuid) {
  const c = CHARACTERS.find(x => x.uuid === charUuid);
  if (!c) return;
  _resetCharModal();
  _editingCharUuid     = charUuid;
  _cState.imageKey     = c.imageKey || null;
  document.getElementById('cName').value    = c.name      || '';
  document.getElementById('cShort').value   = c.shortName || '';
  document.getElementById('cTitle').value   = c.title     || '';
  document.getElementById('cExcerpt').value = c.excerpt   || '';
  document.getElementById('cBio').value     = c.bio       || '';
  document.getElementById('cTraits').value  = (c.traits || []).join(', ');

  const stats = c.stats || [];
  ['cs1k','cs1v','cs2k','cs2v','cs3k','cs3v','cs4k','cs4v'].forEach((id, i) => {
    const stat  = stats[Math.floor(i / 2)];
    const isVal = i % 2 === 1;
    document.getElementById(id).value = stat ? (isVal ? stat.v : stat.k) : '';
  });

  if (c.imageKey) {
    const img = document.getElementById('charPreviewImg');
    img.src = imageUrl(c.imageKey); img.style.display = 'block';
    document.getElementById('charDropZone').style.display = 'none';
    document.getElementById('charReplaceBtn').classList.add('visible');
  }

  document.getElementById('charModalTitle').textContent  = 'Edit Character';
  document.getElementById('charSubmitLabel').textContent = 'Save Changes';
  document.getElementById('charDeleteBtn').style.display = '';
  document.getElementById('charModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  _charValidate();
}

function _handleCharFile(file) {
  if (!validateFileSize(file)) return;
  _cState.file = file;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('charPreviewImg');
    img.src = e.target.result; img.style.display = 'block';
    document.getElementById('charDropZone').style.display = 'none';
  };
  reader.onerror = () => showToast('Failed to read image file', true);
  reader.readAsDataURL(file);
  document.getElementById('charReplaceBtn').classList.add('visible');
}

export async function saveCharacter() {
  const name    = document.getElementById('cName').value.trim();
  const short   = document.getElementById('cShort').value.trim();
  const title   = document.getElementById('cTitle').value.trim();
  const excerpt = document.getElementById('cExcerpt').value.trim();
  const bio     = document.getElementById('cBio').value.trim();
  const traits  = document.getElementById('cTraits').value.split(',').map(t => t.trim()).filter(Boolean);
  const stats   = [
    { k: document.getElementById('cs1k').value.trim(), v: document.getElementById('cs1v').value.trim() },
    { k: document.getElementById('cs2k').value.trim(), v: document.getElementById('cs2v').value.trim() },
    { k: document.getElementById('cs3k').value.trim(), v: document.getElementById('cs3v').value.trim() },
    { k: document.getElementById('cs4k').value.trim(), v: document.getElementById('cs4v').value.trim() },
  ].filter(s => s.k && s.v);

  const btn = document.getElementById('charSubmitBtn');
  btn.classList.add('saving'); btn.disabled = true;

  const existing = _editingCharUuid ? CHARACTERS.find(x => x.uuid === _editingCharUuid) : null;
  let imageKey   = _cState.imageKey;

  if (_cState.file instanceof File) {
    try {
      const newKey = await apiUploadImage(_cState.file);
      if (existing?.imageKey && existing.imageKey !== newKey) {
        await apiDeleteImage(existing.imageKey).catch(() => {});
      }
      imageKey = newKey;
    } catch {
      showToast('Image upload failed', true);
      btn.classList.remove('saving'); btn.disabled = false;
      return;
    }
  }

  const baseSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const slug     = existing ? existing.slug : _uniqueSlug(baseSlug, CHARACTERS.map(c => c.slug));

  const char = {
    uuid: _editingCharUuid || newUuid(),
    slug, name, title, excerpt, bio, traits, stats, imageKey,
    createdAt: existing ? existing.createdAt : Date.now(),
  };
  if (short) char.shortName = short;

  if (_editingCharUuid) {
    const idx = CHARACTERS.findIndex(x => x.uuid === _editingCharUuid);
    if (idx >= 0) CHARACTERS[idx] = char; else CHARACTERS.push(char);
  } else {
    CHARACTERS.push(char);
    CHARACTERS.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  try {
    await apiPutData('characters', CHARACTERS);
  } catch {
    showToast('Failed to save character', true);
    btn.classList.remove('saving'); btn.disabled = false;
    return;
  }

  btn.classList.remove('saving');
  document.getElementById('charSuccess').classList.add('visible');
  notifyDataChanged();
  showToast(_editingCharUuid ? 'Character updated' : 'Character saved');
  setTimeout(closeCharModal, 1000);
}

export function confirmDeleteChar(charUuid, name) {
  showConfirm('Delete Character', `Delete "${name}"? This cannot be undone.`, () => deleteChar(charUuid));
}

export async function deleteChar(charUuid) {
  const char = CHARACTERS.find(x => x.uuid === charUuid);
  if (char?.imageKey) await apiDeleteImage(char.imageKey).catch(() => {});
  const updated = CHARACTERS.filter(x => x.uuid !== charUuid);
  setCharacters(updated);
  await apiPutData('characters', updated);
  notifyDataChanged();
  showToast('Character deleted');
}

export function deleteCurrentChar() {
  confirmDeleteChar(_editingCharUuid, document.getElementById('cName').value.trim());
  closeCharModal();
}

function _uniqueSlug(base, existingSlugs) {
  if (!existingSlugs.includes(base)) return base;
  let i = 2;
  while (existingSlugs.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initCharacters() {
  document.getElementById('chars-grid').addEventListener('click', e => {
    const adminBtn = e.target.closest('[data-action]');
    if (adminBtn) {
      e.stopPropagation();
      const { action, uuid, name } = adminBtn.dataset;
      if (action === 'edit-char') openEditChar(uuid);
      if (action === 'del-char')  confirmDeleteChar(uuid, name);
      return;
    }
    const card = e.target.closest('.char-card[data-char-uuid]');
    if (card) openCharDetail(card.dataset.charUuid);
  });

  document.getElementById('char-detail').addEventListener('click', e => {
    if (e.target === document.getElementById('char-detail')) closeCharDetail();
  });
  document.getElementById('char-detail').querySelector('.close-btn').addEventListener('click', closeCharDetail);

  const drop = document.getElementById('charDropZone');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) _handleCharFile(f);
  });
  document.getElementById('charFileInput').addEventListener('change', e => {
    if (e.target.files[0]) _handleCharFile(e.target.files[0]);
  });
  document.getElementById('charReplaceBtn').addEventListener('click', () => {
    document.getElementById('charFileInput').click();
  });

  ['cName', 'cTitle'].forEach(id => document.getElementById(id).addEventListener('input', _charValidate));
  document.getElementById('charDeleteBtn').addEventListener('click', deleteCurrentChar);
  document.getElementById('charSubmitBtn').addEventListener('click', saveCharacter);
  document.getElementById('charModal').querySelector('.close-btn').addEventListener('click', closeCharModal);
  document.getElementById('charModal').addEventListener('click', function(e) {
    if (e.target === this) closeCharModal();
  });
}
