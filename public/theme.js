// Gestion du thème clair/sombre
(() => {
  const KEY = 'theme';

  const getInitial = () =>
    localStorage.getItem(KEY)
    || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  const apply = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem(KEY, theme);
  };

  // Appliquer au chargement
  document.addEventListener('DOMContentLoaded', () => {
    apply(getInitial());

    const btn = document.getElementById('themeToggle');
    if (btn) {
      btn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        apply(next);
        btn.setAttribute('aria-label', next === 'dark' ? 'Passer en clair' : 'Passer en sombre');
      });
    }
  });
})();

