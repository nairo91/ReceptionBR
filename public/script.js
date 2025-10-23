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
  const body = document.body;

  const setLoginVisible = (isVisible) => {
    if (isVisible) {
      body.classList.add('login-page');
    } else {
      body.classList.remove('login-page');
    }
    loginContainer.style.display = isVisible ? 'flex' : 'none';
    appContainer.style.display = isVisible ? 'none' : 'block';
  };

  let user = null;
  const ADMIN_EMAIL_KEYWORDS = ['launay', 'blot', 'athari', 'mirona'];
  function isAdminUser(targetUser) {
    if (!targetUser) return false;
    if ((targetUser.role || '').toLowerCase() === 'admin') return true;
    const email = (targetUser.email || '').toLowerCase();
    return ADMIN_EMAIL_KEYWORDS.some(keyword => email.includes(keyword));
  }

  async function refresh() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        user = data.user;
        setLoginVisible(false);
        await initApp();
      } else {
        setLoginVisible(true);
      }
    } catch (err) {
      console.error(err);
      setLoginVisible(true);
    }
  }

  async function initApp() {
    const chantierSelect   = document.getElementById("chantierSelect");
    const etageSelect      = document.getElementById("etageSelect");
    const chambreSelect    = document.getElementById("chambreSelect");
    const exportBtn        = document.getElementById("exportBtn");
    const exportRunBtn     = document.getElementById("exportRunBtn");
    const exportPhaseBtn   = document.getElementById("exportPhaseBtn");
    const formatSelect     = document.getElementById("export-format");
    const phaseSelect      = document.getElementById("phaseSelect");
    const plan             = document.getElementById("plan");
    const bullesContainer  = document.getElementById("bulles-container");
    const statusFilter     = document.getElementById("statusFilter");

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

    // ======== Export modal (UI) ========
    const exportModal      = document.getElementById('exportModal');
    const exportModalCols  = document.getElementById('exportModalCols');
    const exportConfirmBtn = document.getElementById('export-confirm');
    const modalCloseEls    = Array.from(document.querySelectorAll('[data-export-close]'));

    function populateExportModalColumns() {
      if (!exportModalCols) return;
      const sourceFieldset = document.getElementById('export-columns');
      if (!sourceFieldset) return;
      exportModalCols.innerHTML = '';
      const sourceCheckboxes = Array.from(sourceFieldset.querySelectorAll('input[type="checkbox"]'));
      sourceCheckboxes.forEach((sourceCheckbox, index) => {
        const sourceLabel = sourceCheckbox.closest('label');
        let clone;
        if (sourceLabel) {
          clone = sourceLabel.cloneNode(true);
        } else {
          clone = sourceCheckbox.cloneNode(true);
        }
        const cloneCheckbox = clone.querySelector ? clone.querySelector('input[type="checkbox"]') : clone;
        if (cloneCheckbox) {
          cloneCheckbox.checked = sourceCheckbox.checked;
          cloneCheckbox.dataset.exportSourceIndex = String(index);
          if (cloneCheckbox.id) {
            cloneCheckbox.removeAttribute('id');
          }
        }
        exportModalCols.appendChild(clone);
      });
    }

    function syncModalFormatFromSelect() {
      if (!exportModal) return;
      const currentFormat = (formatSelect?.value || 'csv').toLowerCase();
      const radios = Array.from(exportModal.querySelectorAll('input[name="exportFormat"]'));
      let matched = false;
      radios.forEach(radio => {
        const isMatch = radio.value?.toLowerCase() === currentFormat;
        radio.checked = isMatch;
        if (isMatch) matched = true;
      });
      if (!matched && radios[0]) {
        radios[0].checked = true;
      }
    }

    function openExportModal() {
      if (!exportModal) return;
      populateExportModalColumns();
      syncModalFormatFromSelect();
      exportModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    function closeExportModal() {
      if (!exportModal) return;
      exportModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', openExportModal);
    }

    modalCloseEls.forEach((el) => {
      el.addEventListener('click', closeExportModal);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && exportModal?.getAttribute('aria-hidden') === 'false') {
        closeExportModal();
      }
    });

    if (exportConfirmBtn) {
      exportConfirmBtn.addEventListener('click', () => {
        const selectedRadio = exportModal?.querySelector('input[name="exportFormat"]:checked');
        const chosenFormat = (selectedRadio?.value || 'csv').toLowerCase();
        if (formatSelect) {
          formatSelect.value = chosenFormat;
        }

        const sourceFieldset = document.getElementById('export-columns');
        if (sourceFieldset && exportModalCols) {
          const sourceCheckboxes = Array.from(sourceFieldset.querySelectorAll('input[type="checkbox"]'));
          const modalCheckboxes = Array.from(exportModalCols.querySelectorAll('input[type="checkbox"]'));
          modalCheckboxes.forEach((modalCheckbox) => {
            const index = Number(modalCheckbox.dataset.exportSourceIndex ?? -1);
            if (!Number.isNaN(index) && sourceCheckboxes[index]) {
              sourceCheckboxes[index].checked = modalCheckbox.checked;
            }
          });
        }

        closeExportModal();
        if (exportRunBtn) {
          exportRunBtn.click();
        } else {
          console.warn('Bouton d\'export principal introuvable, export non déclenché.');
          alert("Export configuré, mais le déclencheur d'origine est introuvable.");
        }
      });
    }
    // ======== /Export modal ========

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

    async function getImageRatio(dataUrl) {
      return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalHeight / img.naturalWidth || 1);
        img.src = dataUrl;
      });
    }

    // Calcule des largeurs de colonnes adaptées à la page
    function computeColumnStyles(cols, baseWidths, pageWidth, marginLeft, marginRight, minW = 36, minByColumn = {}) {
      const available = pageWidth - marginLeft - marginRight;
      const getMinWidth = (col) => Math.max(minW, minByColumn[col] ?? 0);
      const base = cols.map(c => {
        const bw = baseWidths[c] ?? 90;
        return Math.max(bw, getMinWidth(c));
      });
      let sum = base.reduce((a,b)=>a+b,0);

      // Toujours garder "Photos" en dernier (si présente)
      // (c’est géré dans la construction de "cols" plus bas)

      // Si ça dépasse, on scale uniformément mais en respectant un minimum
      if (sum > available) {
        const scale = available / sum;
        for (let i=0;i<base.length;i++) {
          const col = cols[i];
          base[i] = Math.max(getMinWidth(col), Math.floor(base[i]*scale));
        }
        sum = base.reduce((a,b)=>a+b,0);
        // Si malgré tout ça dépasse encore (beaucoup de colonnes), on réitère en forçant le min
        if (sum > available) {
          const overflow = sum - available;
          // Retire quelques pixels proportionnellement
          const k = overflow / base.length;
          for (let i=0;i<base.length;i++) {
            const col = cols[i];
            base[i] = Math.max(getMinWidth(col), base[i] - Math.ceil(k));
          }
        }
      }

      for (let i=0;i<base.length;i++) {
        const col = cols[i];
        const min = getMinWidth(col);
        if (base[i] < min) base[i] = min;
      }

      const columnStyles = {};
      cols.forEach((c, i) => { columnStyles[i] = { cellWidth: base[i] }; });
      return columnStyles;
    }

    // Normalise "Créé par" vers un email lisible
    function resolveCreatedBy(row){
      return row?.created_by_email
          || row?.created_by?.email
          || '—';
    }
    function localPart(email) {
      if (!email || typeof email !== 'string') return '—';
      const at = email.indexOf('@');
      return at > 0 ? email.slice(0, at) : email;
    }
    function resolveModifiedBy(row){
      return row?.modified_by_email || row?.modified_by?.email || '—';
    }

    // Texte adouci avec wrap
    function softText(v, max = 300) {
      const s = (v ?? '').toString().replace(/\s+/g, ' ').trim();
      return s.length > max ? s.slice(0, max) + '…' : s;
    }

    // Boutons d'ajout visibles pour Jeremy Launay, Valentin Blot et Keivan Athari
    if (user && ['launay.jeremy@batirenov.info','blot.valentin@batirenov.info','athari.keivan@batirenov.info'].includes(user.email)) {
      const chBtn = document.getElementById('addChantierBtn');
      const etBtn = document.getElementById('addEtageBtn');
      const roomBtn = document.getElementById('addRoomBtn');
      const uploadBtn = document.getElementById('uploadPlanBtn');

      if (chBtn) {
        chBtn.classList.remove('is-hidden');
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
      }

      if (etBtn) {
        etBtn.classList.remove('is-hidden');
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
      }

      if (roomBtn) {
        roomBtn.classList.remove('is-hidden');
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
      }

      if (uploadBtn) {
        const uploadInput = document.createElement('input');
        uploadInput.type = 'file';
        uploadInput.accept = '.pdf,.png';
        uploadInput.id = 'uploadPlanInput';
        uploadInput.className = 'is-hidden';
        const etageControl = etageSelect?.parentNode;
        const etActions = etageControl?.querySelector('.filter-actions');
        if (etActions) etActions.parentNode.insertBefore(uploadInput, etActions);
        uploadBtn.classList.remove('is-hidden');
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
        `<option value="${e.id}" data-floor-id="${e.id}">${e.name}</option>`
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
              <option value="a_corriger" ${bulle.etat === 'a_corriger' ? 'selected' : ''}>🔴 À corriger</option>
              <option value="levee" ${bulle.etat === 'levee' ? 'selected' : ''}>🟢 Levée</option>
            </select>
          </label><br>
          <label>Lot :
            <select name="lot">
              <option value="">-- Sélectionner un lot --</option>
              ${lotOptions}
            </select>
          </label><br>
          <input type="text" name="localisation" placeholder="Localisation" value="${bulle.localisation || ''}" /><br>
          <input type="text" name="observation" placeholder="Observation" value="${bulle.observation || ''}" /><br>
          <input type="date" name="date_butoir" value="${bulle.date_butoir ? bulle.date_butoir.substring(0,10) : ''}" /><br>
          <input type="file" name="media" multiple accept="image/*,video/*" /><br>
          ${Array.isArray(bulle.media) ? bulle.media.filter(m => m.type === 'photo' || m.type === 'video').map(m => {
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
          <button type="button" class="btn-levee" id="leveeBtn">🧰 Lever la réserve</button>
          <button type="submit">💾 Enregistrer</button>
          <button type="button" id="deleteBtn">🗑️ Supprimer</button>
          <button type="button" onclick="closePopups()">Fermer</button>
        `;

        const canEditBulle = isAdminUser(user);
        // Refiltrer en live si l'état est modifié dans le formulaire
        const etatSelect = form.querySelector('select[name="etat"]');
        if (etatSelect) {
          if (canEditBulle) {
            etatSelect.addEventListener('change', (e) => {
              const v = e.target.value || '';
              div.dataset.etat = v;
              div.style.backgroundColor = getColorByEtat(v);
              if (typeof filterBulles === 'function') filterBulles();
            });
          } else {
            etatSelect.disabled = true;
          }
        }

        if (!canEditBulle) {
          ['intitule', 'localisation', 'observation'].forEach(name => {
            const input = form.querySelector(`input[name="${name}"]`);
            if (input) {
              input.readOnly = true;
              input.classList.add('readonly-field');
            }
          });
          const descField = form.querySelector('textarea[name="description"]');
          if (descField) {
            descField.readOnly = true;
            descField.classList.add('readonly-field');
          }
          const lotField = form.querySelector('select[name="lot"]');
          if (lotField) lotField.disabled = true;
          const dateField = form.querySelector('input[name="date_butoir"]');
          if (dateField) dateField.disabled = true;
          const mediaField = form.querySelector('input[name="media"]');
          if (mediaField) {
            mediaField.disabled = true;
            mediaField.style.display = 'none';
          }
          const submitBtn = form.querySelector('button[type="submit"]');
          if (submitBtn) submitBtn.remove();
        }

        const deleteBtn = form.querySelector('#deleteBtn');
        if (deleteBtn) {
          if (canEditBulle) {
            deleteBtn.onclick = () => confirmDelete(bulle);
          } else {
            deleteBtn.remove();
          }
        }

        const leveeBtn = form.querySelector('#leveeBtn');
        if (leveeBtn) leveeBtn.onclick = () => openLeveeDialog(bulle);

        if (canEditBulle) {
          form.onsubmit = e => {
            e.preventDefault();
            if (!user) {
              alert('Vous devez être connecté pour modifier.');
              return;
            }
            const formData = new FormData(form);
            formData.append('chantier_id', chantierSelect.value);
            formData.append('etage_id', etageSelect.value);
            const desc = formData.get('description');
            const lot = formData.get('lot');
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
                  localisation,
                  observation
                });
            });
          };
        } else {
          form.addEventListener('submit', e => e.preventDefault());
        }

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
        case 'a_corriger': return '#e74c3c';
        case 'levee': return '#2ecc71';
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

    function openLeveeDialog(bulle) {
      const form = document.createElement('form');
      form.className = 'popup-content';
      form.enctype = 'multipart/form-data';
      form.innerHTML = `
        <h3>Levée de réserve</h3>
        <label>Fait par :
          <input type="text" name="levee_fait_par_email" value="${user?.email || bulle.levee_fait_par_email || ''}" readonly>
        </label><br>
        <label>Fait le :
          <input type="date" name="levee_fait_le" value="${bulle.levee_fait_le ? bulle.levee_fait_le.substring(0,10) : ''}">
        </label><br>
        <label>Commentaire levée :
          <textarea name="levee_commentaire" placeholder="Commentaire">${bulle.levee_commentaire || ''}</textarea>
        </label><br>
        <label>Photo Levée :
          <input type="file" name="levee_media" multiple accept="image/*">
        </label>
        ${Array.isArray(bulle.media) ? bulle.media.filter(m=>m.type==='levee_photo').map(m => `
          <img src="${m.path}" class="preview" onclick="zoomImage('${m.path}')" />
        `).join('') : ''}
        <button type="submit">Enregistrer la levée</button>
        <button type="button" onclick="closePopups()">Fermer</button>
      `;
      form.onsubmit = ev => {
        ev.preventDefault();
        const fd = new FormData();
        fd.append('chantier_id', chantierSelect.value);
        fd.append('etage_id', etageSelect.value);
        const dateInput = form.querySelector('input[name="levee_fait_le"]');
        const commentInput = form.querySelector('textarea[name="levee_commentaire"]');
        fd.append('levee_fait_le', dateInput.value || '');
        fd.append('levee_commentaire', commentInput.value || '');
        fd.append('levee_fait_par', user?.id || '');
        const files = form.querySelector('input[name="levee_media"]').files;
        for (const file of files) fd.append('levee_media', file);
        // Preserve existing bubble fields to avoid clearing them during PUT
        fd.append('description', bulle.description ?? '');
        fd.append('intitule', bulle.intitule ?? '');
        fd.append('etat', 'levee');
        fd.append('lot', bulle.lot ?? '');
        fd.append('localisation', bulle.localisation ?? '');
        fd.append('observation', bulle.observation ?? '');
        fd.append('date_butoir', bulle.date_butoir ? bulle.date_butoir.substring(0,10) : '');
        fetch(`/api/bulles/${bulle.id}`, {
          method: 'PUT',
          credentials: 'include',
          body: fd
        }).then(() => {
          closePopups();
          loadBulles();
        });
      };
      showPopup(0, 0, form);
      const input = form.querySelector('input[name="levee_media"]');
      if (input) input.value = '';
    }

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
      const { chambre, x, y, numero, lot, localisation, observation } = bulle;
      recordAction('suppression', {
        etage: etageSelect.selectedOptions[0].textContent,
        chambre,
        x,
        y,
        nomBulle: `Bulle ${numero}`,
        description: '',
        lot,
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
            <option value="a_corriger" selected>🔴 À corriger</option>
            <option value="levee">🟢 Levée</option>
          </select>
        </label><br>
        <label>Lot :
          <select name="lot">
            <option value="" selected>-- Sélectionner un lot --</option>
            ${lotOptions}
          </select>
        </label><br>
        <input type="text" name="localisation" placeholder="Localisation" /><br>
        <input type="text" name="observation" placeholder="Observation" /><br>
        <input type="date" name="date_butoir" /><br>
        <input type="file" name="media" multiple accept="image/*,video/*" /><br>
        <button type="submit">✅ Ajouter</button>
        <button type="button" onclick="closePopups()">Annuler</button>
      `;

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
    if (exportPhaseBtn) {
      exportPhaseBtn.addEventListener('click', () => {
        const fmt = (formatSelect?.value || 'csv').toLowerCase();
        const selectedOption = etageSelect?.selectedOptions?.[0];
        const etageId = selectedOption?.dataset?.floorId
          || selectedOption?.value
          || etageSelect?.value;
        if (!etageId) {
          console.warn('Impossible de déterminer etage_id pour export phase');
          return;
        }
        const phaseValue = phaseSelect?.value || '';
        const url = new URL('/api/bulles/export', window.location.origin);
        url.searchParams.set('format', fmt);
        url.searchParams.set('etage_id', etageId);
        if (phaseValue) {
          url.searchParams.set('phase', phaseValue);
        }
        // 🔽 Colonnes par défaut pour l’export PAR PHASE (mets ici celles de ta capture)
        const PHASE_DEFAULT_COLUMNS = [
          'etage',
          'chambre',
          'numero',
          'lot',
          'intitule',
          'description',
          'etat',
          'entreprise',
          'localisation',
          'observation',
          'date_butoir',
          // médias utiles en export phase
          'creation_photos',
          'levee_photos',
          // auteurs & levée (à désactiver si tu n’en veux pas)
          'created_by_email',
          'modified_by_email',
          'levee_fait_par_email',
          'levee_commentaire',
          'levee_fait_le'
        ];
        PHASE_DEFAULT_COLUMNS.forEach(c => url.searchParams.append('columns', c));
        window.open(url.toString(), '_blank');
      });
    }
    if (exportRunBtn) exportRunBtn.onclick = async () => {
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

        // Ordre: Photos juste avant le bloc Levée ; Levée = Fait par, Commentaire, Fait le
        const ORDER = [
          'created_by_email','modified_by_email',
          'etage','chambre','numero','lot','intitule','description','etat','localisation','observation','date_butoir',
          'creation_photos','levee_photos','photos',
          'levee_fait_par_email','levee_commentaire','levee_fait_le'
        ];
        let cols = ORDER.filter(c => selected.includes(c));
        // On impose l’ordre exact défini ci-dessus, sans repousser "photos" en dernier

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
          modified_by_email:'Modifié par',
          levee_fait_par_email:'Fait par',
          levee_fait_le:'Fait le',
          levee_commentaire:'Levée – Commentaire',
          etage:'Étage', chambre:'Chambre', numero:'N°', lot:'Lot',
          intitule:'Intitulé', description:'Description', etat:'État', localisation:'Localisation',
          observation:'Observation', date_butoir:'Date butoir',
          photos:'Photos (tous les liens)',
          creation_photos:'Photos (création)',
          levee_photos:'Photos (levée)'
        };

        const PHOTO_CELL_PADDING = 4;
        const PHOTO_THUMB_WIDTH  = 60;
        const PHOTO_THUMB_HEIGHT = 45;
        const PHOTO_THUMB_GAP    = 8;
        const MAX_PHOTO_THUMBS   = 3;
        const PHOTO_COLUMNS = ['photos','creation_photos','levee_photos'];
        const PHOTO_COLUMN_MIN_WIDTH =
          (PHOTO_THUMB_WIDTH * MAX_PHOTO_THUMBS)
          + (PHOTO_THUMB_GAP * Math.max(0, MAX_PHOTO_THUMBS - 1))
          + (PHOTO_CELL_PADDING * 2);
        const PHOTO_ROW_MIN_HEIGHT = PHOTO_THUMB_HEIGHT + (PHOTO_CELL_PADDING * 2) + 4;

        // Largeurs de base (ajustées ensuite pour rentrer dans la page)
        const BASE = {
          created_by_email: 120,
          modified_by_email: 120,
          etage: 50, chambre: 60, numero: 36, lot: 70,
          intitule: 140, description: 260, etat: 72,
          localisation: 120,
          observation: 160, date_butoir: 86,
          photos: 240,
          creation_photos: 240,
          levee_photos: 240,
          // colonnes "Levée"
          levee_fait_par_email: 120,
          levee_commentaire: 160,
          // on élargit un peu la date pour éviter l'écrasement
          levee_fait_le: 110
        };

        // Prépare les vignettes photos (max MAX_PHOTO_THUMBS)
        const photoThumbsPerRow = await Promise.all(
          data.map(async b => {
            const media = Array.isArray(b.media) ? b.media : [];
            const creationMedia = media.filter(m => m.type === 'photo');
            const leveeMedia = media.filter(m => m.type === 'levee_photo');

            const loadThumbs = async (entries) => {
              const subset = entries.slice(0, MAX_PHOTO_THUMBS);
              const urls = await Promise.all(subset.map(p => imageUrlToDataURL(p.path, 220)));
              return urls.filter(Boolean);
            };

            const creationThumbs = await loadThumbs(creationMedia);
            const leveeThumbs = await loadThumbs(leveeMedia);
            const combinedThumbs = [...creationThumbs, ...leveeThumbs].slice(0, MAX_PHOTO_THUMBS);

            return {
              creation_photos: creationThumbs,
              levee_photos: leveeThumbs,
              photos: combinedThumbs
            };
          })
        );

        // Datasource table
        const head = [cols.map(c => LABELS[c] || c.toUpperCase())];
        const body = data.map((row, idx) => cols.map(c => {
          if (PHOTO_COLUMNS.includes(c)) {
            const thumbs = photoThumbsPerRow[idx]?.[c] || [];
            return thumbs.length ? ' ' : '—';
          }
          if (c === 'created_by_email') return resolveCreatedBy(row);
          if (c === 'modified_by_email') return resolveModifiedBy(row);
          if (c === 'levee_fait_par_email') return localPart(row.levee_fait_par_email);
          if (c === 'levee_fait_le') return formatDateFR(row.levee_fait_le);
          if (c === 'date_butoir')  return formatDateFR(row.date_butoir);
          return softText(row[c], (c === 'description' || c === 'levee_commentaire') ? 500 : 220);
        }));

        // Styles & largeurs adaptées pour tenir dans la page
        const minWidths = {};
        PHOTO_COLUMNS.forEach(col => {
          if (cols.includes(col)) {
            minWidths[col] = PHOTO_COLUMN_MIN_WIDTH;
          }
        });
        const columnStyles = computeColumnStyles(cols, BASE, pageW, margin, margin, 36, minWidths);
        // centre la date de levée pour une meilleure lisibilité
        const idxLevDate = cols.indexOf('levee_fait_le');
        if (idxLevDate >= 0) {
          columnStyles[idxLevDate] = { ...(columnStyles[idxLevDate]||{}), halign: 'center' };
        }

        // Préparation du filigrane (chargé une seule fois)
        let watermark;
        const resp = await fetch('/img/brh-logo.png', { credentials: 'include' });
        if (resp.ok) {
          const blob = await resp.blob();
          watermark = await new Promise((resolve) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.readAsDataURL(blob);
          });
        }
        const ratio   = watermark ? await getImageRatio(watermark) : 1;
        const targetW = pageW * 0.60;
        const targetH = targetW * ratio;
        const posX    = (pageW - targetW) / 2;
        const posY    = (pageH - targetH) / 2;

        // Titre
        doc.setFontSize(12);
        // Helpers: format date courte + libellé d'étage affiché
        function formatDateFR(v) {
          if (!v) return '—';
          const d = new Date(v);
          if (isNaN(d)) return '—';
          // ex: "02 sept 2025" (retire le point abréviation éventuel)
          return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' }).replace('.', '');
        }
        const chantierNom = chantierSelect.options[chantierSelect.selectedIndex]?.text || chantierSelect.value;
        const etageLabel  = etageSelect.options[etageSelect.selectedIndex]?.text || etageSelect.value;
        doc.text(`Reception compte rendu — Chantier: ${chantierNom} — Étage: ${etageLabel} — Chambre: ${chambreSelect.value}`, margin, margin);

        // Table
        doc.autoTable({
          head, body,
          startY: margin + 16,
          margin: { left: margin, right: margin },
          tableWidth: 'wrap',
          showHead: 'everyPage',
          theme: 'grid',
          styles: {
            fillColor: undefined,
            textColor: [0,0,0],
            fontSize: 9,
            cellPadding: PHOTO_CELL_PADDING,
            overflow: 'linebreak',
            lineColor: [230,230,230],
            lineWidth: 0.2,
            valign: 'top'
          },
          headStyles: {
            fillColor: [15,23,42],
            textColor: 255,
            halign: 'center'
          },
          alternateRowStyles: {
            fillColor: [245, 247, 250]
          },
          columnStyles,
          rowPageBreak: 'avoid',
          didParseCell: (h) => {
            const colName = cols[h.column.index];
            if (h.section === 'body' && PHOTO_COLUMNS.includes(colName)) {
              // hauteur mini pour cas avec vignettes
              h.cell.height = Math.max(h.cell.height, PHOTO_ROW_MIN_HEIGHT);
            }
          },
          didDrawCell: (h) => {
            if (h.section !== 'body') return;
            const colName = cols[h.column.index];
            if (!PHOTO_COLUMNS.includes(colName)) return;
            const rowThumbs = photoThumbsPerRow[h.row.index] || {};
            const thumbs = rowThumbs[colName] || [];
            if (!thumbs.length) return;
            const { x, y, height } = h.cell;
            let cx = x + PHOTO_CELL_PADDING;
            const cy = y + (height - PHOTO_THUMB_HEIGHT) / 2;
            thumbs.forEach((d) => {
              try { doc.addImage(d, 'JPEG', cx, cy, PHOTO_THUMB_WIDTH, PHOTO_THUMB_HEIGHT); } catch(_){ }
              cx += PHOTO_THUMB_WIDTH + PHOTO_THUMB_GAP;
            });
            h.cell.text = []; // pas de texte dans la cellule
          },
          didDrawPage: () => {
            if (!watermark) return;
            const hasGState = typeof doc.GState === 'function' && typeof doc.setGState === 'function';
            if (hasGState) {
              const gs = new doc.GState({ opacity: 0.15 });
              doc.setGState(gs);
            }
            doc.addImage(watermark, 'PNG', posX, posY, targetW, targetH);
            if (hasGState) {
              const gsNorm = new doc.GState({ opacity: 1 });
              doc.setGState(gsNorm);
            }
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
      setLoginVisible(false);
      // Render the sidebar now that we are authenticated
      if (window.renderSidebar) {
        try { await window.renderSidebar(); } catch(_){ }
      }
      await initApp();
    } else {
      setLoginVisible(true);
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

  setLoginVisible(true);
  refresh();
});
