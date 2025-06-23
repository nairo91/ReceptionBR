# Instructions pour déploiement

1. Exécutez `schema.sql` pour créer les tables initiales.
2. Après une mise à jour, lancez les scripts du dossier `migrations/` pour mettre à jour la base existante. Par exemple, `migrations/001_coords_to_real.sql` modifie les colonnes `x` et `y` pour utiliser des coordonnées décimales.
