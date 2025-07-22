  const plan = document.getElementById("plan");
  const bullesContainer = document.getElementById("bulles-container");
  const chambreSelect = document.getElementById("chambreSelect");
  const chantierSelect = document.getElementById("chantierSelect");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const etageSelect = document.getElementById("etageSelect");

  const userSelect = document.getElementById("userSelect");
  const historiqueBtn = document.getElementById("historiqueBtn");
  const loginContainer = document.getElementById("login-container");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const appContainer = document.getElementById("app-container");
  const logoutBtn = document.getElementById("logoutBtn");

  let user = null;
  const actions = JSON.parse(localStorage.getItem("actions") || "[]");

  const lotsListe = [
    "Installation Chantier", "Depose", "Platerie", "Electricite", "Plomberie", "Menuiserie",
    "Revetement SDB", "Peinture", "Revetement de sol", "Repose", "F", "G", "H", "I", "PMR"
  ];

  const storedUser = localStorage.getItem("selectedUser");
  if (storedUser) {
    user = storedUser;
    userSelect.value = storedUser;
  }

  userSelect.addEventListener("change", () => {
    user = userSelect.value || null;
    if (user) {
      localStorage.setItem("selectedUser", user);
    } else {
      localStorage.removeItem("selectedUser");
    }
  });

  historiqueBtn.addEventListener("click", () => {
    window.location.href = "historique.html";
  });
  let pressTimer = null;
  let mousePressTimer = null;
  let numero = 1;
  let touchStartX = null;
  let touchStartY = null;
  const MOVE_CANCEL_THRESHOLD = 10; // pixels

  function showClickMarker(x, y) {
    const rect = plan.getBoundingClientRect();
    const dot = document.createElement('div');
    dot.className = 'click-dot';
    dot.style.left = `${(x / rect.width) * 100}%`;
    dot.style.top = `${(y / rect.height) * 100}%`;
    bullesContainer.appendChild(dot);
    setTimeout(() => dot.remove(), 2000);
  }

  // Fonction pour changer le plan selon l'étage sélectionné
  let floorsData = [];

  function changePlan(floorId) {
    const floor = floorsData.find(f => String(f.id) === String(floorId));
    if (floor && floor.plan_filename) {
      plan.src = `/uploads/plans/${floor.plan_filename}`;
    }
  }

  async function updateRoomOptions(floorId) {
    try {
      const res = await fetch(`/api/rooms?floor_id=${encodeURIComponent(floorId)}`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const rooms = await res.json();
      const options = ['<option value="">-- Toutes les chambres --</option>']
        .concat(rooms.map(r => `<option value="${r.id}">${r.name}</option>`));
      chambreSelect.innerHTML = options.join('');
    } catch (err) {
      console.error('Erreur chargement rooms:', err);
    }
  }

  async function updateFloorOptions(chantierId) {
    try {
      const res = await fetch(`/api/floors?chantier_id=${encodeURIComponent(chantierId)}`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      floorsData = await res.json();
      const options = floorsData.map(f => `<option value="${f.id}">${f.name}</option>`);
      etageSelect.innerHTML = options.join('');
      if (floorsData[0]) {
        changePlan(floorsData[0].id);
        updateRoomOptions(floorsData[0].id);
      }
    } catch (err) {
      console.error('Erreur chargement floors:', err);
    }
  }

  async function updateEntrepriseOptions() {
    try {
      const res = await fetch('/api/entreprises');
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const entreprises = await res.json();
      const options = entreprises.map(e => `<option value="${e.id}">${e.name}</option>`);
      document.querySelectorAll('#entrepriseSelect').forEach(sel => {
        sel.innerHTML = options.join('');
      });
    } catch (err) {
      console.error('Erreur chargement entreprises:', err);
    }
  }

  function attachEntrepriseHandlers(form) {
    updateEntrepriseOptions();
    const btn = form.querySelector('#addEntrepriseBtn');
    if (btn) {
      btn.onclick = () => {
        const name = prompt('Nouvelle entreprise:');
        if (name) {
          fetch('/api/entreprises', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name })
          }).then(updateEntrepriseOptions);
        }
      };
    }
  }

  // Chargement des bulles en fonction étage + chambre
  function loadBulles() {
    bullesContainer.innerHTML = "";

    changePlan(etageSelect.value);

    let url = `/api/bulles?etage=${encodeURIComponent(etageSelect.value)}`;
    if (chambreSelect.value) {
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

  // Création et affichage d’une bulle
  function createBulle(bulle) {
    const div = document.createElement("div");
    div.className = "bulle";
    const rect = plan.getBoundingClientRect();

    // Anciennes bulles stockaient des positions en pixels. Pour les rendre
    // compatibles, on détecte ce cas et convertit en coordonnées relatives.
    const isLegacy = bulle.x > 1 || bulle.y > 1;
    const relX = isLegacy ? bulle.x / rect.width : bulle.x;
    const relY = isLegacy ? bulle.y / rect.height : bulle.y;

    div.dataset.x = relX;
    div.dataset.y = relY;

    // Position en pourcentage pour s'adapter automatiquement aux changements de taille du plan
    div.style.left = `${relX * 100}%`;
    div.style.top = `${relY * 100}%`;
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
        <label>Entreprise :
          <select name="entreprise_id" id="entrepriseSelect"></select>
          <button type="button" id="addEntrepriseBtn">+</button>
        </label><br>
        <input type="text" name="localisation" placeholder="Localisation" value="${bulle.localisation || ''}" /><br>
        <input type="text" name="observation" placeholder="Observation" value="${bulle.observation || ''}" /><br>
        <input type="date" name="date_butoir" value="${bulle.date_butoir ? bulle.date_butoir.substring(0,10) : ''}" /><br>
        <input type="file" name="photo" accept="image/*" /><br>
        ${bulle.photo ? `<img src="${bulle.photo}" class="preview" onclick="zoomImage('${bulle.photo}')" /><br>` : ""}
        <button type="submit">💾 Enregistrer</button>
        <button type="button" id="deleteBtn">🗑️ Supprimer</button>
        <button type="button" onclick="closePopups()">Fermer</button>
      `;

      attachEntrepriseHandlers(form);

      const deleteBtn = form.querySelector('#deleteBtn');
      const encodedName = encodeURIComponent(bulle.intitule || '');
      const encodedDesc = encodeURIComponent(bulle.description || '');
      deleteBtn.onclick = () => {
        confirmDelete(bulle.id, bulle.etage, bulle.chambre, div.dataset.x, div.dataset.y, bulle.numero, encodedName, encodedDesc);
      };

      form.onsubmit = (e) => {
        e.preventDefault();
        if (!user) {
          alert("Vous devez être connecté pour modifier.");
          return;
        }
        const formData = new FormData(form);
        const name = formData.get('intitule') || '';
        const desc = formData.get('description') || '';
        const nomBulle = name ? `Bulle ${bulle.numero}, ${name}` : `Bulle ${bulle.numero}`;
        fetch(`/api/bulles/${bulle.id}`, {
          method: "PUT",
          credentials: "include",
          body: formData
          }).then(() => {
            loadBulles();
            recordAction("modification", {
              etage: bulle.etage,
              chambre: bulle.chambre,
              x: div.dataset.x,
              y: div.dataset.y,
              nomBulle,
              description: desc
            });
            closePopups();
          });
      };

      const r = plan.getBoundingClientRect();
      const px = parseFloat(div.dataset.x) * r.width;
      const py = parseFloat(div.dataset.y) * r.height;
      showPopup(px, py, form);
    };

    bullesContainer.appendChild(div);
  }

  // Couleurs des bulles selon état
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

  // Popup de formulaire
  function showPopup(x, y, content) {
    closePopups();
    const popup = document.createElement("div");
    popup.className = "popup";

    const isMobile = window.innerWidth <= 768;
    const vp = window.visualViewport;

    if (isMobile) {
      // Fullscreen popup always centered on the current visual viewport
      popup.style.position = "fixed";
      if (vp) {
        popup.style.left = vp.offsetLeft + "px";
        popup.style.top = vp.offsetTop + "px";
        popup.style.width = vp.width + "px";
        popup.style.height = vp.height + "px";
        popup.style.transformOrigin = "top left";
        popup.style.transform = vp.scale !== 1 ? `scale(${1 / vp.scale})` : "none";
      } else {
        popup.style.left = "0";
        popup.style.top = "0";
        popup.style.width = "100vw";
        popup.style.height = "100vh";
      }
    } else {
      popup.style.left = `${x + 40}px`;
      popup.style.top = `${y}px`;
    }

    if (typeof content === "string") popup.innerHTML = content;
    else popup.appendChild(content);
    document.body.appendChild(popup);

    function reposition() {
      if (!isMobile || !window.visualViewport) return;
      const v = window.visualViewport;
      popup.style.left = v.offsetLeft + "px";
      popup.style.top = v.offsetTop + "px";
      popup.style.width = v.width + "px";
      popup.style.height = v.height + "px";
      popup.style.transform = v.scale !== 1 ? `scale(${1 / v.scale})` : "none";
    }

    if (vp) vp.addEventListener("resize", reposition);
    popup._reposition = reposition;
  }

  function closePopups() {
    document.querySelectorAll(".popup").forEach(p => {
      if (p._reposition && window.visualViewport) {
        window.visualViewport.removeEventListener("resize", p._reposition);
      }
      p.remove();
    });
  }
  function confirmDelete(id, etage, chambre, x, y, numero, encName, encDesc) {
    if (!user) {
      alert("Vous devez être connecté pour supprimer.");
      return;
    }
    if (confirm("Voulez-vous vraiment supprimer cette bulle ?")) {
      const name = decodeURIComponent(encName || '');
      const desc = decodeURIComponent(encDesc || '');
      deleteBulle(id, etage, chambre, x, y, numero, name, desc);
    }
  }
  function deleteBulle(id, etage, chambre, x, y, numero, name, desc) {
    fetch(`/api/bulles/${id}`, { method: "DELETE", credentials: "include" }).then(() => {
      loadBulles();
      const nomBulle = name ? `Bulle ${numero}, ${name}` : `Bulle ${numero}`;
      recordAction("suppression", { etage, chambre, x, y, nomBulle, description: desc });
    });
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

  function recordAction(action, loc) {
    if (!user) return;
    const entry = {
      user,
      action,
      etage: loc.etage,
      chambre: loc.chambre,
      x: loc.x,
      y: loc.y,
      nomBulle: loc.nomBulle || '',
      description: loc.description || '',
      timestamp: new Date().toISOString()
    };
    actions.push(entry);
    localStorage.setItem("actions", JSON.stringify(actions));
  }

  // Gestion appui long touch (mobile)
  plan.addEventListener("touchstart", e => {
    if (e.touches.length > 1) {
      // More than one finger implies a pinch gesture; do not trigger bubble
      clearTimeout(pressTimer);
      touchStartX = null;
      touchStartY = null;
      return;
    }
    if (e.target.closest(".bulle") || e.target.closest(".popup")) return;

    const touch = e.touches[0];
    const rect = plan.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;

    pressTimer = setTimeout(() => {
      showBulleCreationForm(x, y);
    }, 2000);
  });

  plan.addEventListener("touchmove", e => {
    if (e.touches.length > 1) {
      clearTimeout(pressTimer);
      return;
    }
    if (touchStartX === null || touchStartY === null) return;
    const touch = e.touches[0];
    if (Math.abs(touch.clientX - touchStartX) > MOVE_CANCEL_THRESHOLD ||
        Math.abs(touch.clientY - touchStartY) > MOVE_CANCEL_THRESHOLD) {
      clearTimeout(pressTimer);
    }
  });

  plan.addEventListener("touchend", e => {
    clearTimeout(pressTimer);
    if (e.touches.length === 0) {
      touchStartX = null;
      touchStartY = null;
    }
  });

  // Gestion appui long souris (PC)
  plan.addEventListener("mousedown", e => {
    if (e.target.closest(".bulle") || e.target.closest(".popup")) return;

    const rect = plan.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    mousePressTimer = setTimeout(() => {
      showBulleCreationForm(x, y);
    }, 2000);
  });

  plan.addEventListener("mouseup", e => {
    clearTimeout(mousePressTimer);
  });

  plan.addEventListener("mouseleave", e => {
    clearTimeout(mousePressTimer);
  });


  function showBulleCreationForm(x, y) {
    if (!user) {
      alert("Vous devez être connecté pour ajouter une bulle.");
      return;
    }

    showClickMarker(x, y);

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
      <label>Entreprise :
        <select name="entreprise_id" id="entrepriseSelect"></select>
        <button type="button" id="addEntrepriseBtn">+</button>
      </label><br>
      <input type="text" name="localisation" placeholder="Localisation" /><br>
      <input type="text" name="observation" placeholder="Observation" /><br>
      <input type="date" name="date_butoir" /><br>
      <input type="file" name="photo" accept="image/*" /><br>
      <button type="submit">✅ Ajouter</button>
      <button type="button" onclick="closePopups()">Annuler</button>
    `;

    attachEntrepriseHandlers(form);

    form.onsubmit = (ev) => {
      ev.preventDefault();

      if (!user) {
        alert("Vous devez être connecté pour ajouter une bulle.");
        return;
      }

      const formData = new FormData(form);
      formData.append("etage", etageSelect.value);
      formData.append("chambre", chambreSelect.value);

      const rect = plan.getBoundingClientRect();
      const xRatio = x / rect.width;
      const yRatio = y / rect.height;
      formData.append("x", xRatio);
      formData.append("y", yRatio);
      formData.append("numero", numero);
      const name = form.querySelector('[name=intitule]').value || '';
      const desc = form.querySelector('[name=description]').value || '';
      const nomBulle = name ? `Bulle ${numero}, ${name}` : `Bulle ${numero}`;
      fetch("/api/bulles", {
        method: "POST",
        credentials: "include",
        body: formData
      }).then(() => {
        loadBulles();
        recordAction("creation", {
          etage: etageSelect.value,
          chambre: chambreSelect.value,
          x: xRatio,
          y: yRatio,
          nomBulle,
          description: desc
        });
        closePopups();
      });
    };

    showPopup(x, y, form);
  }

  // Ajustement taille bulles
  function getZoomFactor() {
    const dpr = window.devicePixelRatio || 1;
    const scale = window.visualViewport ? (window.visualViewport.scale || 1) : 1;
    return dpr * scale;
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
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", ajusterTailleBulles);
  }

  chambreSelect.addEventListener("change", loadBulles);
  etageSelect.addEventListener("change", () => {
    changePlan(etageSelect.value);
    updateRoomOptions(etageSelect.value);
    loadBulles();
  });
  chantierSelect.addEventListener('change', () => {
    updateFloorOptions(chantierSelect.value);
  });

  exportCsvBtn.addEventListener("click", () => {
    // On assemble les params de filtre + columns…
    const params = new URLSearchParams({
      etage:   etageSelect.value   || "",
      chambre: chambreSelect.value || ""
    });
    const cols = [
      "id","user_id","floor_id","room_id","lot",
      "task","status","person","action",
      "created_at","created_by","image"
    ];
    params.set("columns", cols.join(","));

    // On pointe vers ton vrai endpoint d’export des bulles
    const url = `/api/bulles/export/csv?${params.toString()}`;
    window.open(url, "_blank");
  });


  // Au chargement, on remplit d'abord le menu Chambre pour l'étage par défaut, puis on affiche les bulles
  window.onload = () => {
    fetch('/api/chantiers', { credentials: 'include' })
      .then(r => r.json())
      .then(chantiers => {
        chantierSelect.innerHTML = chantiers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        const pre = chantiers.find(c => c.name === 'Ibis');
        const id = pre ? pre.id : (chantiers[0] && chantiers[0].id);
        if (id) {
          chantierSelect.value = id;
          updateFloorOptions(id);
        }
      });
    updateEntrepriseOptions();
    loadBulles();
  };
