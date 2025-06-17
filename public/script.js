const plan = document.getElementById("plan");
const bullesContainer = document.getElementById("bulles-container");
const chambreSelect = document.getElementById("chambreSelect");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const etageSelect = document.getElementById("etageSelect");

const logoutBtn = document.getElementById("logoutBtn");

// Simule un utilisateur connecté pour bypasser le login
let user = { id: 1, username: "test" };

const lotsListe = [
  "Installation Chantier","Depose", "Platerie", "Electricite", "Plomberie", "Menuiserie",
  "Revetement SDB", "Peinture", "Revetement de sol", "Repose", "F", "G", "H", "I", "PMR"
];

const chambresParEtage = {
  "R+1": ["101", "102", "103", "104"],
  "R+2": ["201", "202", "203", "204"],
  "R+3": ["301", "302", "303", "304"],
  "R+4": ["401", "402", "403", "404"],
  "R+5": ["501", "502", "503", "504", "505", "506", "507", "508", "509", "510", "511", "512", "513", "514", "515"]
};

let pressTimer = null;
let mousePressTimer = null;
let longPressTriggered = false;
let numero = 1;

// Met à jour la liste des chambres selon l'étage sélectionné
function updateChambres() {
  const etage = etageSelect.value;
  const chambres = chambresParEtage[etage] || [];

  // Vider les options actuelles sauf la 1ère ("Toutes les chambres")
  while (chambreSelect.options.length > 1) {
    chambreSelect.remove(1);
  }

  // Ajouter les chambres pour l'étage sélectionné
  chambres.forEach(ch => {
    const option = document.createElement("option");
    option.value = ch;
    option.textContent = `Chambre ${ch}`;
    chambreSelect.appendChild(option);
  });
}

// Charge les bulles selon étage et chambre sélectionnés
function loadBulles() {
  bullesContainer.innerHTML = "";
  const etage = encodeURIComponent(etageSelect.value);
  let url = `/api/bulles?etage=${etage}`;
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

// Change le plan et recharge chambres + bulles à chaque changement d'étage
etageSelect.addEventListener("change", () => {
  // Met à jour le src de l'image du plan (nommage des fichiers à respecter)
  plan.src = `plan-${etageSelect.value.toLowerCase()}.png`;

  // Met à jour la liste des chambres
  updateChambres();

  // Reset sélection chambre et recharge bulles
  chambreSelect.value = "total";
  loadBulles();
});

// Met à jour la taille des bulles en fonction du zoom navigateur
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

// Reste de ton code de gestion des bulles (createBulle, showPopup, etc.) reste inchangé,
// mais adapte la fonction showBulleCreationForm pour envoyer l'étage dynamique

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

// Les fonctions getColorByEtat, showPopup, closePopups, confirmDelete, deleteBulle, zoomImage, et gestion appui long restent inchangées

// -- Ajuster taille bulles (inchangé)
window.addEventListener("resize", ajusterTailleBulles);
window.addEventListener("load", () => {
  updateChambres();
  loadBulles();
  ajusterTailleBulles();
});
window.addEventListener("orientationchange", ajusterTailleBulles);

chambreSelect.addEventListener("change", loadBulles);
