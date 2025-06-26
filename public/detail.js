window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) {
    document.getElementById('bulleDetail').textContent = 'ID manquant';
    return;
  }

  loadDetail(id);
  loadHistory(id);
});

function loadDetail(id) {
  fetch(`/api/bulles/${id}`)
    .then(res => {
      if (res.status === 404) throw new Error('NOT_FOUND');
      if (!res.ok) throw new Error('NETWORK');
      return res.json();
    })
    .then(bulle => {
      document.getElementById('description').textContent = bulle.description || '';
      document.getElementById('intitule').textContent = bulle.intitule || '';
      const img = document.getElementById('photo');
      if (bulle.photo) {
        img.src = bulle.photo;
        img.style.display = 'block';
      }
      document.getElementById('dateButoir').textContent = bulle.date_butoir ? bulle.date_butoir.substring(0,10) : '';
      document.getElementById('etat').textContent = bulle.etat || '';
    })
    .catch(err => {
      const container = document.getElementById('bulleDetail');
      container.textContent = err.message === 'NOT_FOUND'
        ? 'Bulle non trouvée'
        : 'Erreur de chargement';
    });
}

function loadHistory(id) {
  fetch(`/api/bulles/${id}/history`)
    .then(res => res.ok ? res.json() : [])
    .then(entries => {
      const list = document.getElementById('historyList');
      list.innerHTML = '';
      entries.forEach(e => {
        const li = document.createElement('li');
        const date = new Date(e.created_at).toLocaleString();
        li.textContent = `${date} - ${e.user_id || 'N/A'} - ${e.action_type} - ${JSON.stringify(e.old_values)} → ${JSON.stringify(e.new_values)}`;
        list.appendChild(li);
      });
      if (entries.length === 0) {
        list.innerHTML = '<li>Aucune entrée</li>';
      }
    })
    .catch(() => {
      document.getElementById('historyList').innerHTML = '<li>Erreur de chargement</li>';
    });
}
