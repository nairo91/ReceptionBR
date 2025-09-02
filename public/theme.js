// Gestion du thème clair/sombre (robuste avec délégation d’événement)
(() => {
  const KEY = 'theme';
  const root = document.documentElement;
  const body = document.body;

  const SELECTOR = '[data-theme-toggle], #themeToggle, .themeToggle';

  const getInitial = () =>
    localStorage.getItem(KEY) ||
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light');

  function updateAllButtons(theme) {
    document.querySelectorAll(SELECTOR).forEach(btn => {
      btn.setAttribute('aria-label', theme === 'dark' ? 'Passer en clair' : 'Passer en sombre');
      btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    });
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    body.setAttribute('data-theme', theme);
    localStorage.setItem(KEY, theme);
    updateAllButtons(theme);
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Appliquer thème initial
    applyTheme(getInitial());

    // Délégation: clique sur n’importe quel bouton présent ou futur
    document.addEventListener('click', (e) => {
      const btn = e.target.closest(SELECTOR);
      if (!btn) return;
      const current = root.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  });
})();

