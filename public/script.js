const plan = document.getElementById("plan");
const bullesContainer = document.getElementById("bulles-container");
const chambreSelect = document.getElementById("chambreSelect");
let numero = 1;

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
      <input type="text" name="lot" placeholder="Lot" value="${bulle.lot || ''}" /><br>
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

plan.addEventListener("click", e => {
  if (e.target.closest(".bulle") || e.target.closest(".popup")) return;
  const rect = plan.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  showBulleCreationForm(x, y);
});

plan.addEventListener("touchstart", e => {
  if (e.target.closest(".bulle") || e.target.closest(".popup")) return;
  const touch = e.touches[0];
  const rect = plan.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;
  showBulleCreationForm(x, y);
});

function showBulleCreationForm(x, y) {
  const form = document.createElement("form");
  form.enctype = "multipart/form-data";
  form.innerHTML = `
    <strong>Nouvelle bulle</strong><br>
    <input type="text" name="intitule" placeholder="Intitulé" /><br>
    <textarea name="description" placeholder="Description"></textarea><br>
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
    formData.append("etat", "attente");
    formData.append("lot", "");
    formData.append("entreprise", "");
    formData.append("localisation", "");
    formData.append("observation", "");
    formData.append("date_butoir", "");

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

const exportCsvBtn = document.getElementById("exportCsvBtn");

exportCsvBtn.addEventListener("click", () => {
  const etage = encodeURIComponent("R+5");
  const chambre = encodeURIComponent(chambreSelect.value);

  // Ouvre un nouvel onglet pour télécharger le CSV
  window.open(`/api/bulles/export/csv?etage=${etage}&chambre=${chambre}`, "_blank");
});

chambreSelect.addEventListener("change", loadBulles);
window.onload = loadBulles;
