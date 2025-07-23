// historique local des bulles
const actions = JSON.parse(localStorage.getItem('actions') || '[]');

// juste avant document.addEventListener(...)
let nextNumero = 1;

document.addEventListener('DOMContentLoaded', () => {
  const loginContainer = document.getElementById('login-container');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const appContainer = document.getElementById('app-container');
  const logoutBtn = document.getElementById('logoutBtn');

  let user = null;

  async function refresh() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        user = data.user;
        loginContainer.style.display = 'none';
        appContainer.style.display = 'block';
        await initApp();
      } else {
        loginContainer.style.display = 'block';
        appContainer.style.display = 'none';
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function initApp() {
    const chantierSelect  = document.getElementById("chantierSelect");
    const etageSelect     = document.getElementById("etageSelect");
    const chambreSelect   = document.getElementById("chambreSelect");
    const exportBtn    = document.getElementById("exportBtn");
    const formatSelect = document.getElementById("export-format");
    const plan            = document.getElementById("plan");
    const bullesContainer = document.getElementById("bulles-container");

    // 1) Charger les chantiers
    const chRes = await fetch("/api/chantiers", { credentials: "include" });
    const chantiers = await chRes.json();
    chantierSelect.innerHTML = chantiers
      .map(c => `<option value="${c.id}">${c.name}</option>`)
      .join("");
    const defaultCh = chantiers.find(c => c.name === "Ibis")?.id || chantiers[0].id;
    chantierSelect.value = defaultCh;
    await updateFloorOptions(defaultCh);

    // 2) Fonctions utilitaires
    function changePlan(etage) {
      const clean = etage.toLowerCase().replace('r','').replace('+','');
      plan.src = `plan-r${clean}.png`;
    }

    async function updateFloorOptions(chId) {
      try {
        const res = await fetch(
          `/api/floors?chantier_id=${encodeURIComponent(chId)}`,
          { credentials: 'include' }
        );
        const floors = await res.json();
        etageSelect.innerHTML = floors.map(f =>
          `<option value="${f.name}" data-floor-id="${f.id}">${f.name}</option>`
        ).join('');
        etageSelect.value = floors[0]?.name || '';
        const floorId = etageSelect.selectedOptions[0]?.dataset.floorId;
        await updateRoomOptions(floorId);
        changePlan(etageSelect.value);
        loadBulles();
      } catch (err) {
        console.error('Erreur chargement étages:', err);
      }
    }

    async function updateRoomOptions(floorId) {
      chambreSelect.dataset.etage = floorId;
      try {
        const res = await fetch(
          `/api/rooms?floor_id=${floorId}`,
          { credentials: 'include' }
        );
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const rooms = await res.json();
        // on commence toujours par l’option “Toutes les chambres”
        const options = ['<option value="total">-- Toutes les chambres --</option>']
          .concat(rooms.map(r => `<option value="${r.id}">${r.name}</option>`));
        chambreSelect.innerHTML = options.join('');
      } catch (err) {
        console.error('Erreur chargement chambres:', err);
      }
    }

    function loadBulles() {
      bullesContainer.innerHTML = '';
      const etage = etageSelect.value;
      let url = `/api/bulles?etage=${encodeURIComponent(etage)}`;
      if (chambreSelect.value !== 'total') {
        url += `&chambre=${chambreSelect.value}`;
      }
      fetch(url, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          data.forEach(bulle => createBulle(bulle));
          // calcul du prochain numéro global
          nextNumero = data.length > 0
            ? Math.max(...data.map(b => b.numero || 0)) + 1
            : 1;
          ajusterTailleBulles();
        });
    }

    function createBulle(bulle) {
      const div = document.createElement('div');
      div.className = 'bulle';
      const rect = plan.getBoundingClientRect();
      const isLegacy = bulle.x > 1 || bulle.y > 1;
      const relX = isLegacy ? bulle.x / rect.width : bulle.x;
      const relY = isLegacy ? bulle.y / rect.height : bulle.y;
      div.dataset.x = relX;
      div.dataset.y = relY;
      div.style.left = `${relX * 100}%`;
      div.style.top = `${relY * 100}%`;
      div.innerText = bulle.numero;
      div.style.backgroundColor = getColorByEtat(bulle.etat);

      div.onclick = function (event) {
        event.stopPropagation();

        const form = document.createElement('form');
        form.enctype = 'multipart/form-data';
        const lotsListe = [
          'Installation Chantier','Depose','Platerie','Electricite','Plomberie','Menuiserie',
          'Revetement SDB','Peinture','Revetement de sol','Repose','F','G','H','I','PMR'
        ];
        const lotOptions = lotsListe.map(lot =>
          `<option value="${lot}" ${lot === bulle.lot ? 'selected' : ''}>${lot}</option>`
        ).join('');

        form.innerHTML = `
          <strong>Bulle ${bulle.numero}</strong><br>
          <input type="text" name="intitule" value="${bulle.intitule || ''}" placeholder="Intitulé" /><br>
          <textarea name="description" placeholder="Description">${bulle.description || ''}</textarea><br>
          <label>État :
            <select name="etat">
              <option value="attente" ${bulle.etat === 'attente' ? 'selected' : ''}>🟡 En attente</option>
              <option value="a_corriger" ${bulle.etat === 'a_corriger' ? 'selected' : ''}>🔴 À corriger</option>
              <option value="corrige" ${bulle.etat === 'corrige' ? 'selected' : ''}>🔵 Corrigé</option>
              <option value="validee" ${bulle.etat === 'validee' ? 'selected' : ''}>🟢 Validé</option>
              <option value="abandonnee" ${bulle.etat === 'abandonnee' ? 'selected' : ''}>⚫ Abandonné</option>
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
          ${bulle.photo ? `<img src="${bulle.photo}" class="preview" onclick="zoomImage('${bulle.photo}')" /><br>` : ''}
          <button type="submit">💾 Enregistrer</button>
          <button type="button" id="deleteBtn">🗑️ Supprimer</button>
          <button type="button" onclick="closePopups()">Fermer</button>
        `;

        const deleteBtn = form.querySelector('#deleteBtn');
        deleteBtn.onclick = () => confirmDelete(bulle);

        form.onsubmit = e => {
          e.preventDefault();
          if (!user) {
            alert('Vous devez être connecté pour modifier.');
            return;
          }
          const formData = new FormData(form);
          const nomBulle = formData.get('intitule');
          const desc = formData.get('description');
          const lot = formData.get('lot');
          const entreprise = formData.get('entreprise');
          const localisation = formData.get('localisation');
          const observation = formData.get('observation');
          fetch(`/api/bulles/${bulle.id}`, {
            method: 'PUT',
            credentials: 'include',
            body: formData
          }).then(() => {
            loadBulles();
            closePopups();
            const relX = parseFloat(div.dataset.x);
            const relY = parseFloat(div.dataset.y);
              recordAction('modification', {
                etage: bulle.etage,
                chambre: bulle.chambre,
                x: relX,
                y: relY,
                nomBulle: `Bulle ${bulle.numero}`,
                description: desc,
                lot,
                entreprise,
                localisation,
                observation
              });
          });
        };

        const r = plan.getBoundingClientRect();
        const px = parseFloat(div.dataset.x) * r.width;
        const py = parseFloat(div.dataset.y) * r.height;
        showPopup(px, py, form);
      };

      bullesContainer.appendChild(div);
    }

    function getColorByEtat(etat) {
      switch (etat) {
        case 'attente': return '#f1c40f';
        case 'a_corriger': return '#e74c3c';
        case 'corrige': return '#3498db';
        case 'validee': return '#2ecc71';
        case 'abandonnee': return '#7f8c8d';
        default: return '#e74c3c';
      }
    }

    function showPopup(x, y, content) {
      closePopups();
      const popup = document.createElement('div');
      popup.className = 'popup';
      const isMobile = window.innerWidth <= 768;
      const vp = window.visualViewport;
      if (isMobile) {
        popup.style.position = 'fixed';
        if (vp) {
          popup.style.left = vp.offsetLeft + 'px';
          popup.style.top = vp.offsetTop + 'px';
          popup.style.width = vp.width + 'px';
          popup.style.height = vp.height + 'px';
          popup.style.transformOrigin = 'top left';
          popup.style.transform = vp.scale !== 1 ? `scale(${1/vp.scale})` : 'none';
        } else {
          popup.style.left = '0';
          popup.style.top = '0';
          popup.style.width = '100vw';
          popup.style.height = '100vh';
        }
      } else {
        popup.style.left = `${x + 40}px`;
        popup.style.top = `${y}px`;
      }

      if (typeof content === 'string') popup.innerHTML = content;
      else popup.appendChild(content);
      document.body.appendChild(popup);

      function reposition() {
        if (!isMobile || !window.visualViewport) return;
        const v = window.visualViewport;
        popup.style.left = v.offsetLeft + 'px';
        popup.style.top = v.offsetTop + 'px';
        popup.style.width = v.width + 'px';
        popup.style.height = v.height + 'px';
        popup.style.transform = v.scale !== 1 ? `scale(${1/v.scale})` : 'none';
      }

      if (vp) vp.addEventListener('resize', reposition);
      popup._reposition = reposition;
    }

    function closePopups() {
      document.querySelectorAll('.popup').forEach(p => {
        if (p._reposition && window.visualViewport) {
          window.visualViewport.removeEventListener('resize', p._reposition);
        }
        p.remove();
      });
    }
    // rendre la fonction accessible depuis l’attribut onclick inline
    window.closePopups = closePopups;

    function recordAction(type, loc) {
      if (!user) return;
      const entry = {
        // stocke juste l'email pour l'historique local
        user: (loc.user && loc.user.email) || user.email,
        action: type,
        etat:   loc.etat || loc.state || '',
        etage: loc.etage,
        chambre: loc.chambre,
        x: loc.x,
        y: loc.y,
        nomBulle: loc.nomBulle || '',
        description: loc.description || '',
        lot: loc.lot || '',
        entreprise: loc.entreprise || '',
        localisation: loc.localisation || '',
        observation: loc.observation || '',
        timestamp: new Date().toISOString()
      };
      actions.push(entry);
      localStorage.setItem("actions", JSON.stringify(actions));
      fetch('/api/bulles/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // on n’envoie que l’email
          user:        (loc.user && loc.user.email) || user.email,
          action:      type,
          etat:        loc.etat || loc.state || '',
          etage:       loc.etage,
          chambre:     loc.chambre,
          x:           loc.x,
          y:           loc.y,
          nomBulle:    loc.nomBulle,
          description: loc.description,
          lot:         loc.lot,
          entreprise:  loc.entreprise,
          localisation:loc.localisation,
          observation: loc.observation,
          timestamp:   new Date().toISOString()
        }),
      }).catch(console.error);
    }
    // rendre la fonction dispo partout
    window.recordAction = recordAction;

    function confirmDelete(bulle) {
      if (!user) {
        alert('Vous devez être connecté pour supprimer.');
        return;
      }
      if (confirm('Voulez-vous vraiment supprimer cette bulle ?')) {
        deleteBulle(bulle);
      }
    }

    function deleteBulle(bulle) {
      fetch(`/api/bulles/${bulle.id}`, { method: 'DELETE', credentials: 'include' })
        .then(() => loadBulles());
      const { etage, chambre, x, y, numero, lot, entreprise, localisation, observation } = bulle;
      recordAction('suppression', { etage, chambre, x, y, nomBulle: `Bulle ${numero}`, description: '', lot, entreprise, localisation, observation });
    }

    function zoomImage(src) {
      closePopups();
      const overlay = document.createElement('div');
      overlay.className = 'popup';
      overlay.style.top = '100px';
      overlay.style.left = '30%';
      overlay.style.zIndex = '2000';
      overlay.innerHTML = `
        <img src="${src}" style="max-width: 500px; max-height: 500px;" /><br>
        <button onclick="closePopups()">Fermer</button>
      `;
      document.body.appendChild(overlay);
    }

    let pressTimer = null;
    let mousePressTimer = null;
    let touchStartX = null;
    let touchStartY = null;
    const MOVE_CANCEL_THRESHOLD = 10;

    plan.addEventListener('touchstart', e => {
      if (e.touches.length > 1) {
        clearTimeout(pressTimer);
        touchStartX = null;
        touchStartY = null;
        return;
      }
      if (e.target.closest('.bulle') || e.target.closest('.popup')) return;

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

    plan.addEventListener('touchmove', e => {
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

    plan.addEventListener('touchend', e => {
      clearTimeout(pressTimer);
      if (e.touches.length === 0) {
        touchStartX = null;
        touchStartY = null;
      }
    });

    plan.addEventListener('mousedown', e => {
      if (e.target.closest('.bulle') || e.target.closest('.popup')) return;
      const rect = plan.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mousePressTimer = setTimeout(() => {
        showBulleCreationForm(x, y);
      }, 2000);
    });

    plan.addEventListener('mouseup', () => {
      clearTimeout(mousePressTimer);
    });

    plan.addEventListener('mouseleave', () => {
      clearTimeout(mousePressTimer);
    });

    function showBulleCreationForm(x, y) {
      if (!user) {
        alert('Vous devez être connecté pour ajouter une bulle.');
        return;
      }

      const lotsListe = [
        'Installation Chantier','Depose','Platerie','Electricite','Plomberie','Menuiserie',
        'Revetement SDB','Peinture','Revetement de sol','Repose','F','G','H','I','PMR'
      ];

      const form = document.createElement('form');
      form.enctype = 'multipart/form-data';

      const lotOptions = lotsListe.map(lot => `<option value="${lot}">${lot}</option>`).join('');

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

      form.onsubmit = ev => {
        ev.preventDefault();
        if (!user) {
          alert('Vous devez être connecté pour ajouter une bulle.');
          return;
        }
        const formData = new FormData(form);
        formData.append('etage', etageSelect.value);
        formData.append('chambre', chambreSelect.value);
        const rect = plan.getBoundingClientRect();
        const xRatio = x / rect.width;
        const yRatio = y / rect.height;
        formData.append('x', xRatio);
        formData.append('y', yRatio);
        formData.append('numero', nextNumero);
        const assignedNumero = nextNumero;
        nextNumero++;
        const nomBulle = formData.get('intitule');
        const desc = formData.get('description');
        const lot = formData.get('lot');
        const entreprise = formData.get('entreprise');
        const localisation = formData.get('localisation');
        const observation = formData.get('observation');
        fetch('/api/bulles', {
          method: 'POST',
          credentials: 'include',
          body: formData
        }).then(() => {
          loadBulles();
          closePopups();
            recordAction('creation', {
              etage: etageSelect.value,
              chambre: chambreSelect.value,
              x: xRatio,
              y: yRatio,
              nomBulle: `Bulle ${assignedNumero}`,
              description: desc,
              lot,
              entreprise,
              localisation,
              observation
            });
        });
      };

      showPopup(x, y, form);
    }

    function getZoomFactor() {
      if (window.visualViewport) {
        return window.devicePixelRatio * (window.visualViewport.scale || 1);
      }
      return window.devicePixelRatio || 1;
    }

    function ajusterTailleBulles() {
      const zoom = getZoomFactor();
      const bulles = document.querySelectorAll('.bulle');
      bulles.forEach(bulle => {
        const taille = 32 / zoom;
        bulle.style.width = `${taille}px`;
        bulle.style.height = `${taille}px`;
        bulle.style.lineHeight = `${taille}px`;
        bulle.style.fontSize = `${16 / zoom}px`;
      });
    }

    chantierSelect.onchange = () => updateFloorOptions(chantierSelect.value);
    etageSelect.onchange = () => {
      const floorId = etageSelect.selectedOptions[0]?.dataset.floorId;
      changePlan(etageSelect.value);
      updateRoomOptions(floorId);
      loadBulles();
    };
    chambreSelect.onchange = loadBulles;
    exportBtn.onclick = () => {
      const etage   = etageSelect.value;
      const chambre = chambreSelect.value;
      const format  = formatSelect.value; // csv, xlsx ou pdf

      const cols = Array.from(
        document.querySelectorAll('#export-columns input[name="col"]:checked')
      ).map(cb => cb.value).join(',');

      const params = new URLSearchParams({ etage, chambre, format, columns: cols });
      window.open(`/api/bulles/export?${params}`, "_blank");
    };

    window.addEventListener('resize', ajusterTailleBulles);
    window.addEventListener('orientationchange', ajusterTailleBulles);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', ajusterTailleBulles);
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    if (res.ok) {
      const data = await res.json();
      user = data.user;
      loginError.textContent = '';
      loginContainer.style.display = 'none';
      appContainer.style.display   = 'block';
      await initApp();
    } else {
      loginError.textContent = 'Échec de la connexion';
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    user = null;
    await refresh();
  });

  document.getElementById('nav-selection')
    .addEventListener('click', e => {
      e.preventDefault();
      window.location.href = 'selection.html';
  });

  document.getElementById('historiqueBtn')
    .addEventListener('click', () => {
      // on peut aussi réenregistrer tout le tableau d’actions si besoin
      // on garde le tableau "actions" tel quel
      window.location.href = 'historique.html';
  });

  refresh();
});
