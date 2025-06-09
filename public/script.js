const plan = document.getElementById("plan");
const bullesContainer = document.getElementById("bulles-container");
const chambreSelect = document.getElementById("chambreSelect");
const exportCsvBtn = document.getElementById("exportCsvBtn");
let numero = 1;

const lotsListe = [
  "A", "A1", "A2", "A3", "B", "C1", "C2", "D", "E", "F", "G", "H", "I", "PMR"
];

let pressTimer = null;
let mousePressTimer = null;

function loadBulles() {
  bullesContainer.innerHTML = "";
  const etage = encodeURIComponent("R+5");

  fetch(`/api/bulles?etage=${etage}&chambre=${chambreSelect.value}`)
    .then(res => res.json())
    .then(data => {
      data.forEach(bulle => createBulle(bulle));
      numero = data.length > 0 ? Math.max(...data.map(b => b.numero)) + 1 : 1;
    });
}

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
      const formData = new FormData(form);
      fetch(`/api/bulles/${bulle.id}`, {
        method: "PUT",
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
  if (confirm("Voulez-vous vraiment supprimer cette bulle ?")) {
    deleteBulle(id);
  }
}

function deleteBulle(id) {
  fetch(`/api/bulles/${id}`, { method: "DELETE" }).then(() => loadBulles());
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

// Gestion appui long touch (mobile)
plan.addEventListener("touchstart", e => {
  if (e.target.closest(".bulle") || e.target.closest(".popup")) return;

  const touch = e.touches[0];
  const rect = plan.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;

  pressTimer = setTimeout(() => {
    showBulleCreationForm(x, y);
  }, 2000); // 2 secondes appui long
});

plan.addEventListener("touchend", e => {
  clearTimeout(pressTimer); // Annule si on relâche avant 2s
});

// Gestion appui long souris (PC)
plan.addEventListener("mousedown", e => {
  if (e.target.closest(".bulle") || e.target.closest(".popup")) return;

  const rect = plan.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  mousePressTimer = setTimeout(() => {
    showBulleCreationForm(x, y);
  }, 2000); // 2 secondes appui long
});

plan.addEventListener("mouseup", e => {
  clearTimeout(mousePressTimer); // Annule si on relâche avant 2s
});

plan.addEventListener("mouseleave", e => {
  clearTimeout(mousePressTimer); // Annule si souris sort de la zone
});

// Désactive la création au clic simple pour éviter conflits avec appui long
plan.addEventListener("click", e => {
  if (e.target.closest(".bulle") || e.target.closest(".popup")) return;
  // Ne rien faire au clic simple
});

function showBulleCreationForm(x, y) {
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
    const formData = new FormData(form);
    formData.append("etage", "R+5");
    formData.append("chambre", chambreSelect.value);
    formData.append("x", parseInt(x));
    formData.append("y", parseInt(y));
    formData.append("numero", numero);

    fetch("/api/bulles", {
      method: "POST",
      body: formData
    }).then(() => {
      loadBulles();
      closePopups();
    });
  };

  showPopup(x, y, form);
}

chambreSelect.addEventListener("change", loadBulles);
window.onload = loadBulles;
