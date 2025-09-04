// Gestion centralisée du thème (charge/init + delegation)
(function () {
  const root = document.documentElement;

  function applyTheme(mode) {
    const val = mode === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', val);
    document.body.setAttribute('data-theme', val);
    // compat CSS historique
    document.body.classList.toggle('dark-theme', val === 'dark');
    try { localStorage.setItem('theme', val); } catch (_) {}
    // accessibilité (met à jour tous les boutons visibles)
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      btn.setAttribute('aria-label', val === 'dark' ? 'Passer en clair' : 'Passer en sombre');
      btn.setAttribute('aria-pressed', String(val === 'dark'));
    });
  }

  // Thème initial : stockage → préférence système → clair
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch (_) {}
  if (!saved && window.matchMedia) {
    saved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(saved || 'light');

  // Delegation : fonctionne pour les boutons ajoutés dynamiquement (sidebar)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    const current = root.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });
})();

