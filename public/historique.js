window.addEventListener('DOMContentLoaded', () => {
  const tbody = document.querySelector('#historyTable tbody');
  const actions = JSON.parse(localStorage.getItem('actions') || '[]');

  if (actions.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = 'Aucune action enregistrée.';
    row.appendChild(cell);
    tbody.appendChild(row);
  } else {
    actions.forEach(a => {
      const row = document.createElement('tr');

      const emplacement = a.chambre
        ? `${a.etage} / ${a.chambre}`
        : `${a.etage} (${Number(a.x).toFixed(2)}, ${Number(a.y).toFixed(2)})`;

      const values = [a.user, a.action, emplacement, new Date(a.timestamp).toLocaleString()];
      values.forEach((val, idx) => {
        const td = document.createElement('td');
        td.textContent = val;
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
  }

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
});
