window.addEventListener('DOMContentLoaded', async () => {
  const tbody = document.querySelector('#historyTable tbody');
  const floorFilter = document.getElementById('floorFilter');
  const lotFilter = document.getElementById('lotFilter');
  let actions = [];

  async function loadActions() {
    const res = await fetch('/api/history');
    actions = await res.json();
    actions.forEach(a => {
      if (a.new_values && typeof a.new_values === 'string') {
        try { a.new_values = JSON.parse(a.new_values); } catch (e) {}
      }
      if (a.old_values && typeof a.old_values === 'string') {
        try { a.old_values = JSON.parse(a.old_values); } catch (e) {}
      }
    });

    const floors = [...new Set(actions.map(a => a.etage).filter(Boolean))];
    const lots = [...new Set(actions.map(a => (a.new_values?.lot || a.old_values?.lot || a.lot)).filter(Boolean))];

    floorFilter.innerHTML = ['<option value="">Tous</option>']
      .concat(floors.map(f => `<option value="${f}">${f}</option>`)).join('');
    lotFilter.innerHTML = ['<option value="">Tous</option>']
      .concat(lots.map(l => `<option value="${l}">${l}</option>`)).join('');
  }

  function render() {
    tbody.innerHTML = '';
    let filtered = actions.slice();
    if (floorFilter.value) filtered = filtered.filter(a => a.etage === floorFilter.value);
    if (lotFilter.value) filtered = filtered.filter(a => {
      const lot = a.new_values?.lot || a.old_values?.lot || a.lot;
      return lot === lotFilter.value;
    });

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
      const data = a.new_values || a.old_values || {};
      const emplacement = a.chambre
        ? `${a.etage} / ${a.chambre}`
        : `${a.etage} (${Number(data.x || 0).toFixed(2)}, ${Number(data.y || 0).toFixed(2)})`;
      const nomBulle = data.intitule ? `Bulle ${a.bulle_numero}, ${data.intitule}` : `Bulle ${a.bulle_numero}`;
      const lot = data.lot || a.lot || '';
      const description = data.description || '';
      const actionText = a.action_type === 'create' ? 'creation'
                        : a.action_type === 'update' ? 'modification'
                        : a.action_type;
      const values = [
        a.username || '',
        actionText,
        emplacement,
        nomBulle,
        lot,
        description,
        new Date(a.created_at).toLocaleString()
      ];
      values.forEach(val => {
        const td = document.createElement('td');
        td.textContent = val;
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
  }

  await loadActions();
  render();
  floorFilter.addEventListener('change', render);
  lotFilter.addEventListener('change', render);

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'index.html';
  });
});
