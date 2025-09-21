module.exports = {
  /**
   * Valeurs par défaut utilisées si aucun réglage spécifique n'est trouvé
   * pour l'étage exporté. Les dimensions marquées avec `relative: true`
   * sont exprimées en pourcentage de la largeur/hauteur du plan.
   */
  default: {
    '1': { left: 0, top: 0, width: 0.5, height: 1, relative: true },
    '2': { left: 0.5, top: 0, width: 0.5, height: 1, relative: true }
  },
  /**
   * Permet éventuellement de définir des boîtes spécifiques pour un étage
   * donné en utilisant son identifiant numérique.
   */
  byFloorId: {
    // Exemple :
    // '2': {
    //   '1': { left: 50, top: 200, width: 900, height: 400 },
    //   '2': { left: 1000, top: 180, width: 1200, height: 450 }
    // }
  },
  /**
   * Permet de définir des boîtes spécifiques à partir du libellé de l'étage.
   * Les valeurs ci-dessous reprennent l'exemple fourni (Chambres R+2).
   */
  byFloorName: {
    'Chambres R+2': {
      '1': { left: 50, top: 200, width: 900, height: 400 },
      '2': { left: 1000, top: 180, width: 1200, height: 450 }
    }
  }
};
