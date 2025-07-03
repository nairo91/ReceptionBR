window.addEventListener('DOMContentLoaded', () => {
  const tbody = document.querySelector('#historyTable tbody');

  async function loadHistory() {
    const etage = document.getElementById('filter-etage').value;
    const lot   = document.getElementById('filter-lot').value;
    const params = new URLSearchParams();
    if (etage) params.append('etage', etage);
    if (lot)   params.append('lot', lot);
    const res = await fetch(`/api/history?${params.toString()}`);
    const entries = res.ok ? await res.json() : [];

    tbody.innerHTML = '';
    if (entries.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.textContent = 'Aucune action enregistrée.';
      row.appendChild(cell);
      tbody.appendChild(row);
      return;
    }

    entries.forEach(e => {
      const emplacement = e.chambre
        ? `${e.etage} / ${e.chambre}`
        : `${e.etage} (${Number(e.x).toFixed(2)}, ${Number(e.y).toFixed(2)})`;
      const values = [
        e.username,
        e.action_type,
        emplacement,
        e.numero || '',
        e.description || '',
        new Date(e.created_at).toLocaleString()
      ];
      const row = document.createElement('tr');
      values.forEach(val => {
        const td = document.createElement('td');
        td.textContent = val;
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
  }

  document.getElementById('apply-filters').addEventListener('click', loadHistory);
  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  loadHistory();
});
