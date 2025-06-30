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

const userSelect  = document.getElementById('user-select');
const floorSelect = document.getElementById('floor-select');
const roomSelect  = document.getElementById('room-select');
const lotSelect   = document.getElementById('lot-select');
const taskSelect  = document.getElementById('task-select');
const statusSelect = document.getElementById('status-select');
const submitBtn   = document.getElementById('submit-selection');
const statusLabels = {
  ouvert: 'Ouvert',
  en_cours: 'En cours',
  attente_validation: 'En attente de validation',
  clos: 'Clos',
  valide: 'Validé'
};
let currentInterventions = [];
let editId = null;

async function loadInterventions() {
  console.log('Appel loadInterventions');
  const res = await fetch('/api/interventions');
  console.log('GET /api/interventions status:', res.status);
  if (!res.ok) {
    console.error('Erreur fetch historique', res.status);
    return;
  }
  const data = await res.json();
  console.log('Données reçues:', data);
  const interventions = Array.isArray(data) ? data : data.rows || [];
  currentInterventions = interventions;
  const tbody = document.getElementById('interventions-table').querySelector('tbody');
  console.log('tbody trouvé:', tbody);
  tbody.innerHTML = interventions
    .map(i => `
      <tr>
        <td>${i.id}</td>
        <td>${window.userMap[i.user_id] || i.user_id}</td>
        <td>${i.floor_id}</td>
        <td>${i.room_id}</td>
        <td>${i.lot}</td>
        <td>${i.task}</td>
        <td><span class="dot status-${i.status}"></span> ${statusLabels[i.status] || i.status}</td>
        <td>${new Date(i.created_at).toLocaleString()}</td>
        <td><button class="edit-btn" data-id="${i.id}">✏️</button></td>
        <td><button class="delete-btn" data-id="${i.id}">🗑️</button></td>
      </tr>
    `)
    .join('');
}

async function loadUsers() {
  const res = await fetch('/api/users');
  const users = await res.json();
  window.userMap = users.reduce((m, u) => (m[u.id] = u.username, m), {});
  userSelect.innerHTML =
    '<option value="">-- Choisir un employé --</option>' +
    users.map(u => `<option value="${u.id}">${u.username}</option>`).join('');
}

async function loadFloors() {
  const res = await fetch('/api/floors');
  const floors = await res.json();
  floorSelect.innerHTML =
    '<option value="">-- Choisir un étage --</option>' +
    floors.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
  if (floors.length) {
    loadRooms(floors[0].id);
  }
}

async function loadRooms(floorId) {
  if (!floorId) {
    roomSelect.innerHTML = '<option value="">-- Choisir une chambre --</option>';
    return;
  }
  const res = await fetch(`/api/rooms?floorId=${encodeURIComponent(floorId)}`);
  const rooms = await res.json();
  roomSelect.innerHTML =
    '<option value="">-- Choisir une chambre --</option>' +
    rooms.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
}

floorSelect.addEventListener('change', () => {
  loadRooms(floorSelect.value);
});

lotSelect.addEventListener('change', () => {
  const tasks = lotTasks[lotSelect.value] || [];
  if (tasks.length === 0) {
    taskSelect.innerHTML = '<option value="">--D\'abord choisir un lot--</option>';
  } else {
    taskSelect.innerHTML = tasks.map(t => `<option value="${t}">${t}</option>`).join('');
  }
});

document.getElementById('interventions-table').addEventListener('click', async (e) => {
  if (e.target.classList.contains('edit-btn')) {
    const id = e.target.dataset.id;
    const it = currentInterventions.find(x => String(x.id) === id);
    if (it) {
      floorSelect.value = it.floor_id;
      await loadRooms(it.floor_id);
      roomSelect.value = it.room_id;
      userSelect.value = it.user_id;
      lotSelect.value = it.lot;
      lotSelect.dispatchEvent(new Event('change'));
      taskSelect.value = it.task;
      statusSelect.value = it.status;
      editId = id;
      submitBtn.textContent = 'Mettre à jour';
    }
  }
  if (e.target.classList.contains('delete-btn')) {
    const id = e.target.dataset.id;
    await fetch(`/api/interventions/${id}`, { method: 'DELETE' });
    await loadInterventions();
  }
});

submitBtn.addEventListener('click', async () => {
  const payload = {
    floorId: floorSelect.value,
    roomId: roomSelect.value,
    userId: userSelect.value,
    lot: lotSelect.value,
    task: taskSelect.value,
    status: statusSelect.value
  };
  const url = editId ? `/api/interventions/${editId}` : '/api/interventions';
  const method = editId ? 'PUT' : 'POST';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (res.ok) {
    alert(editId ? 'Intervention mise à jour !' : 'Intervention enregistrée !');
  }
  editId = null;
  submitBtn.textContent = 'Valider';
  await loadInterventions();
});

document.getElementById('export-csv').addEventListener('click', () => {
  window.location.href = '/api/interventions/export/csv';
});

document.getElementById('export-pdf').addEventListener('click', () => {
  window.location.href = '/api/interventions/export/pdf';
});

window.addEventListener('DOMContentLoaded', async () => {
  await loadUsers();
  await loadFloors();
  await loadInterventions();
});
