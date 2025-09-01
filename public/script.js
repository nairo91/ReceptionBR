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
  let entreprises = [];

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
    const statusFilter    = document.getElementById("statusFilter");

    // Fonction de filtrage des bulles selon l'état sélectionné
    function filterBulles() {
      const wanted = statusFilter?.value;
      document.querySelectorAll("#bulles-container .bulle").forEach(div => {
        if (!wanted || div.dataset.etat === wanted) {
          div.style.display = "";
        } else {
          div.style.display = "none";
        }
      });
    }

    if (statusFilter) {
      const saved = localStorage.getItem('rb_status_filter') || '';
      statusFilter.value = saved;
      statusFilter.addEventListener('change', () => {
        localStorage.setItem('rb_status_filter', statusFilter.value);
        filterBulles();
      });
    }

    // ---------------- PDF EXPORT HELPERS ----------------
    // Colonnes cochées
    function getCheckedColumns() {
      return Array.from(document.querySelectorAll('#export-columns input[type="checkbox"]:checked')).map(cb => cb.value);
    }

    // Image -> DataURL (CORS safe, force https)
    async function imageUrlToDataURL(url, maxWidth = 220) {
      url = (url || '').replace(/^http:\/\//, 'https://');
      return await new Promise(resolve => {
        const img = new Image();
        img.referrerPolicy = 'no-referrer';
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const scale = Math.min(1, maxWidth / (img.naturalWidth || 1));
          const w = Math.max(1, Math.round((img.naturalWidth || maxWidth) * scale));
          const h = Math.max(1, Math.round((img.naturalHeight || maxWidth) * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }

    // Calcule des largeurs de colonnes adaptées à la page
    function computeColumnStyles(cols, baseWidths, pageWidth, marginLeft, marginRight, minW = 36) {
      const available = pageWidth - marginLeft - marginRight;
      const base = cols.map(c => baseWidths[c] ?? 90);
      let sum = base.reduce((a,b)=>a+b,0);

      // Toujours garder "Photos" en dernier (si présente)
      // (c’est géré dans la construction de "cols" plus bas)

      // Si ça dépasse, on scale uniformément mais en respectant un minimum
      if (sum > available) {
        const scale = available / sum;
        for (let i=0;i<base.length;i++) base[i] = Math.max(minW, Math.floor(base[i]*scale));
        sum = base.reduce((a,b)=>a+b,0);
        // Si malgré tout ça dépasse encore (beaucoup de colonnes), on réitère en forçant le min
        if (sum > available) {
          const overflow = sum - available;
          // Retire quelques pixels proportionnellement
          const k = overflow / base.length;
          for (let i=0;i<base.length;i++) base[i] = Math.max(minW, base[i] - Math.ceil(k));
        }
      }

      const columnStyles = {};
      cols.forEach((c, i) => { columnStyles[i] = { cellWidth: base[i] }; });
      return columnStyles;
    }

    // Normalise "Créé par" en email
    function resolveCreatedBy(row) {
      return row.created_by_email
          || (row.created_by && (row.created_by.email || (''+row.created_by)))
          || '—';
    }

    // Texte adouci avec wrap
    function softText(v, max = 300) {
      const s = (v ?? '').toString().replace(/\s+/g, ' ').trim();
      return s.length > max ? s.slice(0, max) + '…' : s;
    }

    // Boutons d'ajout visibles pour Jeremy Launay et Valentin Blot
    if (user && ['launay.jeremy@batirenov.info','blot.valentin@batirenov.info'].includes(user.email)) {
      const chBtn = document.createElement('button');
      chBtn.id = 'addChantierBtn';
      chBtn.textContent = '+ Nouveau chantier';
      chantierSelect.parentNode.appendChild(chBtn);
      chBtn.onclick = async () => {
        const nom = prompt('Nom du chantier');
        if (!nom) return;
        await fetch('/api/chantiers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ nom })
        });
        await loadChantiers();
      };

      const etBtn = document.createElement('button');
      etBtn.id = 'addEtageBtn';
      etBtn.textContent = '+ Nouvel étage';
      etageSelect.parentNode.appendChild(etBtn);
      etBtn.onclick = async () => {
        const nom = prompt('Nom de l\'étage');
        if (!nom) return;
        await fetch('/api/floors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ chantier_id: chantierSelect.value, name: nom })
        });
        await updateFloorOptions(chantierSelect.value);
      };

      // +-------------------------------------------------------------+
      // | Bouton “+ Nouvelle chambre”                                |
      // +-------------------------------------------------------------+
      const roomBtn = document.createElement('button');
      roomBtn.id = 'addRoomBtn';
      roomBtn.textContent = '+ Nouvelle chambre';
      roomBtn.className = 'btn';
      chambreSelect.parentNode.insertBefore(roomBtn, chambreSelect.nextSibling);
      roomBtn.onclick = async () => {
        const nom = prompt('Numéro ou nom de la chambre');
        if (!nom) return;
        await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            floor_id: parseInt(etageSelect.value, 10),
            name: nom
          })
        });
        await updateRoomOptions(etageSelect.value);
      };

      const uploadInput = document.createElement('input');
      uploadInput.type = 'file';
      uploadInput.accept = '.pdf,.png';
      uploadInput.style.display = 'none';
      etageSelect.parentNode.appendChild(uploadInput);
      const uploadBtn = document.createElement('button');
      uploadBtn.id = 'uploadPlanBtn';
      uploadBtn.textContent = '📎 Upload plan';
      etageSelect.parentNode.appendChild(uploadBtn);
      uploadBtn.onclick = () => uploadInput.click();
      uploadInput.onchange = async () => {
        const file = uploadInput.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('plan', file);
        await fetch(`/api/floors/${etageSelect.value}/plan`, {
          method: 'POST',
          credentials: 'include',
          body: fd
        });
        await loadPlan(etageSelect.value);
      };
    }

    async function loadChantiers() {
      const chRes = await fetch('/api/chantiers', { credentials: 'include' });
      const chantiers = await chRes.json();
      chantierSelect.innerHTML = chantiers
        .map(c => `<option value="${c.id}">${c.nom}</option>`)
        .join('');
      const first = chantiers[0];
      if (first) chantierSelect.value = first.id;
      await updateFloorOptions(chantierSelect.value);
    }

    await loadChantiers();

    // Charger les entreprises
    async function loadEntreprises() {
      const res = await fetch('/api/entreprises', { credentials: 'include' });
      entreprises = await res.json();
    }
    await loadEntreprises();

    // 2) Fonctions utilitaires
    async function loadPlan(etageId) {
      const res = await fetch(`/api/floors/${etageId}/plan`, { credentials:'include' });
      if (res.ok) {
        const data = await res.json();
        plan.src = data.path;
      } else {
        plan.src = '';
      }
    }

    async function updateFloorOptions(chantierId) {
      const res = await fetch(`/api/floors?chantier_id=${chantierId}`, { credentials:'include' });
      const etages = await res.json();
      etageSelect.innerHTML = etages.map(e =>
        `<option value="${e.id}">${e.name}</option>`
      ).join('');
      if (!etages.length) return;
      etageSelect.selectedIndex = 0;
      await updateRoomOptions(etages[0].id);
      await loadPlan(etages[0].id);
      loadBulles();
    }

    async function updateRoomOptions(floorId) {
      chambreSelect.dataset.etage = floorId;
      try {
        const res = await fetch(
          `/api/rooms?floorId=${floorId}`,
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
      const chantierId = chantierSelect.value;
      const etageId = etageSelect.value;
      let url = `/api/bulles?chantier_id=${chantierId}&etage_id=${etageId}`;
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
          // Appliquer le filtre après chargement des bulles
          if (typeof filterBulles === 'function') filterBulles();
        });
    }

    function createBulle(bulle) {
      // Deduplicate media entries by path to avoid duplicates in UI
      bulle.media = Array.from(
        new Map((bulle.media || []).map(m => [m.path, m])).values()
      );
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
      // Stocker l'état pour faciliter le filtrage
      div.dataset.etat = bulle.etat || '';

      div.onclick = function (event) {
        event.stopPropagation();

        const form = document.createElement('form');
        form.enctype = 'multipart/form-data';
        const lotsListe = [
          'Installation Chantier','Depose','Platerie','Electricite','Plomberie','Menuiserie',
          'Revetement SDB','Peinture','Revetement de sol','Repose'
          // F, G, H, I et PMR retirés
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
          <label>Entreprise :
            <select name="entreprise_id"></select>
            ${user && ['launay.jeremy@batirenov.info','blot.valentin@batirenov.info'].includes(user.email) ? '<button type="button" id="addEntrepriseBtn">+ Nouvelle entreprise</button>' : ''}
          </label><br>
          <input type="text" name="localisation" placeholder="Localisation" value="${bulle.localisation || ''}" /><br>
          <input type="text" name="observation" placeholder="Observation" value="${bulle.observation || ''}" /><br>
          <input type="date" name="date_butoir" value="${bulle.date_butoir ? bulle.date_butoir.substring(0,10) : ''}" /><br>
          <input type="file" name="media" multiple accept="image/*,video/*" /><br>
          ${Array.isArray(bulle.media) ? bulle.media.map(m => {
            if (m.type === 'photo') {
              return `<img src="${m.path}" class="preview" onclick="zoomImage('${m.path}')" /><br>`;
            } else {
              return `
      <video 
        src="${m.path}" 
        controls 
        class="preview-video" 
        style="max-width:200px; margin-bottom:5px;"
      ></video><br>
    `;
            }
          }).join('') : ''}
          <button type="submit">💾 Enregistrer</button>
          <button type="button" id="deleteBtn">🗑️ Supprimer</button>
          <button type="button" onclick="closePopups()">Fermer</button>
        `;

        // Refiltrer en live si l'état est modifié dans le formulaire
        const etatSelect = form.querySelector('select[name="etat"]');
        if (etatSelect) {
          etatSelect.addEventListener('change', (e) => {
            const v = e.target.value || '';
            div.dataset.etat = v;
            div.style.backgroundColor = getColorByEtat(v);
            if (typeof filterBulles === 'function') filterBulles();
          });
        }

        const deleteBtn = form.querySelector('#deleteBtn');
        deleteBtn.onclick = () => confirmDelete(bulle);

        const entrepriseSelect = form.querySelector('select[name="entreprise_id"]');
        entrepriseSelect.innerHTML = entreprises.map(e => `<option value="${e.id}" ${e.id === bulle.entreprise_id ? 'selected' : ''}>${e.nom}</option>`).join('');

        const addEntBtn = form.querySelector('#addEntrepriseBtn');
        if (addEntBtn) {
          addEntBtn.onclick = async () => {
            const nom = prompt('Nom de la nouvelle entreprise');
            if (!nom) return;
            await fetch('/api/entreprises', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ nom })
            });
            await loadEntreprises();
            entrepriseSelect.innerHTML = entreprises.map(e => `<option value="${e.id}">${e.nom}</option>`).join('');
          };
        }

        form.onsubmit = e => {
          e.preventDefault();
          if (!user) {
            alert('Vous devez être connecté pour modifier.');
            return;
          }
          // new FormData(form) already includes the <input name="media"> files
          const formData = new FormData(form);
          formData.append('chantier_id', chantierSelect.value);
          formData.append('etage_id', etageSelect.value);
          const nomBulle = formData.get('intitule');
          const desc = formData.get('description');
          const lot = formData.get('lot');
          const entrepriseId = formData.get('entreprise_id');
          const entreprise = entrepriseSelect.selectedOptions[0]?.textContent || '';
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
                etage: etageSelect.selectedOptions[0].textContent,
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
        const input = form.querySelector('input[name="media"]');
        if (input) input.value = '';
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
      const { chambre, x, y, numero, lot, entreprise, localisation, observation } = bulle;
      recordAction('suppression', {
        etage: etageSelect.selectedOptions[0].textContent,
        chambre,
        x,
        y,
        nomBulle: `Bulle ${numero}`,
        description: '',
        lot,
        entreprise,
        localisation,
        observation
      });
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
        'Revetement SDB','Peinture','Revetement de sol','Repose'
        // F, G, H, I et PMR retirés
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
        <label>Entreprise :
          <select name="entreprise_id"></select>
          ${user && ['launay.jeremy@batirenov.info','blot.valentin@batirenov.info'].includes(user.email) ? '<button type="button" id="addEntrepriseBtn">+ Nouvelle entreprise</button>' : ''}
        </label><br>
        <input type="text" name="localisation" placeholder="Localisation" /><br>
        <input type="text" name="observation" placeholder="Observation" /><br>
        <input type="date" name="date_butoir" /><br>
        <input type="file" name="media" multiple accept="image/*,video/*" /><br>
        <button type="submit">✅ Ajouter</button>
        <button type="button" onclick="closePopups()">Annuler</button>
      `;

      const entrepriseSelect = form.querySelector('select[name="entreprise_id"]');
      entrepriseSelect.innerHTML = entreprises.map(e => `<option value="${e.id}">${e.nom}</option>`).join('');

      const addEntBtn = form.querySelector('#addEntrepriseBtn');
      if (addEntBtn) {
        addEntBtn.onclick = async () => {
          const nom = prompt('Nom de la nouvelle entreprise');
          if (!nom) return;
          await fetch('/api/entreprises', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ nom })
          });
          await loadEntreprises();
          entrepriseSelect.innerHTML = entreprises.map(e => `<option value="${e.id}">${e.nom}</option>`).join('');
        };
      }

      form.onsubmit = ev => {
        ev.preventDefault();
        if (!user) {
          alert('Vous devez être connecté pour ajouter une bulle.');
          return;
        }
        // FormData(form) already contains all file inputs including media
        const formData = new FormData(form);
        formData.append('chantier_id', chantierSelect.value);
        formData.append('etage_id', etageSelect.value);
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
        const entrepriseSelect2 = form.querySelector('select[name="entreprise_id"]');
        const entrepriseId = formData.get('entreprise_id');
        const entreprise = entrepriseSelect2.selectedOptions[0]?.textContent || '';
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
              etage: etageSelect.selectedOptions[0].textContent,
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
      const input = form.querySelector('input[name="media"]');
      if (input) input.value = '';
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

    chantierSelect.onchange = () => {
      nextNumero = 1;
      updateFloorOptions(chantierSelect.value);
    };
    etageSelect.onchange = () => {
      const id = etageSelect.value;
      loadPlan(id);
      updateRoomOptions(id);
      loadBulles();
    };
      chambreSelect.onchange = loadBulles;
      exportBtn.onclick = async () => {
        const fmt = (formatSelect.value || 'csv').toLowerCase();
        if (fmt !== 'pdf') {
          const params = new URLSearchParams();
          params.set('chantier_id', chantierSelect.value);
          params.set('etage_id',    etageSelect.value);
          params.set('chambre',     chambreSelect.value);
          params.set('format',      fmt);
          document.querySelectorAll('#export-columns input[name="col"]:checked')
            .forEach(cb => params.append('columns', cb.value));
          window.open(`/api/bulles/export?${params.toString()}`, '_blank');
          return;
        }

        // ---- PDF ----
        const chantierId = chantierSelect.value;
        const etageId    = etageSelect.value;
        let url = `/api/bulles?chantier_id=${chantierId}&etage_id=${etageId}`;
        if (chambreSelect.value !== 'total') url += `&chambre=${chambreSelect.value}`;
        const data = await fetch(url, { credentials:'include' }).then(r => r.json());

        const selected = getCheckedColumns();

        // Ordre lisible + "photos" toujours en dernier si cochée
        const ORDER = ['created_by_email','etage','chambre','numero','lot','intitule','description','etat','entreprise','localisation','observation','date_butoir','photos'];
        let cols = ORDER.filter(c => selected.includes(c));
        if (selected.includes('photos')) {
          cols = cols.filter(c => c !== 'photos');
          cols.push('photos');
        }

        if (!window.jspdf || !window.jspdf.jsPDF) {
          alert('Export PDF indisponible (librairies non chargées)');
          return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation:'landscape', unit:'pt', format:'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 24;

        const LABELS = {
          created_by_email:'Créé par',
          etage:'Étage', chambre:'Chambre', numero:'N°', lot:'Lot',
          intitule:'Intitulé', description:'Description', etat:'État',
          entreprise:'Entreprise', localisation:'Localisation',
          observation:'Observation', date_butoir:'Date butoir',
          photos:'Photos'
        };

        // Largeurs de base (ajustées ensuite pour rentrer dans la page)
        const BASE = {
          created_by_email: 120,
          etage: 50, chambre: 60, numero: 36, lot: 70,
          intitule: 140, description: 260, etat: 72,
          entreprise: 100, localisation: 120,
          observation: 160, date_butoir: 86,
          photos: 200
        };

        // Prépare les vignettes photos (max 3)
        const photoThumbsPerRow = await Promise.all(
          data.map(async b => {
            const photos = Array.isArray(b.media) ? b.media.filter(m => m.type === 'photo') : [];
            const subset = photos.slice(0, 3);
            const urls = await Promise.all(subset.map(p => imageUrlToDataURL(p.path, 220)));
            return urls.filter(Boolean);
          })
        );

        // Datasource table
        const head = [cols.map(c => LABELS[c] || c.toUpperCase())];
        const body = data.map((row, idx) => cols.map(c => {
          if (c === 'photos') {
            return (photoThumbsPerRow[idx].length ? ' ' : '—');
          }
          if (c === 'created_by_email') {
            return resolveCreatedBy(row);
          }
          return softText(row[c], c === 'description' ? 500 : 220);
        }));

        // Styles & largeurs ajustées pour tenir dans la page
        const columnStyles = computeColumnStyles(cols, BASE, pageW, margin, margin, 36);

        // Titre
        doc.setFontSize(12);
        const chantierNom = chantierSelect.options[chantierSelect.selectedIndex]?.text || chantierSelect.value;
        doc.text(`Export bulles — Chantier: ${chantierNom} — Étage: ${etageSelect.value} — Chambre: ${chambreSelect.value}`, margin, margin);

        // Table
        doc.autoTable({
          head, body,
          startY: margin + 14,
          margin: { left: margin, right: margin },
          tableWidth: 'wrap',
          styles: {
            fontSize: 9,
            cellPadding: 4,
            overflow: 'linebreak',
            lineColor: [230,230,230],
            lineWidth: 0.2,
            valign: 'top'
          },
          headStyles: { fillColor: [15,23,42], textColor: 255, halign: 'center' },
          columnStyles,
          rowPageBreak: 'avoid',
          didParseCell: (h) => {
            const colName = cols[h.column.index];
            if (h.section === 'body' && colName === 'photos') {
              // hauteur mini pour cas avec vignettes
              h.cell.height = Math.max(h.cell.height, 28 + 8);
            }
          },
          didDrawCell: (h) => {
            if (h.section !== 'body') return;
            const colName = cols[h.column.index];
            if (colName !== 'photos') return;
            const thumbs = photoThumbsPerRow[h.row.index] || [];
            if (!thumbs.length) return;
            const { x, y, height } = h.cell;
            const W = 34, H = 22, GAP = 6;
            let cx = x + 4;
            const cy = y + (height - H) / 2;
            thumbs.forEach((d) => {
              try { doc.addImage(d, 'JPEG', cx, cy, W, H); } catch(_){ }
              cx += W + GAP;
            });
            h.cell.text = []; // pas de texte dans la cellule
          }
        });

        // Pied de page
        const pageCount = doc.getNumberOfPages();
        for (let i=1; i<=pageCount; i++) {
          doc.setPage(i);
          doc.setFontSize(8);
          doc.text(`${i} / ${pageCount}`, pageW - margin, pageH - 10, { align: 'right' });
        }

        doc.save('export_bulles_' + new Date().toISOString().slice(0,10) + '.pdf');
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
