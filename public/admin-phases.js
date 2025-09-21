const buttons = Array.from(document.querySelectorAll('.phase-button[data-phase]'));
const resetButton = document.getElementById('reset-phase');
const statusMessage = document.getElementById('status-message');
const floorLabel = document.getElementById('floor-label');
const planImage = document.getElementById('floor-plan');
const overlay = document.getElementById('plan-overlay');
const jsonOutput = document.getElementById('json-output');
const copyButton = document.getElementById('copy-json');
const copyStatus = document.getElementById('copy-status');
const coordsLabels = {
  '1': document.getElementById('phase1-coords'),
  '2': document.getElementById('phase2-coords')
};

const state = {
  activePhase: '1',
  floor: null,
  naturalWidth: 0,
  naturalHeight: 0,
  boxes: { '1': null, '2': null },
  drawing: null
};

const rectElements = {
  '1': createRectElement('phase1'),
  '2': createRectElement('phase2')
};

overlay.appendChild(rectElements['1']);
overlay.appendChild(rectElements['2']);

init();

async function init() {
  const params = new URLSearchParams(window.location.search);
  const floorId = params.get('etage_id');

  if (!floorId) {
    setStatus('Ajoutez le paramètre "etage_id" à l’URL.');
    disableInteractions();
    return;
  }

  try {
    const floor = await fetchFloor(floorId);
    state.floor = floor;
    floorLabel.textContent = floor.name ? `Étage : ${floor.name}` : `Étage n°${floor.id}`;
    const planUrl = normalisePlanUrl(floor.plan_path);
    if (!planUrl) {
      setStatus('Aucun plan n’est enregistré pour cet étage.');
      disableInteractions();
      return;
    }
    await loadPlan(planUrl);
    setStatus('Sélectionnez une phase puis dessinez un rectangle.');
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Impossible de charger les informations de l’étage.');
    disableInteractions();
  }
}

function disableInteractions() {
  planImage.style.opacity = '0.3';
  buttons.forEach(btn => btn.disabled = true);
  resetButton.disabled = true;
  copyButton.disabled = true;
}

function setStatus(message) {
  statusMessage.textContent = message || '';
}

function createRectElement(phase) {
  const el = document.createElement('div');
  const key = phase === '2' || phase === 'phase2' ? 'phase2' : 'phase1';
  el.className = `plan-overlay__rect plan-overlay__rect--${key}`;
  el.style.display = 'none';
  return el;
}

async function fetchFloor(id) {
  const response = await fetch(`/api/floors/${encodeURIComponent(id)}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Étage introuvable.');
    }
    throw new Error('Erreur lors de la récupération de l’étage.');
  }
  return response.json();
}

function normalisePlanUrl(planPath) {
  if (!planPath) return null;
  if (/^https?:/i.test(planPath)) return planPath;
  const cleaned = String(planPath).replace(/^\/+/, '');
  return `/${cleaned}`;
}

function loadPlan(src) {
  return new Promise((resolve, reject) => {
    planImage.addEventListener('load', () => {
      state.naturalWidth = planImage.naturalWidth;
      state.naturalHeight = planImage.naturalHeight;
      if (!state.naturalWidth || !state.naturalHeight) {
        reject(new Error('Impossible de récupérer les dimensions du plan.'));
        return;
      }
      syncOverlaySize();
      window.addEventListener('resize', syncOverlaySize);
      enableDrawing();
      resolve();
    }, { once: true });
    planImage.addEventListener('error', () => {
      reject(new Error('Impossible de charger l’image du plan.'));
    }, { once: true });
    planImage.src = src;
  });
}

function syncOverlaySize() {
  const width = planImage.clientWidth;
  const height = planImage.clientHeight;
  if (!width || !height) return;
  overlay.style.width = `${width}px`;
  overlay.style.height = `${height}px`;
  overlay.style.left = `${planImage.offsetLeft}px`;
  overlay.style.top = `${planImage.offsetTop}px`;
  overlay.style.pointerEvents = 'auto';
  redrawRectangles();
}

function enableDrawing() {
  overlay.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const phase = btn.getAttribute('data-phase');
      if (!phase) return;
      state.activePhase = phase;
      buttons.forEach(b => b.classList.toggle('phase-button--active', b === btn));
    });
  });

  resetButton.addEventListener('click', () => {
    if (!state.activePhase) return;
    setBox(state.activePhase, null);
  });

  copyButton.addEventListener('click', onCopy);
}

function getRelativePosition(event) {
  const rect = overlay.getBoundingClientRect();
  const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
  const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
  return { x, y };
}

function onPointerDown(event) {
  if (event.button !== 0) return;
  if (!state.naturalWidth || !state.naturalHeight) return;
  event.preventDefault();
  overlay.style.cursor = 'crosshair';
  const start = getRelativePosition(event);
  state.drawing = {
    phase: state.activePhase,
    start,
    rect: { left: start.x, top: start.y, width: 0, height: 0 }
  };
  setBox(state.activePhase, null, { silent: true });
  updateRectDisplay(state.activePhase, state.drawing.rect);
}

function onPointerMove(event) {
  if (!state.drawing) return;
  const current = getRelativePosition(event);
  const { start } = state.drawing;
  const left = Math.min(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);
  state.drawing.rect = { left, top, width, height };
  updateRectDisplay(state.drawing.phase, state.drawing.rect);
}

function onPointerUp() {
  overlay.style.cursor = '';
  if (!state.drawing) return;
  const { phase, rect } = state.drawing;
  state.drawing = null;
  if (!rect || rect.width < 5 || rect.height < 5) {
    setBox(phase, null);
    return;
  }
  const scaleX = state.naturalWidth / overlay.clientWidth;
  const scaleY = state.naturalHeight / overlay.clientHeight;
  const box = {
    left: Math.round(rect.left * scaleX),
    top: Math.round(rect.top * scaleY),
    width: Math.round(rect.width * scaleX),
    height: Math.round(rect.height * scaleY)
  };
  setBox(phase, box);
}

function setBox(phase, box, options = {}) {
  state.boxes[phase] = box;
  if (!options.silent) {
    updateCoords(phase);
    redrawRectangles();
    updateJson();
  }
}

function updateRectDisplay(phase, rect) {
  const el = rectElements[phase];
  if (!el) return;
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  el.style.left = `${rect.left}px`;
  el.style.top = `${rect.top}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
}

function redrawRectangles() {
  const displayWidth = overlay.clientWidth;
  const displayHeight = overlay.clientHeight;
  if (!displayWidth || !displayHeight) return;
  const scaleX = displayWidth / state.naturalWidth;
  const scaleY = displayHeight / state.naturalHeight;
  for (const phase of ['1', '2']) {
    const box = state.boxes[phase];
    if (!box) {
      updateRectDisplay(phase, null);
      continue;
    }
    const rect = {
      left: box.left * scaleX,
      top: box.top * scaleY,
      width: box.width * scaleX,
      height: box.height * scaleY
    };
    updateRectDisplay(phase, rect);
  }
  updateCoords('1');
  updateCoords('2');
  updateJson();
}

function updateCoords(phase) {
  const el = coordsLabels[phase];
  if (!el) return;
  const box = state.boxes[phase];
  if (!box) {
    el.textContent = 'Cliquez-glissez pour dessiner la zone.';
    return;
  }
  el.textContent = `left: ${box.left}px\ntop: ${box.top}px\nwidth: ${box.width}px\nheight: ${box.height}px`;
}

async function onCopy() {
  const text = jsonOutput.textContent.trim();
  if (!text || text === 'Aucun rectangle défini.') {
    copyStatus.textContent = 'Définissez au moins un rectangle.';
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    copyStatus.textContent = 'Copié dans le presse-papiers !';
  } catch (err) {
    console.error(err);
    copyStatus.textContent = 'Impossible de copier automatiquement. Sélectionnez le texte manuellement.';
  }
}

function updateJson() {
  const floorName = state.floor?.name?.trim();
  const box1 = state.boxes['1'];
  const box2 = state.boxes['2'];
  if (!box1 && !box2) {
    jsonOutput.textContent = 'Aucun rectangle défini.';
    copyStatus.textContent = '';
    return;
  }
  const label = floorName || `Etage ${state.floor?.id ?? ''}`;
  const lines = [`'${escapeLabel(label)}': {`];
  const formatBox = box => box
    ? `{ left: ${box.left}, top: ${box.top}, width: ${box.width}, height: ${box.height} }`
    : 'null';
  lines.push(`  '1': ${formatBox(box1)},`);
  lines.push(`  '2': ${formatBox(box2)}`);
  lines.push('}');
  jsonOutput.textContent = lines.join('\n');
  copyStatus.textContent = '';
}

function escapeLabel(label) {
  return String(label).replace(/'/g, "\\'");
}
