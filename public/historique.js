window.addEventListener('DOMContentLoaded', () => {
  const tbody = document.querySelector('#historyTable tbody');

  fetch('/api/history')
    .then(res => res.json())
    .then(actions => {
      if (!Array.isArray(actions) || actions.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 6;
        cell.textContent = 'Aucune action enregistrée.';
        row.appendChild(cell);
        tbody.appendChild(row);
        return;
      }

      actions.forEach(a => {
        const row = document.createElement('tr');

        const emplacement = a.chambre
          ? `${a.etage} / ${a.chambre}`
          : `${a.etage}`;

        const desc = (a.new_values && a.new_values.description) ||
                     (a.old_values && a.old_values.description) || '';

        const values = [
          a.username,
          a.action_type,
          emplacement,
          a.bulle_numero || '',
          desc,
          new Date(a.created_at).toLocaleString()
        ];
        values.forEach(val => {
          const td = document.createElement('td');
          td.textContent = val;
          row.appendChild(td);
        });
        tbody.appendChild(row);
      });
    })
    .catch(() => {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.textContent = 'Erreur de chargement.';
      row.appendChild(cell);
      tbody.appendChild(row);
    });

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
});
