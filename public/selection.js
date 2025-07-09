const lotTasks = {
  DEPOSE: [
    "Dépose Matelas / Sommier","Bureau","Chaise / Tabouret","Penderie",
    "Appareillage élec (pc, inter)","luminaires","TDL","TV","Rideaux",
    "Miroir","Convecteur","Dépose Cloison SDB","Dépose revêtement sol",
    "Mitigeur douche","Mitigeur Lavabo","Lavabo","Dépose cabine douche",
    "Grille faux plafond clim oui","Faux plafond entrée",
    "Dépose Bouche aérations","Dépose carrelage sol wc"
  ],
  Platrerie: [
    "Armature cloison SDB+renfort","BA13 hydro cloison SDB",
    "Doublage BA13 hydro SDB","BA13 cloison chambre",
    "Armature faux plafond entrée","BA13 faux plafond entrée"
  ],
  Electricite: [
    "Déplacement SA SDB","Déplacement VV chambre",
    "Création alim lecteur carte","Alim TDL PC","Alim TDL ECL",
    "Alim PC TV","Alim TV","Alim PC tablette TV","Alim PC SDB",
    "Pose luminaires","Pose PC","Pose Interrupteur","Pose lecteur carte"
  ],
  Plomberie: [
    "Modification EFS/ECS+platine","Modification PVC","Pose carreaux plâtre",
    "Pose Receveur","Pose paroie douche","Pose mitigeurs douche",
    "Pose lavabo","Pose mitigeurs vasque + EVAC"
  ],
  Menuiserie: [
    "Pose porte SDB + champlat","Pose renfort lit superposé",
    "Pose lit superposé","Pose fenêtre","Pose Ferme porte",
    "Pose plinthes","Pose Trappe F-P entrée","Pose panneau penderie",
    "Pose TDL","Pose panneau TV"
  ],
  "Revêtement SDB": ["POSE FOREX"],
  Peinture: [
    "Rebouchage trous","Reprise des projetés",
    "Peinture murs & plafonds","Peinture bâtis + porte entrée","Peinture SDB"
  ],
  "Revêtement de sol": ["RAGREAGE","Pose revêtement sol","Butées de portes"],
  Repose: ["Sommier + matelat","TV","Patere SDB (x2)","Porte papier WC (x2)"]
};

let userOptions = '';
let currentId = null;

const statusLabels = {
  ouvert: 'Ouvert',
  en_cours: 'En cours',
  attente_validation: 'En attente de validation',
  clos: 'Clos',
  valide: 'Validé',
  a_definir: 'À définir'
};

function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(sec => {
    sec.hidden = sec.id !== tabId;
  });
}

async function loadUsers() {
  const res = await fetch('/api/users');
  const users = await res.json();
  window.userMap = users.reduce((m, u) => (m[u.id] = u.username, m), {});
  userOptions = '<option value="">--Choisir--</option>' +
    users.map(u => `<option value="${u.id}">${u.username}</option>`).join('');
  document.querySelectorAll('select.person').forEach(sel => {
    const v = sel.value;
    sel.innerHTML = userOptions;
    if (v) sel.value = v;
  });
}

async function loadFloors(selector) {
  const res = await fetch('/api/floors');
  const floors = await res.json();
  const sel = document.querySelector(selector);
  sel.innerHTML = '<option value="">-- Choisir un étage --</option>' +
    floors.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
}

async function loadRooms(floorId, selectorRoom) {
  const sel = document.querySelector(selectorRoom);
  if (!floorId) {
    // si on est dans l'onglet Historique, on propose “Toutes les chambres”
    if (selectorRoom === '#hist-room') {
      sel.innerHTML = '<option value="">-- Toutes les chambres --</option>';
    } else {
      sel.innerHTML = '<option value="">-- Choisir une chambre --</option>';
    }
    return;
  }
  const res = await fetch(`/api/rooms?floorId=${encodeURIComponent(floorId)}`);
  const rooms = await res.json();
  sel.innerHTML = '<option value="">-- Choisir une chambre --</option>' +
    rooms.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
}

async function loadHistory() {
  console.log('⚙️ loadHistory() called');
  const params = new URLSearchParams({
    etage: document.getElementById('hist-floor').value || '',
    chambre: document.getElementById('hist-room').value || '',
    lot: document.getElementById('hist-lot').value || ''
  });
  console.log('⚙️ HISTORY SQL params:', params.toString());
  const res = await fetch('/api/interventions/history?' + params.toString());
  const rows = await res.json();
  console.log('⚙️ rows returned:', rows);
  renderHistory(rows, '#history-table');
}

async function loadPreview() {
  const floor = document.getElementById('edit-floor').value || '';
  const room  = document.getElementById('edit-room').value || '';
  const lot   = document.getElementById('edit-lot').value || '';
  const params = new URLSearchParams({ etage: floor, chambre: room, lot });
  const res = await fetch('/api/interventions/history?' + params.toString());
  const rows = await res.json();
  renderHistory(rows, '#preview-table');
}

function renderHistory(rows, tableSelector = '#history-table') {
  const tbody = document.querySelector(`${tableSelector} tbody`);
  tbody.innerHTML = '';
  rows.forEach(h => {
    // plus besoin de `emplacement`
    const vals = [
      window.userMap[h.user_id] || h.user_id,  // Utilisateur
      h.action,                                // Action
      h.lot,                                   // Lot
      h.floor || '',                           // Étage
      h.room  || '',                           // Chambre
      h.task,                                  // Tâche
      window.userMap[h.person]  || h.person,   // Personne
      statusLabels[h.state]  || h.state,       // État
      new Date(h.date).toLocaleString()        // Date/Heure
    ];
    const tr = document.createElement('tr');
    // cellules de données
    vals.forEach(v => {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    });
    // seulement pour l'historique "véritable", on ajoute le bouton d'édition
    if (tableSelector === '#history-table') {
      const tdEdit = document.createElement('td');
      const btn = document.createElement('button');
      btn.className = 'hist-edit';
      btn.textContent = '✏️';
      btn.addEventListener('click', () => openForEdit(h));
      tdEdit.appendChild(btn);
      tr.appendChild(tdEdit);
    }
    tbody.appendChild(tr);
  });
}

function addEditRow(data = {}) {
  const floor = document.getElementById('edit-floor').value;
  const room = document.getElementById('edit-room').value;
  if (!floor || !room) {
    alert('Veuillez sélectionner un étage et une chambre avant d\u2019ajouter une ligne');
    return;
  }
  const tbody = document.querySelector('#edit-table tbody');
  const tpl = document.getElementById('edit-row-template');
  const row = tpl.content.firstElementChild.cloneNode(true);

  const lot = document.getElementById('edit-lot').value;
  const selTask = row.querySelector('select[name="task"]');
  selTask.innerHTML = '<option value="">--Tâche--</option>' +
    (lotTasks[lot] || []).map(t => `<option value="${t}">${t}</option>`).join('');
  if (data.task) selTask.value = data.task;

  const selPerson = row.querySelector('select.person');
  selPerson.innerHTML = userOptions;
  if (data.person) selPerson.value = data.person;

  const selState = row.querySelector('select.state');
  selState.innerHTML = `
    <option value="ouvert">Ouvert</option>
    <option value="en_cours">En cours</option>
    <option value="attente_validation">En attente de validation</option>
    <option value="clos">Clos</option>
    <option value="valide">Validé</option>
    <option value="a_definir">À définir</option>
  `;
  if (data.state) selState.value = data.state;

  row.querySelector('.modified').textContent = data.modified || '';
  row.querySelector('.remove').addEventListener('click', () => row.remove());

  tbody.appendChild(row);
}

document.getElementById('edit-add').addEventListener('click', () => addEditRow());

const editSubmitBtn = document.getElementById('edit-submit');
editSubmitBtn.addEventListener('click', async function () {
  const btn = this;
  const rows = Array.from(document.querySelectorAll('#edit-table tbody tr')).map(tr => ({
    task: tr.querySelector('select[name="task"]').value,
    person: tr.querySelector('select.person').value,
    state: tr.querySelector('select.state').value
  }));
  const payload = {
    floor: document.getElementById('edit-floor').value,
    room: document.getElementById('edit-room').value,
    lot: document.getElementById('edit-lot').value,
    rows
  };
  if (btn.dataset.id) {
    await fetch(`/api/interventions/${btn.dataset.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        floor: payload.floor,
        room: payload.room,
        lot: payload.lot,
        ...rows[0]
      })
    });
    btn.dataset.id = '';
  } else {
    const res = await fetch('/api/interventions/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (!res.ok) console.error('Erreur bulk:', result);
  }
  document.querySelector('#edit-table tbody').innerHTML = '';
  await loadHistory();
  showTab('historyTab');
});

async function openForEdit(row) {
  currentId = row.id;
  editSubmitBtn.dataset.id = row.id;
  document.getElementById('edit-floor').value = row.floor;
  await loadRooms(row.floor, '#edit-room');
  document.getElementById('edit-room').value = row.room;
  document.getElementById('edit-lot').value = row.lot;
  document.getElementById('edit-lot').dispatchEvent(new Event('change'));
  document.querySelector('#edit-table tbody').innerHTML = '';
  addEditRow({
    task: row.task,
    person: row.person,
    state: row.state,
    modified: row.modified
  });
  showTab('editTab');
  await loadPreview();
}

document.getElementById('comment-send').addEventListener('click', async () => {
  if (!currentId) return;
  const text = document.getElementById('comment-text').value;
  await fetch(`/api/interventions/${currentId}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  document.getElementById('comment-text').value = '';
});

document.getElementById('photo-send').addEventListener('click', async () => {
  if (!currentId) return;
  const files = document.getElementById('photo-file').files;
  const fd = new FormData();
  for (const f of files) fd.append('photos', f);
  const res = await fetch(`/api/interventions/${currentId}/photos`, { method: 'POST', body: fd });
  const urls = await res.json();
  const list = document.getElementById('photo-list');
  list.innerHTML = urls.map(u => `<li><img src="${u}" /></li>`).join('');
});

window.addEventListener('DOMContentLoaded', async () => {
  const lotOptions = Object.keys(lotTasks)
    .map(l => `<option value="${l}">${l}</option>`)
    .join('');
  document.getElementById('edit-lot').innerHTML = '<option value="">-- Lot --</option>' + lotOptions;
  document.getElementById('edit-lot').addEventListener('change', () => {
    document.querySelector('#edit-table tbody').innerHTML = '';
    addEditRow();
  });
  await loadUsers();
  await loadFloors('#hist-floor');
  const histFloor = document.getElementById('hist-floor');
  histFloor.insertAdjacentHTML('afterbegin',
    '<option value="">-- Tous les étages --</option>'
  );
  await loadRooms(document.getElementById('hist-floor').value, '#hist-room');
  const histLot = document.getElementById('hist-lot');
  histLot.insertAdjacentHTML('afterbegin',
    '<option value="">-- Tous les lots --</option>'
  );
  await loadFloors('#edit-floor');
  await loadRooms(document.getElementById('edit-floor').value, '#edit-room');
  editSubmitBtn.dataset.id = '';
  // Afficher d'emblée l'Historique
  showTab('historyTab');
  await loadHistory();
  document.getElementById('edit-floor').addEventListener('change', loadPreview);
  document.getElementById('edit-room').addEventListener('change', loadPreview);
  document.getElementById('edit-lot').addEventListener('change', loadPreview);
  document.getElementById('hist-floor').addEventListener('change', e => loadRooms(e.target.value, '#hist-room'));
  document.getElementById('edit-floor').addEventListener('change', e => loadRooms(e.target.value, '#edit-room'));
  document.getElementById('hist-refresh').addEventListener('click', loadHistory);
  document.querySelector('.tabs').addEventListener('click', e => {
    if (e.target.tagName === 'BUTTON') {
      showTab(e.target.dataset.tab);
      if (e.target.dataset.tab === 'editTab') loadPreview();
    }
  });
});
