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
  termine: 'Terminé',
  en_retard: 'En retard',
  attente_validation: 'En attente de validation',
  clos: 'Clos',
  valide: 'Validé',
  a_definir: 'À définir'
};

const allowedStatuses = [
  'ouvert',
  'en_cours',
  'attente_validation',
  'clos',
  'valide',
  'a_definir'
];

function mark(oldVal, newVal) {
  return oldVal !== newVal ? 'changed' : '';
}

function showTaskHistory(logs) {
  const modal = document.getElementById('history-modal');
  const content = document.getElementById('history-content');
  const rows = logs
    .map(l => `
      <tr class="${l.action === 'Création' ? 'creation' : 'modification'}">
        <td>${new Date(l.created_at).toLocaleString()}</td>
        <td class="${mark(l.person_old, l.person_new)}">${window.userMap[l.person_old] || l.person_old || '–'}</td><td>${window.userMap[l.person_new] || l.person_new || '–'}</td>
        <td class="${mark(l.floor_old, l.floor_new)}">${l.floor_old || '–'}</td><td>${l.floor_new || '–'}</td>
        <td class="${mark(l.room_old, l.room_new)}">${l.room_old  || '–'}</td><td>${l.room_new  || '–'}</td>
        <td class="${mark(l.lot_old, l.lot_new)}">${l.lot_old   || '–'}</td><td>${l.lot_new   || '–'}</td>
        <td class="${mark(l.task_old, l.task_new)}">${l.task_old  || '–'}</td><td>${l.task_new  || '–'}</td>
        <td class="${mark(l.state_old, l.state_new)}">${l.state_old || '–'}</td><td>${l.state_new || '–'}</td>
        <td>${l.action}</td>
      </tr>
    `)
    .join('');
  content.innerHTML = `
      <table class="history-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Personne avant</th><th>Personne après</th>
            <th>Étage avant</th><th>Étage après</th>
            <th>Chambre avant</th><th>Chambre après</th>
            <th>Lot avant</th><th>Lot après</th>
            <th>Tâche avant</th><th>Tâche après</th>
            <th>État avant</th><th>État après</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  modal.hidden = false;
}

async function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(sec => {
    sec.hidden = sec.id !== tabId;
  });
  if (tabId === 'commentTab') {
    await loadCommentUsers();
  }
}

function downloadFile(url, filename) {
  fetch(url)
    .then(res => res.blob())
    .then(blob => {
      const a = document.createElement('a');
      const objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(objectUrl);
      a.remove();
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

async function loadCommentUsers() {
  const res = await fetch('/api/users');
  const users = await res.json();
  const select = document.getElementById('comment-user');
  if (!select) return;
  select.innerHTML = '<option value="">Anonyme</option>' +
    users.map(u => `<option value="${u.id}">${u.username}</option>`).join('');
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
  enableInlineEditing();
}

async function loadPreview() {
  const floor = document.getElementById('edit-floor').value;
  const previewSection = document.getElementById('previewTab');
  if (!floor) {
    previewSection.hidden = true;
    return;
  }
  previewSection.hidden = false;
  const room  = document.getElementById('edit-room').value || '';
  const lot   = document.getElementById('edit-lot').value || '';
  const params = new URLSearchParams({ etage: floor, chambre: room, lot });
  const res = await fetch('/api/interventions/history?' + params.toString());
  const rows = await res.json();
  renderHistory(rows, '#preview-table');
  enableInlineEditing();
}

function renderHistory(rows, tableSelector = '#history-table') {
  const tbody = document.querySelector(`${tableSelector} tbody`);
  tbody.innerHTML = '';
  rows.forEach(inter => {
    const tr = document.createElement('tr');
    tr.dataset.id = inter.id;

    const tdUser = document.createElement('td');
    tdUser.textContent = window.userMap[inter.user_id] || inter.user_id;
    tr.appendChild(tdUser);

    const tdAction = document.createElement('td');
    tdAction.textContent = inter.action;
    tr.appendChild(tdAction);

    const tdLot = document.createElement('td');
    tdLot.textContent = inter.lot;
    tr.appendChild(tdLot);

    const tdFloor = document.createElement('td');
    tdFloor.textContent = inter.floor || '';
    tr.appendChild(tdFloor);

    const tdRoom = document.createElement('td');
    tdRoom.textContent = inter.room || '';
    tr.appendChild(tdRoom);

    const tdTask = document.createElement('td');
    tdTask.textContent = inter.task;
    tr.appendChild(tdTask);

    const tdPerson = document.createElement('td');
    tdPerson.classList.add('editable', 'person-cell');
    tdPerson.dataset.field = 'person';
    tdPerson.textContent = window.userMap[inter.person] || inter.person || '';
    tr.appendChild(tdPerson);

    const tdStatus = document.createElement('td');
    const state = inter.state.replace(/\s+/g, '_').toLowerCase();
    tdStatus.classList.add('editable', 'status-cell', `status-${state}`);
    tdStatus.dataset.field = 'status';
    tdStatus.textContent = statusLabels[state] || inter.state;
    tr.appendChild(tdStatus);

    const tdDate = document.createElement('td');
    tdDate.textContent = new Date(inter.date).toLocaleString();
    tr.appendChild(tdDate);
    // on ajoute le bouton d'édition pour l'historique et la prévisualisation
    if (['#history-table', '#preview-table'].includes(tableSelector)) {
      const tdEdit = document.createElement('td');
      const btnEdit = document.createElement('button');
      btnEdit.className = 'hist-edit';
      btnEdit.textContent = '✏️';
      btnEdit.addEventListener('click', () => openForEdit(inter));
      tdEdit.appendChild(btnEdit);
      tr.appendChild(tdEdit);

      const tdInfo = document.createElement('td');
      tdInfo.className = 'info-cell';
      tdInfo.innerHTML = `
        <button class="info-btn">ℹ️</button>
        <ul class="info-menu" hidden>
          <li data-action="view-history">Historique</li>
          <li data-action="add-comment">Commentaire</li>
          <li data-action="add-photo">Photos</li>
        </ul>
      `;
      const btn = tdInfo.querySelector('.info-btn');
      const menu = tdInfo.querySelector('.info-menu');
      btn.addEventListener('click', () => {
        menu.hidden = !menu.hidden;
      });
      menu.addEventListener('click', async e => {
        const action = e.target.dataset.action;
        if (action === 'view-history') {
          const res = await fetch(`/api/interventions/${inter.id}/history`);
          const logs = await res.json();
          if (typeof showTaskHistory === 'function') {
            showTaskHistory(logs);
          } else {
            console.log('Task history', logs);
          }
        } else if (action === 'add-comment') {
          currentId = inter.id;
          await showTab('commentTab');
          await loadComments();
          document.getElementById('comment-text').focus();
        } else if (action === 'add-photo') {
          currentId = inter.id;
          showTab('photoTab');
          await loadPhotos();
        }
        menu.hidden = true;
      });
      tr.appendChild(tdInfo);
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
  const userId = document.getElementById('comment-user').value;
  await fetch('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intervention_id: currentId, text, user_id: userId })
  });
  await loadComments();
  document.getElementById('comment-text').value = '';
});

async function loadComments() {
  if (!currentId) return;
  const res = await fetch(`/api/comments?intervention_id=${currentId}`);
  const comments = await res.json();
  const list = document.getElementById('comment-list');
  list.innerHTML = comments
    .map(c => `
      <div class="comment-card">
        <div class="comment-header">
          <span class="comment-author">${c.username}</span>
          <span class="comment-date">${new Date(c.created_at).toLocaleString()}</span>
        </div>
        <div class="comment-body">${c.text}</div>
      </div>
    `)
    .join('');
}

async function loadPhotos() {
  if (!currentId) return;
  const res = await fetch(`/api/interventions/${currentId}/photos`);
  const urls = await res.json();
  document.getElementById('photo-list').innerHTML =
    urls.map(u => `<li><img src="${u}"></li>`).join('');
}

async function enableInlineEditing() {
  document.querySelectorAll(
    'td.editable[data-field="status"]'
  ).forEach(td => {
    td.addEventListener('click', async () => {
      const field = td.dataset.field;
      const id = td.closest('tr').dataset.id;
      let options = [];
      if (field === 'status') {
        options = allowedStatuses.map(key => ({ id: key, label: statusLabels[key] }));
      } else {
        options = Object.entries(window.userMap).map(([id, username]) => ({ id, username }));
      }
      const select = document.createElement('select');
      options.forEach(opt => {
        const o = document.createElement('option');
        if (field === 'status') {
          o.value = opt.id;
          o.text  = opt.label;
        } else {
          o.value = opt.id;
          o.text  = opt.username;
        }
        if (td.textContent.trim() === o.text) o.selected = true;
        select.appendChild(o);
      });
      td.innerHTML = '';
      td.appendChild(select);
      select.focus();
      select.addEventListener('change', async () => {
        const newVal = select.value;
        console.log('🛠️ inline edit:', { id, field, newVal });
        const res = await fetch(`/api/interventions/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: newVal })
        });
        console.log('🛠️ PATCH response:', res.status, await res.json());
        // Recharge tout l’historique : l’UI se remet proprement.
        await loadHistory();
      });
    });
  });
}

document.getElementById('photo-send').addEventListener('click', async () => {
  if (!currentId) return;
  const files = document.getElementById('photo-file').files;
  const fd = new FormData();
  for (const f of files) fd.append('photos', f);
  const res = await fetch(`/api/interventions/${currentId}/photos`, { method: 'POST', body: fd });
  const urls = await res.json();
  const list = document.getElementById('photo-list');
  list.innerHTML = urls.map(u => `<li><img src="${u}"></li>`).join('');
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
  await loadCommentUsers();
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
  document.getElementById('export-pdf').addEventListener('click', () => {
    const params = new URLSearchParams({
      etage: document.getElementById('hist-floor').value || '',
      chambre: document.getElementById('hist-room').value || '',
      lot: document.getElementById('hist-lot').value || '',
      start: document.getElementById('date-start').value || '',
      end: document.getElementById('date-end').value || ''
    });
    downloadFile('/api/export/pdf?' + params.toString(), 'interventions.pdf');
  });
  document.getElementById('export-excel').addEventListener('click', () => {
    const params = new URLSearchParams({
      etage: document.getElementById('hist-floor').value || '',
      chambre: document.getElementById('hist-room').value || '',
      lot: document.getElementById('hist-lot').value || '',
      start: document.getElementById('date-start').value || '',
      end: document.getElementById('date-end').value || ''
    });
    downloadFile('/api/export/excel?' + params.toString(), 'interventions.xlsx');
  });
  document.querySelector('.tabs').addEventListener('click', e => {
    if (e.target.tagName === 'BUTTON') {
      showTab(e.target.dataset.tab);
      if (e.target.dataset.tab === 'editTab') loadPreview();
    }
  });
  document.getElementById('comment-back')
    .addEventListener('click', () => showTab('historyTab'));
  document.getElementById('photo-back')
    .addEventListener('click', () => showTab('historyTab'));
  const modal = document.getElementById('history-modal');
  document.getElementById('close-history').addEventListener('click', () => {
    modal.hidden = true;
  });
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.hidden = true;
  });
});
