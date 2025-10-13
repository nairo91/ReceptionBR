window.addEventListener('DOMContentLoaded', () => {
  const tbody = document.querySelector('#historyTable tbody');

  function renderRows(rows) {
    if (!rows || rows.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 13;
      cell.textContent = 'Aucune action enregistrée.';
      row.appendChild(cell);
      tbody.innerHTML = '';
      tbody.appendChild(row);
      return;
    }
    tbody.innerHTML = rows.map(data => `
      <tr>
        <td>${data.username}</td>
        <td>${data.action_type}</td>
        <td>${data.chantier}</td>
        <td>${data.intitule || ''}</td>
        <td>${data.etat || ''}</td>
        <td>${data.etage}</td>
        <td>${data.chambre}</td>
        <td>${data.bulle_numero}</td>
        <td>${data.lot}</td>
        <td>${data.localisation || ''}</td>
        <td>${data.observation || ''}</td>
        <td>${data.description || ''}</td>
        <td>${new Date(data.created_at).toLocaleString()}</td>
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
