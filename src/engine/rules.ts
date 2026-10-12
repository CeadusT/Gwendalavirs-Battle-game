/* ==========================================================================
   Règles du jeu — RÉGLAGES.
   Toutes les valeurs « de game design » sont ici : change-les pour tester
   d'autres équilibrages, le moteur s'adapte sans autre modification.
   ========================================================================== */

export const RULES = {
  /** Cartes piochées en début de partie, puis à chaque fin de tour. */
  handSize: 5,
  /** En fin de tour, toute la main est défaussée avant de piocher. */
  discardHandAtEndOfTurn: true,
  /** Deck vide : la défausse est mélangée pour former un nouveau deck. */
  reshuffleDiscardWhenEmpty: true,

  /** Nombre maximal d'Alliés (Personnages) et d'Objets sur le terrain. */
  maxAllies: 3,
  maxObjects: 3,
  /** Un Allié ne peut pas attaquer le tour où il est posé. */
  summoningSickness: true,

  /** Échelle de spire. */
  spireMin: 0,
  spireMax: 6,
  startingSpire: 0,
  /** Spire à atteindre pour lancer l'ultimate du Héros. */
  ultimateSpire: 6,
  /** L'ultimate ne peut être lancé qu'une fois par partie (sinon : à chaque retour à la spire 6). */
  ultimateOncePerGame: false,
  /** Spire après l'ultimate ou un Dessin légendaire. */
  spireAfterUltimate: 0,

  /** Cartes gardées en Zone Imagination à la fin du tour. */
  imaginationLimit: 2,
  /** Une carte posée en Imagination ne peut pas être jouée le tour où elle est posée. */
  imaginationWaitsOneTurn: true,

  /** Points de vie du Héros s'il n'en a pas sur sa carte (ou pas de Héros). */
  defaultHeroHealth: 20,
} as const;

/* Les 4 grandes catégories de cartes (le Héros est à part).
   - 'ally'    : Allié — va sur le terrain (3 maximum) et combat
   - 'object'  : Objet — va sur le terrain (3 maximum), ne combat pas
   - 'drawing' : Dessin — effet immédiat puis défausse, ou posé en Zone Imagination
   Un Type absent de cette liste est traité comme un Dessin. */
export type Category = 'ally' | 'object' | 'drawing';

export const TYPE_CATEGORY: Record<string, Category> = {
  Personnage: 'ally',
  Jeton: 'ally',
  Objet: 'object',
  'Dessin de base': 'drawing',
  'Dessin avancé': 'drawing',
  'Dessin légendaire': 'drawing',
  'Dessin de base jeton': 'drawing',
};

export const HERO_TYPE = 'Héros';

/* Types qui ne se lancent qu'à la spire de l'ultimate, et font ensuite redescendre la spire. */
export const ULTIMATE_TYPES = new Set(['Dessin légendaire']);
