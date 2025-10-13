window.addEventListener('DOMContentLoaded', () => {
  const tbody = document.querySelector('#historyTable tbody');
  const columns = [
    { label: 'Utilisateur', value: data => data.username || '' },
    { label: 'Action', value: data => data.action_type || '' },
    { label: 'Chantier', value: data => data.chantier || '' },
    { label: 'Intitulé', value: data => data.intitule || '' },
    { label: 'État', value: data => data.etat || '' },
    { label: 'Étage', value: data => data.etage || '' },
    { label: 'Chambre', value: data => data.chambre || '' },
    { label: 'N°', value: data => data.bulle_numero || '' },
    { label: 'Lot', value: data => data.lot || '' },
    { label: 'Localisation', value: data => data.localisation || '' },
    { label: 'Observation', value: data => data.observation || '' },
    { label: 'Description', value: data => data.description || '' },
    { label: 'Date/Heure', value: data => data.created_at ? new Date(data.created_at).toLocaleString() : '' }
  ];

  function renderRows(rows) {
    if (!rows || rows.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = columns.length;
      cell.dataset.label = 'Information';
      cell.textContent = 'Aucune action enregistrée.';
      row.appendChild(cell);
      tbody.innerHTML = '';
      tbody.appendChild(row);
      return;
    }
    tbody.innerHTML = rows.map(data => `
      <tr>
        ${columns.map(column => `
          <td data-label="${column.label}">${column.value(data)}</td>
        `).join('')}
      </tr>
    `).join('');
  }

  async function loadFilters() {
    const ch = await fetch('/api/chantiers', {credentials:'include'}).then(r=>r.json());
    document.getElementById('filter-chantier').innerHTML =
      '<option value="">Tous</option>' +
      ch.map(c=>`<option value="${c.id}">${c.nom}</option>`).join('');

    document.getElementById('filter-chantier').onchange = async e => {
      const et = await fetch(`/api/floors?chantier_id=${e.target.value}`,
        {credentials:'include'}).then(r=>r.json());
      document.getElementById('filter-etage').innerHTML =
        '<option value="">Tous</option>' +
        et.map(f=>`<option value="${f.id}">${f.name}</option>`).join('');
      document.getElementById('filter-chambre').innerHTML = '<option value="">Toutes</option>';
    };

    document.getElementById('filter-etage').onchange = async e => {
      const rooms = await fetch(`/api/rooms?floor_id=${e.target.value}`,
        {credentials:'include'}).then(r=>r.json());
      document.getElementById('filter-chambre').innerHTML =
        '<option value="">Toutes</option>' +
        rooms.map(r=>`<option value="${r.name}">${r.name}</option>`).join('');
    };
  }

  loadFilters();

  document.getElementById('history-filters').onsubmit = e => {
    e.preventDefault();
    const qs = new URLSearchParams({
      chantier_id: document.getElementById('filter-chantier').value || '',
      etage_id:    document.getElementById('filter-etage').value || '',
      chambre:     document.getElementById('filter-chambre').value || '',
      lot:         document.getElementById('filter-lot').value || ''
    });
    fetch('/api/history?' + qs.toString(), {credentials:'include'})
      .then(r=>r.json())
      .then(renderRows)
      .catch(err => {
        console.error(err);
        renderRows([]);
      });
  };

  fetch('/api/history', { credentials: 'include' })
    .then(r => r.json())
    .then(renderRows)
    .catch(err => {
      console.error(err);
      renderRows([]);
    });

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
});
