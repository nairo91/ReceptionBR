const plan = document.getElementById("plan");
const bullesContainer = document.getElementById("bulles-container");
const chambreSelect = document.getElementById("chambreSelect");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const etageSelect = document.getElementById("etageSelect");

const loginContainer = document.getElementById("login-container");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const appContainer = document.getElementById("app-container");
const logoutBtn = document.getElementById("logoutBtn");

// Simule un utilisateur connecté pour bypasser le login
let user = { id: 1, username: "test" };

const lotsListe = [
  "Installation Chantier","Depose", "Platerie", "Electricite", "Plomberie", "Menuiserie",
  "Revetement SDB", "Peinture", "Revetement de sol", "Repose", "F", "G", "H", "I", "PMR"
];

let pressTimer = null;
let mousePressTimer = null;
let longPressTriggered = false;
let numero = 1;

// Fonction pour changer le plan selon l'étage sélectionné
function changePlan(etage) {
  const cleanEtage = etage.toLowerCase().replace('+', '');
  plan.src = `plan-r${cleanEtage}.png`;
}

// Fonction pour adapter les chambres selon l'étage sélectionné
function updateChambreOptions(etage) {
  // Ici tu peux adapter dynamiquement la liste des chambres selon l'étage
  // Pour l'exemple, on laisse les mêmes chambres, mais tu peux modifier selon ta logique
  chambreSelect.dataset.etage = etage;

  // Exemple simple : pour R+5 on affiche chambres 501 à 515
  // Tu peux rajouter une condition pour changer les options selon étage si besoin
  // Pour l'instant on ne modifie rien
}

// --- Chargement des bulles ---
function loadBulles() {
  bullesContainer.innerHTML = "";

  const etage = etageSelect.value;
  changePlan(etage);
  updateChambreOptions(etage);

  let url = `/api/bulles?etage=${encodeURIComponent(etage)}`;
  if (chambreSelect.value !== "total") {
    url += `&chambre=${chambreSelect.value}`;
  }

  fetch(url, { credentials: "include" })
    .then(res => res.json())
    .then(data => {
      data.forEach(bulle => createBulle(bulle));
      numero = data.length > 0 ? Math.max(...data.map(b => b.numero)) + 1 : 1;
      ajusterTailleBulles();
    });
}

// --- Création d’une bulle ---
function createBulle(bulle) {
  const div = document.createElement("div");
  div.className = "bulle";
  div.style.left = `${bulle.x}px`;
  div.style.top = `${bulle.y}px`;
  div.innerText = bulle.numero;
  div.style.backgroundColor = getColorByEtat(bulle.etat);

  div.onclick = function (event) {
    event.stopPropagation();

    const form = document.createElement("form");
    form.enctype = "multipart/form-data";

    const lotOptions = lotsListe.map(lot =>
      `<option value="${lot}" ${lot === bulle.lot ? "selected" : ""}>${lot}</option>`
    ).join("");

    form.innerHTML = `
      <strong>Bulle ${bulle.numero}</strong><br>
      <input type="text" name="intitule" value="${bulle.intitule || ''}" placeholder="Intitulé" /><br>
      <textarea name="description" placeholder="Description">${bulle.description || ''}</textarea><br>
      <label>État :
        <select name="etat">
          <option value="attente" ${bulle.etat === "attente" ? "selected" : ""}>🟡 En attente</option>
          <option value="a_corriger" ${bulle.etat === "a_corriger" ? "selected" : ""}>🔴 À corriger</option>
          <option value="corrige" ${bulle.etat === "corrige" ? "selected" : ""}>🔵 Corrigé</option>
          <option value="validee" ${bulle.etat === "validee" ? "selected" : ""}>🟢 Validé</option>
          <option value="abandonnee" ${bulle.etat === "abandonnee" ? "selected" : ""}>⚫ Abandonné</option>
        </select>
      </label><br>
      <label>Lot :
        <select name="lot">
          <option value="">-- Sélectionner un lot --</option>
          ${lotOptions}
        </select>
      </label><br>
      <input type="text" name="entreprise" placeholder="Entreprise" value="${bulle.entreprise || ''}" /><br>
      <input type="text" name="localisation" placeholder="Localisation" value="${bulle.localisation || ''}" /><br>
      <input type="text" name="observation" placeholder="Observation" value="${bulle.observation || ''}" /><br>
      <input type="date" name="date_butoir" value="${bulle.date_butoir ? bulle.date_butoir.substring(0,10) : ''}" /><br>
      <input type="file" name="photo" accept="image/*" /><br>
      ${bulle.photo ? `<img src="${bulle.photo}" class="preview" onclick="zoomImage('${bulle.photo}')" /><br>` : ""}
      <button type="submit">💾 Enregistrer</button>
      <button type="button" onclick="confirmDelete(${bulle.id})">🗑️ Supprimer</button>
      <button type="button" onclick="closePopups()">Fermer</button>
    `;

    form.onsubmit = (e) => {
      e.preventDefault();
      if (!user) {
        alert("Vous devez être connecté pour modifier.");
        return;
      }
      const formData = new FormData(form);
      fetch(`/api/bulles/${bulle.id}`, {
        method: "PUT",
        credentials: "include",
        body: formData
      }).then(() => {
        loadBulles();
        closePopups();
      });
    };

    showPopup(bulle.x, bulle.y, form);
  };

  bullesContainer.appendChild(div);
}

// --- Couleurs état ---
function getColorByEtat(etat) {
  switch (etat) {
    case "attente": return "#f1c40f";
    case "a_corriger": return "#e74c3c";
    case "corrige": return "#3498db";
    case "validee": return "#2ecc71";
    case "abandonnee": return "#7f8c8d";
    default: return "#e74c3c";
  }
}

// --- Popup ---
function showPopup(x, y, content) {
  closePopups();
  const popup = document.createElement("div");
  popup.className = "popup";
  popup.style.left = `${x + 40}px`;
  popup.style.top = `${y}px`;
  if (typeof content === "string") popup.innerHTML = content;
  else popup.appendChild(content);
  document.body.appendChild(popup);
}

function closePopups() {
  document.querySelectorAll(".popup").forEach(p => p.remove());
}

function confirmDelete(id) {
  if (!user) {
    alert("Vous devez être connecté pour supprimer.");
    return;
  }
  if (confirm("Voulez-vous vraiment supprimer cette bulle ?")) {
    deleteBulle(id);
  }
}

function deleteBulle(id) {
  fetch(`/api/bulles/${id}`, { method: "DELETE", credentials: "include" }).then(() => loadBulles());
}

function zoomImage(src) {
  closePopups();
  const overlay = document.createElement("div");
  overlay.className = "popup";
  overlay.style.top = "100px";
  overlay.style.left = "30%";
  overlay.style.zIndex = "2000";
  overlay.innerHTML = `
    <img src="${src}" style="max-width: 500px; max-height: 500px;" /><br>
    <button onclick="closePopups()">Fermer</button>
  `;
  document.body.appendChild(overlay);
}

// --- Gestion appui long touch (mobile) ---
plan.addEventListener("touchstart", e => {
  if (e.target.closest(".bulle") || e.target.closest(".popup")) return;

  const touch = e.touches[0];
  const rect = plan.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;

  longPressTriggered = false;
  pressTimer = setTimeout(() => {
    longPressTriggered = true;
    showBulleCreationForm(x, y);
  }, 2000);
});

plan.addEventListener("touchend", e => {
  clearTimeout(pressTimer);
});

// --- Gestion appui long souris (PC) ---
plan.addEventListener("mousedown", e => {
  if (e.target.closest(".bulle") || e.target.closest(".popup")) return;

  const rect = plan.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  longPressTriggered = false;
  mousePressTimer = setTimeout(() => {
    longPressTriggered = true;
    showBulleCreationForm(x, y);
  }, 2000);
});

plan.addEventListener("mouseup", e => {
  clearTimeout(mousePressTimer);
});

plan.addEventListener("mouseleave", e => {
  clearTimeout(mousePressTimer);
});

// --- Clic simple PC ---
plan.addEventListener("click", e => {
  if (e.target.closest(".bulle") || e.target.closest(".popup")) return;

  if (longPressTriggered) {
    longPressTriggered = false;
    return;
  }

  const rect = plan.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  showBulleCreationForm(x, y);
});

function showBulleCreationForm(x, y) {
  if (!user) {
    alert("Vous devez être connecté pour ajouter une bulle.");
    return;
  }

  const form = document.createElement("form");
  form.enctype = "multipart/form-data";

  const lotOptions = lotsListe.map(lot => `<option value="${lot}">${lot}</option>`).join("");

  form.innerHTML = `
    <strong>Nouvelle bulle</strong><br>
    <input type="text" name="intitule" placeholder="Intitulé" /><br>
    <textarea name="description" placeholder="Description"></textarea><br>
    <label>État :
      <select name="etat">
        <option value="attente" selected>🟡 En attente</option>
        <option value="a_corriger">🔴 À corriger</option>
        <option value="corrige">🔵 Corrigé</option>
        <option value="validee">🟢 Validé</option>
        <option value="abandonnee">⚫ Abandonné</option>
      </select>
    </label><br>
    <label>Lot :
      <select name="lot">
        <option value="" selected>-- Sélectionner un lot --</option>
        ${lotOptions}
      </select>
    </label><br>
    <input type="text" name="entreprise" placeholder="Entreprise" /><br>
    <input type="text" name="localisation" placeholder="Localisation" /><br>
    <input type="text" name="observation" placeholder="Observation" /><br>
    <input type="date" name="date_butoir" /><br>
    <input type="file" name="photo" accept="image/*" /><br>
    <button type="submit">✅ Ajouter</button>
    <button type="button" onclick="closePopups()">Annuler</button>
  `;

  form.onsubmit = (ev) => {
    ev.preventDefault();

    if (!user) {
      alert("Vous devez être connecté pour ajouter une bulle.");
      return;
    }

    const formData = new FormData(form);
    formData.append("etage", etageSelect.value);
    formData.append("chambre", chambreSelect.value);
    formData.append("x", parseInt(x));
    formData.append("y", parseInt(y));
    formData.append("numero", numero);

    fetch("/api/bulles", {
      method: "POST",
      credentials: "include",
      body: formData
    }).then(() => {
      loadBulles();
      closePopups();
    });
  };

  showPopup(x, y, form);
}

// --- Ajustement taille bulles ---
function getZoomFactor() {
  return window.devicePixelRatio || 1;
}

function ajusterTailleBulles() {
  const zoom = getZoomFactor();
  const bulles = document.querySelectorAll(".bulle");

  bulles.forEach(bulle => {
    const taille = 32 / zoom;
    bulle.style.width = `${taille}px`;
    bulle.style.height = `${taille}px`;
    bulle.style.lineHeight = `${taille}px`;
    bulle.style.fontSize = `${16 / zoom}px`;
  });
}

window.addEventListener("resize", ajusterTailleBulles);
window.addEventListener("load", ajusterTailleBulles);
window.addEventListener("orientationchange", ajusterTailleBulles);

chambreSelect.addEventListener("change", loadBulles);
etageSelect.addEventListener("change", () => {
  // Met à jour l'attribut data-etage du select chambre (utile si tu veux adapter la liste chambres selon étage)
  chambreSelect.dataset.etage = etageSelect.value;
  // Recharge les bulles avec le nouvel étage sélectionné
  loadBulles();
});

// Au chargement, on affiche les bulles pour l'étage par défaut
window.onload = () => {
  loadBulles();
};
