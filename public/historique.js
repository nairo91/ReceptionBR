window.addEventListener('DOMContentLoaded', () => {
  const tbody = document.querySelector('#historyTable tbody');
  fetch('/api/history', { credentials: 'include' })
    .then(r => r.json())
    .then(rows => {
      if (rows.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 14;
        cell.textContent = 'Aucune action enregistrée.';
        row.appendChild(cell);
        tbody.appendChild(row);
      } else {
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
            <td>${data.entreprise || ''}</td>
            <td>${data.localisation || ''}</td>
            <td>${data.observation || ''}</td>
            <td>${data.description || ''}</td>
            <td>${new Date(data.created_at).toLocaleString()}</td>
          </tr>
        `).join('');
      }
    })
    .catch(err => {
      console.error(err);
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 14;
      cell.textContent = 'Erreur chargement historique';
      row.appendChild(cell);
      tbody.appendChild(row);
    });

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
});
