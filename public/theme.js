/* Thème clair/sombre persistant */
(function(){
  const KEY='rb_theme';
  const root=document.documentElement;

  function apply(theme){
    if(theme==='dark'){ root.classList.add('dark-theme'); }
    else{ root.classList.remove('dark-theme'); }
  }

  // Choix initial : localStorage > prefers-color-scheme > light
  let initial = localStorage.getItem(KEY);
  if(!initial){
    try{
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      initial = prefersDark ? 'dark' : 'light';
    }catch(_){ initial='light'; }
  }
  apply(initial);

  // Expose bascule globale pour la sidebar
  window.toggleTheme = function(){
    const now = root.classList.contains('dark-theme') ? 'light' : 'dark';
    localStorage.setItem(KEY, now);
    apply(now);
    // Mettre à jour l'état ARIA du bouton si présent
    const btn = document.getElementById('theme-toggle');
    if(btn){ btn.setAttribute('aria-pressed', now==='dark' ? 'true' : 'false'); }
  };

  // (Optionnel) synchroniser l'état ARIA dès le chargement
  const initBtn = document.getElementById('theme-toggle');
  if (initBtn) {
    initBtn.setAttribute('aria-pressed', initial==='dark' ? 'true' : 'false');
  }
})();
