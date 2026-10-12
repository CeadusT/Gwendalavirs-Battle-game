/* ==========================================================================
   Règles du jeu — RÉGLAGES.
   Toutes les valeurs « de game design » sont ici : change-les pour tester
   d'autres équilibrages, le moteur s'adapte sans autre modification.
   ========================================================================== */

export const RULES = {
  /** Nombre de cartes en main au début de la partie. */
  startingHand: 5,
  /** Le second joueur pioche une carte de plus pour compenser. */
  secondPlayerBonusCards: 1,
  /** Le premier joueur ne pioche pas à son tout premier tour. */
  firstPlayerSkipsFirstDraw: true,
  /** Taille maximale de la main : une carte piochée au-delà est défaussée. */
  maxHandSize: 10,
  /** Nombre maximal de cartes sur le terrain par joueur. */
  boardLimit: 7,

  /** Volonté maximale au premier tour, gain par tour et plafond. */
  startingWill: 1,
  willPerTurn: 1,
  maxWill: 10,

  /** Points de vie du Héros s'il n'en a pas sur sa carte (ou pas de Héros). */
  defaultHeroHealth: 20,

  /** Un Personnage ne peut pas attaquer le tour où il est joué. */
  summoningSickness: true,
  /** Le défenseur riposte avec son attaque quand il est attaqué. */
  defenderStrikesBack: true,
  /** Piocher dans un deck vide fait perdre des PV au Héros (1, puis 2, puis 3…). */
  fatigueDamage: true,
} as const;

/* Ce que fait chaque Type de carte quand on la joue.
   - 'unit'   : va sur le terrain et peut attaquer (s'il a de l'attaque)
   - 'object' : va sur le terrain mais n'attaque pas
   - 'spell'  : effet immédiat, puis défausse (les effets se gèrent à la main pour l'instant)
   Un Type absent de cette liste est traité comme 'spell'. */
export const TYPE_BEHAVIOUR: Record<string, 'unit' | 'object' | 'spell'> = {
  Personnage: 'unit',
  Jeton: 'unit',
  Objet: 'object',
  'Dessin de base': 'spell',
  'Dessin avancé': 'spell',
  'Dessin légendaire': 'spell',
  'Dessin de base jeton': 'spell',
};

export const HERO_TYPE = 'Héros';
