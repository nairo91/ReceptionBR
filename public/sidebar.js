(async function(){
  const holder = document.getElementById('sidebar-holder');
  if(!holder) return;

  // Vérifier la session AVANT d'injecter la sidebar
  let user = null;
  try {
    const me = await fetch('/api/auth/me', { credentials:'include' });
    if (!me.ok) return; // non connecté -> ne rien afficher
    user = await me.json();
  } catch (_) {
    return;
  }

  // Charger la sidebar
  const res = await fetch('/sidebar.html', { credentials:'include' });
  holder.innerHTML = await res.text();
  document.body.classList.add('with-sidebar');

  const span = document.getElementById('sidebar-user');
  if(span && user && user.user && user.user.email){
    span.textContent = user.user.email;
  }

  const btn = document.getElementById('sidebar-logout');
  if(btn){
    btn.addEventListener('click', async ()=>{
      await fetch('/api/auth/logout', { method:'POST', credentials:'include' });
      location.href = '/';
    });
  }

  // Créer overlay et bouton burger pour ouvrir/fermer la sidebar
  const sidebar = holder.querySelector('.sidebar');
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  document.body.appendChild(overlay);
  // Micro-patch #4 : éviter les doublons de bouton si le script est ré-exécuté
  let toggle = document.getElementById('sidebar-toggle');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.id = 'sidebar-toggle';
    document.body.appendChild(toggle);
  }
  toggle.textContent = '☰';
  // Micro-patch #2 : accessibilité
  toggle.setAttribute('aria-label', 'Ouvrir le menu');
  toggle.setAttribute('aria-expanded', 'false');

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('show');
    document.body.classList.add('menu-open');     // Micro-patch #3
    toggle.setAttribute('aria-expanded', 'true'); // Micro-patch #2
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
    document.body.classList.remove('menu-open');  // Micro-patch #3
    toggle.setAttribute('aria-expanded', 'false');// Micro-patch #2
  }

  toggle.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });
  overlay.addEventListener('click', closeSidebar);

  // Micro-patch #2 : fermer avec la touche Échap et rendre le focus
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      closeSidebar();
      if (typeof toggle.focus === 'function') toggle.focus();
    }
  });
})();
