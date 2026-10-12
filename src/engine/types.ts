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
  spire: number;          // coût en Volonté
  text: string;           // texte riche (HTML limité, nettoyé à l'affichage)
  attack: number;
  health: number;
  showAttack: boolean;
  showHealth: boolean;
  showSpire: boolean;
  fullArt: boolean;
  image?: string;
}

export type PlayerIndex = 0 | 1;
export type Zone = 'deck' | 'hand' | 'board' | 'discard';

/** Un exemplaire de carte dans une partie. */
export interface CardInstance {
  uid: string;            // identifiant unique dans la partie
  defId: string;
  owner: PlayerIndex;
  zone: Zone;
  damage: number;         // dégâts subis (les PV restants = PV + bonus − dégâts)
  attackBonus: number;
  healthBonus: number;
  exhausted: boolean;     // a déjà attaqué ce tour
  playedOnTurn: number;   // pour le « mal du débarquement »
}

export interface PlayerState {
  index: PlayerIndex;
  name: string;
  heroDefId: string | null;
  heroHealth: number;
  heroMaxHealth: number;
  will: number;           // Volonté disponible ce tour
  maxWill: number;        // Volonté maximale actuelle
  fatigue: number;
  deck: string[];         // uids, le dessus du deck est à la fin du tableau
  hand: string[];
  board: string[];
  discard: string[];
}

export type LogKind = 'info' | 'play' | 'attack' | 'damage' | 'destroy' | 'turn' | 'manual' | 'end';
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
  | { type: 'PLAY_CARD'; uid: string }
  | { type: 'ATTACK'; attacker: string; target: Target }
  | { type: 'END_TURN' }
  // Outils « bac à sable » pour tester des effets pas encore programmés :
  | { type: 'DRAW'; player: PlayerIndex }
  | { type: 'ADJUST'; target: Target; stat: 'damage' | 'attack' | 'health' | 'will'; delta: number }
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
