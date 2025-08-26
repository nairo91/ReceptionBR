(async function(){
  const holder = document.getElementById('sidebar-holder');
  if(!holder) return;

  // 1) Vérifier la session AVANT d'injecter la sidebar
  let user = null;
  try {
    const me = await fetch('/api/auth/me', { credentials:'include' });
    if (!me.ok) return; // non connecté -> on n'affiche rien
    user = await me.json();
  } catch (_) {
    return; // en cas d'erreur réseau, ne rien afficher
  }

  // 2) Charger la sidebar uniquement si connecté
  const res = await fetch('/sidebar.html', { credentials:'include' });
  holder.innerHTML = await res.text();
  document.body.classList.add('with-sidebar');

  // 3) Afficher l'email utilisateur si disponible
  const span = document.getElementById('sidebar-user');
  if (span && user && user.user && user.user.email) {
    span.textContent = user.user.email;
  }

  // 4) Déconnexion
  const btn = document.getElementById('sidebar-logout');
  if(btn){
    btn.addEventListener('click', async ()=>{
      await fetch('/api/auth/logout', { method:'POST', credentials:'include' });
      location.href = '/';
    });
  }
})();
