(async function(){
  const holder = document.getElementById('sidebar-holder');
  if(!holder) return;

  // Charger la sidebar
  const res = await fetch('/sidebar.html', { credentials:'include' });
  holder.innerHTML = await res.text();
  document.body.classList.add('with-sidebar');

  // Afficher l'utilisateur connecté
  try {
    const me = await fetch('/api/auth/me', { credentials:'include' });
    if(me.ok){
      const data = await me.json();
      const span = document.getElementById('sidebar-user');
      if (span && data.user) span.textContent = data.user.email;
    }
  } catch(_) {}

  // Déconnexion
  const btn = document.getElementById('sidebar-logout');
  if(btn){
    btn.addEventListener('click', async ()=>{
      await fetch('/api/auth/logout', { method:'POST', credentials:'include' });
      location.href = '/';
    });
  }
})();
