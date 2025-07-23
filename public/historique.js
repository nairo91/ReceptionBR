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

          // n° de bulle
          const numero = a.nom_bulle.match(/^Bulle (\d+)/)?.[1] || '';

          // user : prefixe avant le premier point de l’email
          const userLabel = (a.user || a.user_id || '')
            .split('@')[0]
            .split('.')[0];

          const values = [
            userLabel,
            a.action,
            a.etage,
            a.chambre || '',
            numero,
            a.lot || '',
            a.entreprise  || '',
            a.localisation || '',
            a.observation || '',
            a.description  || '',
            new Date(a.created_at||a.timestamp).toLocaleString()
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
