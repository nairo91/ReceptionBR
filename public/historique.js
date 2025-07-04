window.addEventListener('DOMContentLoaded', () => {
  const tbody = document.querySelector('#historyTable tbody');
  const floorFilter = document.getElementById('floorFilter');
  const lotFilter = document.getElementById('lotFilter');
  const actions = JSON.parse(localStorage.getItem('actions') || '[]');

  const floors = [...new Set(actions.map(a => a.etage))];
  const lots = [...new Set(actions.map(a => a.lot).filter(l => l))];

  floorFilter.innerHTML = ['<option value="">Tous</option>']
    .concat(floors.map(f => `<option value="${f}">${f}</option>`)).join('');
  lotFilter.innerHTML = ['<option value="">Tous</option>']
    .concat(lots.map(l => `<option value="${l}">${l}</option>`)).join('');

  function render() {
    tbody.innerHTML = '';
    let filtered = actions.slice();
    if (floorFilter.value) filtered = filtered.filter(a => a.etage === floorFilter.value);
    if (lotFilter.value) filtered = filtered.filter(a => a.lot === lotFilter.value);

    if (filtered.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.textContent = 'Aucune action enregistrée.';
      row.appendChild(cell);
      tbody.appendChild(row);
      return;
    }

    filtered.forEach(a => {
      const row = document.createElement('tr');
      const emplacement = a.chambre
        ? `${a.etage} / ${a.chambre}`
        : `${a.etage} (${Number(a.x).toFixed(2)}, ${Number(a.y).toFixed(2)})`;
      const values = [
        a.user,
        a.action,
        emplacement,
        a.nomBulle || '',
        a.lot || '',
        a.description || '',
        new Date(a.timestamp).toLocaleString()
      ];
      values.forEach(val => {
        const td = document.createElement('td');
        td.textContent = val;
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
  }

  render();
  floorFilter.addEventListener('change', render);
  lotFilter.addEventListener('change', render);

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
});
