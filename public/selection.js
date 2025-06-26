const floorSelect = document.getElementById('floor-select');
const roomSelect = document.getElementById('room-select');
const userSelect = document.getElementById('user-select');
const lotSelect = document.getElementById('lot-select');
const taskSelect = document.getElementById('task-select');
const submitBtn = document.getElementById('submit-selection');

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

async function loadUsers() {
  const res = await fetch('/api/users');
  const users = await res.json();
  userSelect.innerHTML = users
    .map(u => `<option value="${u.id}">${u.fullName}</option>`)
    .join('');
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

submitBtn.addEventListener('click', async () => {
  const payload = {
    floorId: floorSelect.value,
    roomId: roomSelect.value,
    userId: userSelect.value,
    lot: lotSelect.value,
    task: taskSelect.value
  };
  await fetch('/api/interventions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
});

window.addEventListener('DOMContentLoaded', async () => {
  await loadUsers();
  await loadFloors();
});
