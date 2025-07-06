window.addEventListener('DOMContentLoaded', () => {
  const tbody = document.querySelector('#historyTable tbody');
  const floorFilter = document.getElementById('filter-etage');
  const lotFilter = document.getElementById('filter-lot');
  let entries = [];

  const query = new URLSearchParams({
    etage: floorFilter.value || '',
    lot: lotFilter.value || ''
  }).toString();

  fetch(`/api/history?${query}`)
    .then(res => res.ok ? res.json() : [])
    .then(data => {
      entries = data;
      const floors = [...new Set(entries.map(e => e.etage).filter(Boolean))];
      const lots = [...new Set(entries.map(e => e.lot).filter(Boolean))];

      floorFilter.innerHTML = ['<option value="">Tous</option>']
        .concat(floors.map(f => `<option value="${f}">${f}</option>`))
        .join('');
      lotFilter.innerHTML = ['<option value="">Tous</option>']
        .concat(lots.map(l => `<option value="${l}">${l}</option>`))
        .join('');

      render();
    })
    .catch(() => {
      entries = [];
      render();
    });

  function render() {
    tbody.innerHTML = '';
    let filtered = entries.filter(e => {
      if (floorFilter.value && e.etage !== floorFilter.value) return false;
      if (lotFilter.value && e.lot !== lotFilter.value) return false;
      return true;
    });

    if (filtered.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 8;
      cell.textContent = 'Aucune action enregistrée.';
      row.appendChild(cell);
      tbody.appendChild(row);
      return;
    }

    filtered.forEach(e => {
      const row = document.createElement('tr');
      const emplacement = e.chambre ? `${e.etage} / ${e.chambre}` : e.etage;
      const values = [
        e.username,
        e.action_type,
        emplacement,
        e.bulle_numero,
        e.bulle_intitule,
        e.lot,
        e.description,
        new Date(e.created_at).toLocaleString()
      ];
      values.forEach(val => {
        const td = document.createElement('td');
        td.textContent = val;
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
  }

  floorFilter.addEventListener('change', render);
  lotFilter.addEventListener('change', render);

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
});
