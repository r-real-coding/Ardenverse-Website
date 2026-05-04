import { PLANETS, setPlanets } from './state.js';
import { dbPut, dbDelete, newUuid } from './db.js';
import { esc, showToast, showConfirm, createUrl, revokeUrl, validateFileSize, isValidHex, notifyDataChanged } from './utils.js';

let _editingPlanetUuid = null;
const _pState = { blob: null };

// ── Render planets grid ───────────────────────────────────────────────────────
export function renderPlanets() {
  const grid = document.getElementById('planets-grid');
  const isAdmin = document.body.classList.contains('admin-mode');
  if (!PLANETS.length && !isAdmin) {
    grid.innerHTML = '<div style="padding:3rem;color:var(--text-muted);font-size:0.85rem;">No worlds yet.</div>';
    return;
  }
  grid.innerHTML = PLANETS.map(p => {
    const safeColor  = isValidHex(p.color)  ? p.color  : '#1abf97';
    const safeColorB = isValidHex(p.colorB) ? p.colorB : '#0d4a40';
    const visual = p.imageBlob
      ? `<img class="planet-image" src="${createUrl(p.imageBlob)}" alt="${esc(p.name)}">`
      : `<div class="planet-visual" style="background:linear-gradient(135deg,#041a17 0%,${safeColorB} 60%,#020f0d 100%)">
           <div class="planet-orb" style="background:radial-gradient(circle at 35% 35%,${safeColor}88 0%,${safeColorB} 60%,#020f0d 100%);"></div>
         </div>`;
    return `<div class="planet-card">
      ${visual}
      <div class="planet-info">
        <div class="planet-name">${esc(p.name)}</div>
        <div class="planet-class">${esc(p.class)}</div>
        <p class="planet-desc">${esc(p.desc || '')}</p>
        ${p.details ? `<p class="planet-flavor">${esc(p.details)}</p>` : ''}
        <div class="planet-stats">${(p.stats || []).map(s =>
          `<div class="planet-stat">
             <div class="planet-stat-val">${esc(s.v)}</div>
             <div class="planet-stat-key">${esc(s.k)}</div>
           </div>`
        ).join('')}</div>
      </div>
      <div class="card-admin-bar">
        <button class="card-admin-btn" data-action="edit-planet" data-uuid="${esc(p.uuid)}">Edit</button>
        <button class="card-admin-btn del" data-action="del-planet" data-uuid="${esc(p.uuid)}" data-name="${esc(p.name)}">Del</button>
      </div>
    </div>`;
  }).join('')
    + (isAdmin ? `<div class="add-card" id="add-planet-card"><div class="add-icon">+</div><div class="add-label">Add World</div></div>` : '');

  if (isAdmin) {
    document.getElementById('add-planet-card').addEventListener('click', openPlanetModal);
  }
}

// ── Planet modal ──────────────────────────────────────────────────────────────
export function updatePlanetPreview() {
  const rawC  = document.getElementById('pColor').value;
  const rawCB = document.getElementById('pColorB').value;
  const c  = isValidHex(rawC)  ? rawC  : '#1abf97';
  const cB = isValidHex(rawCB) ? rawCB : '#0d4a40';
  document.getElementById('planetPreview').style.background =
    `linear-gradient(135deg,#041a17 0%,${cB} 60%,#020f0d 100%)`;
  document.getElementById('planetPreviewOrb').style.background =
    `radial-gradient(circle at 35% 35%,${c}88 0%,${cB} 60%,#020f0d 100%)`;
}

export function syncColorPicker(inputId, pickerId) {
  const v = document.getElementById(inputId).value;
  if (isValidHex(v)) document.getElementById(pickerId).value = v;
}

function _planetValidate() {
  const hasName  = !!document.getElementById('pName').value.trim();
  const hasClass = !!document.getElementById('pClass').value.trim();
  const setDot = (id, ok, lbl) => {
    document.getElementById(id).className = 'modal-v-dot' + (ok ? ' ok' : '');
    document.getElementById(id + '-lbl').textContent = lbl;
  };
  setDot('pv-name',  hasName,  hasName  ? document.getElementById('pName').value.trim()  : 'No name');
  setDot('pv-class', hasClass, hasClass ? document.getElementById('pClass').value.trim() : 'No class');
  document.getElementById('planetSubmitBtn').disabled = !(hasName && hasClass);
}

function _resetPlanetModal() {
  _editingPlanetUuid = null; _pState.blob = null;
  ['pName','pClass','pColor','pColorB','pDesc','pDetails',
   'ps1k','ps1v','ps2k','ps2v','ps3k','ps3v'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('pColorPicker').value  = '#1abf97';
  document.getElementById('pColorBPicker').value = '#0d4a40';
  document.getElementById('planetPreviewImgUploaded').style.display = 'none';
  document.getElementById('planetDropZone').style.display = '';
  document.getElementById('planetReplaceBtn').classList.remove('visible');
  updatePlanetPreview();
  document.getElementById('planetSuccess').classList.remove('visible');
  document.getElementById('planetSubmitBtn').classList.remove('saving');
  document.getElementById('planetDeleteBtn').style.display = 'none';
  document.getElementById('planetModalTitle').textContent = 'New World';
  document.getElementById('planetSubmitLabel').textContent = 'Save World';
  _planetValidate();
}

export function openPlanetModal() {
  _resetPlanetModal();
  document.getElementById('planetModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

export function closePlanetModal() {
  const img = document.getElementById('planetPreviewImgUploaded');
  if (img.src.startsWith('blob:')) { revokeUrl(img.src); img.src = ''; }
  document.getElementById('planetModal').classList.remove('open');
  document.body.style.overflow = '';
}

export function openEditPlanet(planetUuid) {
  const p = PLANETS.find(x => x.uuid === planetUuid);
  if (!p) return;
  _resetPlanetModal();
  _editingPlanetUuid = planetUuid;
  document.getElementById('pName').value    = p.name    || '';
  document.getElementById('pClass').value   = p.class   || '';
  document.getElementById('pColor').value   = p.color   || '#1abf97';
  document.getElementById('pColorB').value  = p.colorB  || '#0d4a40';
  document.getElementById('pDesc').value    = p.desc    || '';
  document.getElementById('pDetails').value = p.details || '';

  const c  = isValidHex(p.color)  ? p.color  : '#1abf97';
  const cB = isValidHex(p.colorB) ? p.colorB : '#0d4a40';
  document.getElementById('pColorPicker').value  = c;
  document.getElementById('pColorBPicker').value = cB;

  const stats = p.stats || [];
  ['ps1k','ps1v','ps2k','ps2v','ps3k','ps3v'].forEach((id, i) => {
    const stat  = stats[Math.floor(i / 2)];
    const isVal = i % 2 === 1;
    document.getElementById(id).value = stat ? (isVal ? stat.v : stat.k) : '';
  });

  if (p.imageBlob) {
    _pState.blob = p.imageBlob;
    const img = document.getElementById('planetPreviewImgUploaded');
    img.src = createUrl(p.imageBlob); img.style.display = 'block';
    document.getElementById('planetDropZone').style.display = 'none';
    document.getElementById('planetReplaceBtn').classList.add('visible');
  }

  updatePlanetPreview();
  document.getElementById('planetModalTitle').textContent = 'Edit World';
  document.getElementById('planetSubmitLabel').textContent = 'Save Changes';
  document.getElementById('planetDeleteBtn').style.display = '';
  document.getElementById('planetModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  _planetValidate();
}

function _handlePlanetFile(file) {
  if (!validateFileSize(file)) return;
  _pState.blob = file;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('planetPreviewImgUploaded');
    img.src = e.target.result; img.style.display = 'block';
    document.getElementById('planetDropZone').style.display = 'none';
  };
  reader.readAsDataURL(file);
  document.getElementById('planetReplaceBtn').classList.add('visible');
}

export async function savePlanet() {
  const name    = document.getElementById('pName').value.trim();
  const cls     = document.getElementById('pClass').value.trim();
  const rawC    = document.getElementById('pColor').value.trim();
  const rawCB   = document.getElementById('pColorB').value.trim();
  const color   = isValidHex(rawC)  ? rawC  : '#1abf97';
  const colorB  = isValidHex(rawCB) ? rawCB : '#0d4a40';
  const desc    = document.getElementById('pDesc').value.trim();
  const details = document.getElementById('pDetails').value.trim();
  const stats   = [
    { k: document.getElementById('ps1k').value.trim(), v: document.getElementById('ps1v').value.trim() },
    { k: document.getElementById('ps2k').value.trim(), v: document.getElementById('ps2v').value.trim() },
    { k: document.getElementById('ps3k').value.trim(), v: document.getElementById('ps3v').value.trim() },
  ].filter(s => s.k && s.v);

  const btn = document.getElementById('planetSubmitBtn');
  btn.classList.add('saving'); btn.disabled = true;

  const existing = _editingPlanetUuid ? PLANETS.find(x => x.uuid === _editingPlanetUuid) : null;
  const baseSlug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const slug = existing ? existing.slug : _uniqueSlug(baseSlug, PLANETS.map(p => p.slug));

  const planet = {
    uuid:      _editingPlanetUuid || newUuid(),
    slug, name, class: cls, color, colorB, desc, details, stats,
    imageBlob: _pState.blob,
    createdAt: existing ? existing.createdAt : Date.now(),
  };

  await dbPut('planets', planet);

  if (_editingPlanetUuid) {
    const idx = PLANETS.findIndex(x => x.uuid === _editingPlanetUuid);
    if (idx >= 0) PLANETS[idx] = planet;
  } else {
    PLANETS.push(planet);
    PLANETS.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  btn.classList.remove('saving');
  document.getElementById('planetSuccess').classList.add('visible');
  notifyDataChanged();
  showToast(_editingPlanetUuid ? 'World updated' : 'World saved');
  setTimeout(closePlanetModal, 1000);
}

export function confirmDeletePlanet(planetUuid, name) {
  showConfirm('Delete World', `Delete "${name}"? This cannot be undone.`, () => deletePlanet(planetUuid));
}

export async function deletePlanet(planetUuid) {
  await dbDelete('planets', planetUuid);
  setPlanets(PLANETS.filter(x => x.uuid !== planetUuid));
  notifyDataChanged();
  showToast('World deleted');
}

export function deleteCurrentPlanet() {
  confirmDeletePlanet(_editingPlanetUuid, document.getElementById('pName').value.trim());
  closePlanetModal();
}

function _uniqueSlug(base, existingSlugs) {
  if (!existingSlugs.includes(base)) return base;
  let i = 2;
  while (existingSlugs.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initPlanets() {
  document.getElementById('planets-grid').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, uuid, name } = btn.dataset;
    if (action === 'edit-planet') openEditPlanet(uuid);
    if (action === 'del-planet')  confirmDeletePlanet(uuid, name);
  });

  const drop = document.getElementById('planetDropZone');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) _handlePlanetFile(f);
  });
  document.getElementById('planetFileInput').addEventListener('change', e => {
    if (e.target.files[0]) _handlePlanetFile(e.target.files[0]);
  });
  document.getElementById('planetReplaceBtn').addEventListener('click', () => {
    document.getElementById('planetFileInput').click();
  });

  // Color pickers sync both ways
  document.getElementById('pColor').addEventListener('input', () => {
    syncColorPicker('pColor', 'pColorPicker'); updatePlanetPreview();
  });
  document.getElementById('pColorPicker').addEventListener('input', () => {
    document.getElementById('pColor').value = document.getElementById('pColorPicker').value;
    updatePlanetPreview();
  });
  document.getElementById('pColorB').addEventListener('input', () => {
    syncColorPicker('pColorB', 'pColorBPicker'); updatePlanetPreview();
  });
  document.getElementById('pColorBPicker').addEventListener('input', () => {
    document.getElementById('pColorB').value = document.getElementById('pColorBPicker').value;
    updatePlanetPreview();
  });

  ['pName', 'pClass'].forEach(id => document.getElementById(id).addEventListener('input', _planetValidate));
  document.getElementById('planetDeleteBtn').addEventListener('click', deleteCurrentPlanet);
  document.getElementById('planetSubmitBtn').addEventListener('click', savePlanet);
  document.getElementById('planetModal').querySelector('.close-btn').addEventListener('click', closePlanetModal);
  document.getElementById('planetModal').addEventListener('click', function(e) {
    if (e.target === this) closePlanetModal();
  });
}
