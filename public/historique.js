window.addEventListener('DOMContentLoaded', () => {
  const tbody = document.querySelector('#historyTable tbody');

  async function loadHistory() {
    const filterEtage = document.getElementById('filter-etage').value;
    const filterLot = document.getElementById('filter-lot').value;

    const params = new URLSearchParams();
    if (filterEtage) params.append('etage', filterEtage);
    if (filterLot) params.append('lot', filterLot);

    let actions = [];
    try {
      const res = await fetch(`/api/history?${params.toString()}`);
      if (res.ok) actions = await res.json();
    } catch (err) {
      console.error('Erreur chargement historique', err);
    }

    const filtered = actions.filter(e => {
      const matchEtage = !filterEtage || e.etage === filterEtage;
      const matchLot   = !filterLot
        || (e.lot || '').toLowerCase() === filterLot.toLowerCase();
      return matchEtage && matchLot;
    });

    console.log('Filtres:', { filterEtage, filterLot });
    console.log('Actions brutes:', actions);
    console.log('Actions filtrées:', filtered);

    tbody.innerHTML = '';

    if (filtered.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 8;
      cell.textContent = 'Aucune action enregistrée.';
      row.appendChild(cell);
      tbody.appendChild(row);
      return;
    }

    filtered.forEach(a => {
      const row = document.createElement('tr');

      const emplacement = a.chambre ? `${a.etage} / ${a.chambre}` : a.etage;

      const values = [
        a.username,                       // nom de l’utilisateur
        a.action_type,                    // type d’action
        emplacement,
        a.bulle_numero || '',            // numéro de bulle
        a.lot          || '',            // lot
        a.bulle_intitule || '',          // intitulé texte
        a.description || '',             // description historique
        new Date(a.created_at).toLocaleString() // date/heure
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
