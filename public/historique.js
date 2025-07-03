window.addEventListener('DOMContentLoaded', () => {
  const tbody = document.querySelector('#historyTable tbody');
  const actions = JSON.parse(localStorage.getItem('actions') || '[]');

  function loadHistory() {
    const filterEtage = document.getElementById('filter-etage').value;
    const filterLot = document.getElementById('filter-lot').value;

    const filtered = actions.filter(a =>
      (!filterEtage || a.etage === filterEtage) &&
      (!filterLot || a.lot === filterLot)
    );

    tbody.innerHTML = '';

    if (filtered.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
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

  loadHistory();

  document.getElementById('apply-filters').addEventListener('click', loadHistory);

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
});
