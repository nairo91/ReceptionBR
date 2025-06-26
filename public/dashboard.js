window.addEventListener('DOMContentLoaded', () => {
  loadStats();
  loadUrgent();
});

function loadStats() {
  fetch('/api/bulles/stats')
    .then(res => {
      if (!res.ok) throw new Error('Erreur stats');
      return res.json();
    })
    .then(data => {
      document.querySelectorAll('#cards .card').forEach(card => {
        const etat = card.getAttribute('data-etat');
        card.querySelector('.value').textContent = data[etat] ?? 0;
      });
    })
    .catch(() => {
      document.getElementById('cards').textContent = 'Impossible de charger les statistiques.';
    });
}

function loadUrgent() {
  fetch('/api/bulles/urgent')
    .then(res => {
      if (!res.ok) throw new Error('Erreur urgent');
      return res.json();
    })
    .then(data => {
      const tbody = document.querySelector('#urgent tbody');
      tbody.innerHTML = '';
      data.forEach(bulle => {
        const tr = document.createElement('tr');
        const link = `detail.html?id=${encodeURIComponent(bulle.id)}`;
        tr.innerHTML = `<td>${bulle.id}</td><td>${bulle.description || ''}</td><td>${bulle.date_butoir ? bulle.date_butoir.substring(0,10) : ''}</td><td><a href="${link}">Voir</a></td>`;
        tbody.appendChild(tr);
      });
    })
    .catch(() => {
      const tbody = document.querySelector('#urgent tbody');
      tbody.innerHTML = '<tr><td colspan="4">Erreur de chargement</td></tr>';
    });
}
