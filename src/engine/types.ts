/* ==========================================================================
   Types du moteur de jeu.
   Le moteur ne connaît ni React ni le DOM : il prend un état et une action,
   et renvoie le nouvel état. C'est ce qui permettra plus tard le jeu en
   ligne (le serveur fera tourner le même moteur) et une IA.
   ========================================================================== */

/** Une carte telle qu'exportée par le deckbuilder (définition, sans état de partie). */
export interface CardDef {
  id: string;
  name: string;
  type: string;
  subtype: string;
  color: string;
  rarity: string;
  set: string;
  spire: number;          // coût en Volonté (nombre de cartes à défausser)
  text: string;           // texte riche (HTML limité, nettoyé à l'affichage)
  attack: number;
  health: number;
  showAttack: boolean;
  showHealth: boolean;
  showSpire: boolean;
  fullArt: boolean;
  /** Un seul exemplaire à la fois sur le terrain de son propriétaire. */
  unique: boolean;
  image?: string;
}

export type PlayerIndex = 0 | 1;
export type Zone = 'deck' | 'hand' | 'board' | 'imagination' | 'discard';

/** Un exemplaire de carte dans une partie. */
export interface CardInstance {
  uid: string;            // identifiant unique dans la partie
  defId: string;
  owner: PlayerIndex;
  zone: Zone;
  damage: number;         // dégâts subis (les PV restants = PV + bonus − dégâts)
  attackBonus: number;
  healthBonus: number;
  exhausted: boolean;     // inclinée (a attaqué) : redressée au début du tour de son propriétaire
  enteredOnTurn: number;  // tour d'arrivée sur le terrain ou en Imagination
}

export interface PlayerState {
  index: PlayerIndex;
  name: string;
  heroDefId: string | null;
  heroHealth: number;
  heroMaxHealth: number;
  will: number;           // Volonté générée par des effets, utilisable ce tour (en plus des cartes de la main)
  spire: number;          // position sur l'échelle de spire (0 à 6)
  ultimateUsed: boolean;
  deck: string[];         // uids, le dessus du deck est à la fin du tableau
  hand: string[];
  board: string[];
  imagination: string[];
  discard: string[];
}

export type LogKind = 'info' | 'play' | 'attack' | 'damage' | 'destroy' | 'turn' | 'spire' | 'manual' | 'end';
export interface LogEntry {
  turn: number;
  player: PlayerIndex | null;
  kind: LogKind;
  text: string;
}

export interface GameState {
  turn: number;             // 1, 2, 3… (chaque joueur joue un tour)
  active: PlayerIndex;
  firstPlayer: PlayerIndex;
  phase: 'playing' | 'over';
  winner: PlayerIndex | null;
  players: [PlayerState, PlayerState];
  cards: Record<string, CardInstance>;
  defs: Record<string, CardDef>;
  rng: number;              // état du générateur aléatoire (parties rejouables)
  log: LogEntry[];
}

/** Cible d'une attaque ou d'un ajustement manuel. */
export type Target = { kind: 'card'; uid: string } | { kind: 'hero'; player: PlayerIndex };

export type Action =
  /** Jouer une carte de la main ou de l'Imagination ; payWith = cartes de la main défaussées pour payer. */
  | { type: 'PLAY_CARD'; uid: string; payWith: string[] }
  /** Poser un Dessin de la main en Zone Imagination ; la spire monte ou descend d'un cran. */
  | { type: 'IMAGINE'; uid: string; direction: 1 | -1 }
  /** riposte : choix du défenseur (seulement si sa carte est redressée). */
  | { type: 'ATTACK'; attacker: string; target: Target; riposte: boolean }
  | { type: 'ULTIMATE'; player: PlayerIndex }
  /** keepImagination : cartes gardées en Imagination s'il y en a trop (sinon les plus récentes). */
  | { type: 'END_TURN'; keepImagination?: string[] }
  // Outils « bac à sable » pour tester des effets pas encore programmés :
  | { type: 'DRAW'; player: PlayerIndex }
  | { type: 'ADJUST'; target: Target; stat: 'damage' | 'attack' | 'health' | 'will' | 'spire'; delta: number }
  | { type: 'MOVE'; uid: string; to: Zone }
  | { type: 'CONCEDE'; player: PlayerIndex };

export interface ActionResult {
  state: GameState;
  error?: string;
}

/** Deck prêt à jouer : un Héros (facultatif) et la liste des exemplaires. */
export interface DeckList {
  name: string;
  hero: CardDef | null;
  cards: { card: CardDef; quantity: number }[];
}
