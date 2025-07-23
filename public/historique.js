window.addEventListener('DOMContentLoaded', () => {
  const tbody = document.querySelector('#historyTable tbody');
  fetch('/api/bulles/actions', { credentials: 'include' })
    .then(res => res.json())
    .then(actions => {
      if (actions.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 6;
        cell.textContent = 'Aucune action enregistrée.';
        row.appendChild(cell);
        tbody.appendChild(row);
      } else {
        actions.forEach(a => {
          const row = document.createElement('tr');

          const emplacement = a.chambre
            ? `${a.etage} / ${a.chambre}`
            : `${a.etage} (${Number(a.x).toFixed(2)}, ${Number(a.y).toFixed(2)})`;

          const values = [
            a.user_id || a.user,
            a.action,
            emplacement,
            a.nom_bulle || a.nomBulle || '',
            a.description || '',
            new Date(a.created_at || a.timestamp).toLocaleString()
          ];
          values.forEach(val => {
            const td = document.createElement('td');
            td.textContent = val;
            row.appendChild(td);
          });
          tbody.appendChild(row);
        });
      }
    })
    .catch(err => {
      console.error(err);
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.textContent = 'Erreur chargement historique';
      row.appendChild(cell);
      tbody.appendChild(row);
    });

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
});
