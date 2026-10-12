/* ==========================================================================
   Moteur de jeu : création d'une partie et application des actions.
   applyAction() ne modifie jamais l'état reçu : il en renvoie une copie.
   ========================================================================== */

import type { Action, ActionResult, CardDef, CardInstance, DeckList, GameState, LogKind, PlayerIndex, PlayerState, Target, Zone } from './types';
import { HERO_TYPE, RULES, TYPE_CATEGORY, ULTIMATE_TYPES, type Category } from './rules';
import { shuffle } from './rng';

const ZONES = ['deck', 'hand', 'board', 'imagination', 'discard'] as const;

/* ---------- Lecture de l'état ---------- */

export const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);
export const defOf = (state: GameState, uid: string): CardDef => state.defs[state.cards[uid].defId];
export const categoryOf = (def: CardDef): Category => TYPE_CATEGORY[def.type] ?? 'drawing';
export const isAlly = (state: GameState, uid: string) => categoryOf(defOf(state, uid)) === 'ally';

export function attackOf(state: GameState, uid: string): number {
  return Math.max(0, defOf(state, uid).attack + state.cards[uid].attackBonus);
}

export function healthOf(state: GameState, uid: string): number {
  const card = state.cards[uid];
  return defOf(state, uid).health + card.healthBonus - card.damage;
}

export const alliesOf = (state: GameState, player: PlayerIndex) => state.players[player].board.filter(uid => isAlly(state, uid));
export const objectsOf = (state: GameState, player: PlayerIndex) => state.players[player].board.filter(uid => categoryOf(defOf(state, uid)) === 'object');
/** Dessin légendaire : se lance à la spire 6 et fait redescendre la spire. */
export const isUltimateCard = (def: CardDef) => ULTIMATE_TYPES.has(def.type);

/** Nombre de cartes de la main à défausser pour payer une carte (après la Volonté générée). */
export function cardsToPay(state: GameState, uid: string): number {
  const card = state.cards[uid];
  return Math.max(0, defOf(state, uid).spire - state.players[card.owner].will);
}

/** Pourquoi une carte ne peut pas être jouée (null = elle peut l'être, paiement mis à part). */
export function cannotPlayReason(state: GameState, uid: string): string | null {
  const card = state.cards[uid];
  if (!card) return 'Carte introuvable.';
  if (state.phase !== 'playing') return 'La partie est terminée.';
  if (card.owner !== state.active) return "Ce n'est pas ton tour.";
  if (card.zone !== 'hand' && card.zone !== 'imagination') return "Cette carte n'est ni dans ta main ni dans ton Imagination.";
  if (card.zone === 'imagination' && RULES.imaginationWaitsOneTurn && card.enteredOnTurn === state.turn) return 'Une carte posée en Imagination ne peut pas être jouée ce tour-ci.';
  const def = defOf(state, uid);
  const player = state.players[card.owner];
  const category = categoryOf(def);
  if (category === 'ally' && alliesOf(state, card.owner).length >= RULES.maxAllies) return `Tu as déjà ${RULES.maxAllies} Alliés sur le terrain.`;
  if (category === 'object' && objectsOf(state, card.owner).length >= RULES.maxObjects) return `Tu as déjà ${RULES.maxObjects} Objets sur le terrain.`;
  if (isUltimateCard(def) && player.spire < RULES.ultimateSpire) return `${def.type} : se lance seulement à la spire ${RULES.ultimateSpire} (tu es à ${player.spire}).`;
  if (category !== 'drawing' && def.unique && player.board.some(u => state.cards[u].defId === card.defId)) return `${def.name} est unique : un exemplaire est déjà sur le terrain.`;
  const available = player.hand.filter(u => u !== uid).length;
  if (cardsToPay(state, uid) > available) return `Pas assez de Volonté : il faut ${def.spire} (cartes en main ou Volonté générée).`;
  return null;
}

/** Pourquoi une carte de la main ne peut pas aller en Zone Imagination (null = elle peut). */
export function cannotImagineReason(state: GameState, uid: string): string | null {
  const card = state.cards[uid];
  if (!card || card.zone !== 'hand') return "Cette carte n'est pas dans ta main.";
  if (state.phase !== 'playing') return 'La partie est terminée.';
  if (card.owner !== state.active) return "Ce n'est pas ton tour.";
  if (categoryOf(defOf(state, uid)) !== 'drawing') return 'Seuls les Dessins vont en Zone Imagination.';
  return null;
}

/** Pourquoi une carte du terrain ne peut pas attaquer (null = elle peut). */
export function cannotAttackReason(state: GameState, uid: string): string | null {
  const card = state.cards[uid];
  if (!card || card.zone !== 'board') return "Cette carte n'est pas sur le terrain.";
  if (state.phase !== 'playing') return 'La partie est terminée.';
  if (card.owner !== state.active) return "Ce n'est pas ton tour.";
  if (!isAlly(state, uid)) return 'Seuls les Alliés peuvent attaquer.';
  if (attackOf(state, uid) <= 0) return "Cet Allié n'a pas d'attaque.";
  if (card.exhausted) return 'Cet Allié est incliné : il a déjà attaqué.';
  if (RULES.summoningSickness && card.enteredOnTurn === state.turn) return 'Il vient d’arriver : il pourra attaquer au prochain tour.';
  return null;
}

/** Le défenseur peut-il répliquer ? (Allié redressé avec de l'attaque) */
export function canRiposte(state: GameState, defender: string): boolean {
  const card = state.cards[defender];
  return !!card && card.zone === 'board' && isAlly(state, defender) && !card.exhausted && attackOf(state, defender) > 0;
}

export function cannotUltimateReason(state: GameState, player: PlayerIndex): string | null {
  const p = state.players[player];
  if (state.phase !== 'playing') return 'La partie est terminée.';
  if (player !== state.active) return "Ce n'est pas ton tour.";
  if (!p.heroDefId) return "Tu n'as pas de Héros.";
  if (RULES.ultimateOncePerGame && p.ultimateUsed) return 'Ultimate déjà utilisé cette partie.';
  if (p.spire < RULES.ultimateSpire) return `L'ultimate se lance à la spire ${RULES.ultimateSpire} (tu es à ${p.spire}).`;
  return null;
}

/* ---------- Création d'une partie ---------- */

export interface NewGameOptions {
  decks: [DeckList, DeckList];
  names: [string, string];
  seed: number;
  firstPlayer?: PlayerIndex;
}

export function createGame({ decks, names, seed, firstPlayer = 0 }: NewGameOptions): GameState {
  const defs: Record<string, CardDef> = {};
  const cards: Record<string, CardInstance> = {};
  let rng = seed >>> 0;
  let counter = 0;

  const players = decks.map((deck, index): PlayerState => {
    const owner = index as PlayerIndex;
    // Définitions préfixées par le joueur : deux decks peuvent contenir des cartes
    // de même id mais de contenu différent (versions modifiées).
    const register = (def: CardDef) => {
      const key = `p${owner}:${def.id}`;
      defs[key] = def;
      return key;
    };
    const uids: string[] = [];
    for (const { card, quantity } of deck.cards) {
      if (card.type === HERO_TYPE) continue;
      const defId = register(card);
      for (let i = 0; i < quantity; i++) {
        const uid = `c${++counter}`;
        cards[uid] = { uid, defId, owner, zone: 'deck', damage: 0, attackBonus: 0, healthBonus: 0, exhausted: false, enteredOnTurn: 0 };
        uids.push(uid);
      }
    }
    const [shuffled, next] = shuffle(uids, rng);
    rng = next;
    const heroDefId = deck.hero ? register(deck.hero) : null;
    const heroHealth = deck.hero?.health || RULES.defaultHeroHealth;
    return {
      index: owner, name: names[index], heroDefId, heroHealth, heroMaxHealth: heroHealth,
      will: 0, spire: RULES.startingSpire, ultimateUsed: false,
      deck: shuffled, hand: [], board: [], imagination: [], discard: [],
    };
  }) as [PlayerState, PlayerState];

  const state: GameState = {
    turn: 0, active: firstPlayer, firstPlayer, phase: 'playing', winner: null,
    players, cards, defs, rng, log: [],
  };
  log(state, null, 'info', `La partie commence. ${players[firstPlayer].name} joue en premier.`);
  for (const p of [0, 1] as const) drawCards(state, p, RULES.handSize);
  startTurn(state, firstPlayer);
  return state;
}

/* ---------- Actions ---------- */

export function applyAction(previous: GameState, action: Action): ActionResult {
  if (previous.phase === 'over' && action.type !== 'ADJUST' && action.type !== 'MOVE') return { state: previous, error: 'La partie est terminée.' };
  const state = structuredClone(previous);
  const fail = (error: string): ActionResult => ({ state: previous, error });

  switch (action.type) {
    case 'PLAY_CARD': {
      const reason = cannotPlayReason(state, action.uid);
      if (reason) return fail(reason);
      const card = state.cards[action.uid];
      const def = defOf(state, action.uid);
      const player = state.players[card.owner];
      const needed = cardsToPay(state, action.uid);
      const payWith = [...new Set(action.payWith)];
      if (payWith.length !== needed) return fail(`Choisis ${needed} carte${needed > 1 ? 's' : ''} de ta main pour payer.`);
      if (payWith.some(u => u === action.uid || !player.hand.includes(u))) return fail('Les cartes de paiement doivent venir de ta main.');

      player.will -= def.spire - needed;
      for (const u of payWith) moveTo(state, state.cards[u], 'discard');
      const from = card.zone === 'imagination' ? ' depuis son Imagination' : '';
      const paid = def.spire ? ` (${def.spire} Volonté${needed ? ` : ${payWith.map(u => defOf(state, u).name).join(', ')} défaussée${needed > 1 ? 's' : ''}` : ''})` : '';

      if (categoryOf(def) === 'drawing') {
        moveTo(state, card, 'discard');
        // La spire parfaite est écrite dans le texte de la carte : le journal rappelle la spire actuelle.
        log(state, card.owner, 'play', `${player.name} lance ${def.name}${from}${paid}, à la spire ${player.spire}. Effet à appliquer.`);
        if (isUltimateCard(def)) resetSpire(state, card.owner);
      } else {
        moveTo(state, card, 'board');
        card.enteredOnTurn = state.turn;
        card.exhausted = false;
        log(state, card.owner, 'play', `${player.name} pose ${def.name}${from}${paid}.`);
      }
      return { state };
    }

    case 'IMAGINE': {
      const reason = cannotImagineReason(state, action.uid);
      if (reason) return fail(reason);
      const card = state.cards[action.uid];
      const player = state.players[card.owner];
      const before = player.spire;
      moveTo(state, card, 'imagination');
      card.enteredOnTurn = state.turn;
      player.spire = clampSpire(player.spire + action.direction);
      log(state, card.owner, 'spire', `${player.name} pose ${defOf(state, card.uid).name} en Imagination : spire ${before} → ${player.spire}.`);
      return { state };
    }

    case 'ATTACK': {
      const reason = cannotAttackReason(state, action.attacker);
      if (reason) return fail(reason);
      const attacker = state.cards[action.attacker];
      const attackerDef = defOf(state, action.attacker);
      const power = attackOf(state, action.attacker);
      const enemy = other(attacker.owner);
      if (action.target.kind === 'hero') {
        if (action.target.player !== enemy) return fail('Tu ne peux attaquer que le Héros adverse.');
        attacker.exhausted = true;
        damageHero(state, enemy, power, `${attackerDef.name} attaque le Héros de ${state.players[enemy].name}`);
        return { state };
      }
      const defender = state.cards[action.target.uid];
      if (!defender || defender.zone !== 'board' || defender.owner !== enemy) return fail('Cible invalide.');
      if (!isAlly(state, defender.uid)) return fail('Seuls les Alliés peuvent être attaqués.');
      if (action.riposte && !canRiposte(state, defender.uid)) return fail('Ce défenseur ne peut pas répliquer (incliné ou sans attaque).');
      const defenderDef = defOf(state, defender.uid);
      attacker.exhausted = true;
      log(state, attacker.owner, 'attack', `${attackerDef.name} attaque ${defenderDef.name}${action.riposte ? ', qui réplique' : ', qui ne réplique pas'}.`);
      defender.damage += power;
      if (action.riposte) attacker.damage += attackOf(state, defender.uid);
      checkDeaths(state);
      return { state };
    }

    case 'ULTIMATE': {
      const reason = cannotUltimateReason(state, action.player);
      if (reason) return fail(reason);
      const p = state.players[action.player];
      p.ultimateUsed = true;
      log(state, action.player, 'play', `${p.name} lance l’ultimate de ${state.defs[p.heroDefId!].name} ! Effet à appliquer.`);
      resetSpire(state, action.player);
      return { state };
    }

    case 'END_TURN': {
      const p = state.players[state.active];
      // Zone Imagination : on ne garde que la limite (les cartes choisies, sinon les plus récentes).
      if (p.imagination.length > RULES.imaginationLimit) {
        const wanted = (action.keepImagination ?? []).filter(u => p.imagination.includes(u));
        const keep = new Set(wanted.length === RULES.imaginationLimit ? wanted : p.imagination.slice(-RULES.imaginationLimit));
        for (const u of p.imagination.slice()) {
          if (!keep.has(u)) {
            moveTo(state, state.cards[u], 'discard');
            log(state, p.index, 'destroy', `${defOf(state, u).name} quitte l’Imagination (limite de ${RULES.imaginationLimit}).`);
          }
        }
      }
      if (RULES.discardHandAtEndOfTurn) for (const u of p.hand.slice()) moveTo(state, state.cards[u], 'discard');
      drawCards(state, p.index, RULES.discardHandAtEndOfTurn ? RULES.handSize : Math.max(0, RULES.handSize - p.hand.length));
      p.will = 0;
      log(state, p.index, 'turn', `${p.name} termine son tour, défausse sa main et pioche ${RULES.handSize} cartes.`);
      startTurn(state, other(state.active));
      return { state };
    }

    case 'DRAW': {
      drawCards(state, action.player, 1);
      log(state, action.player, 'manual', `${state.players[action.player].name} pioche une carte (manuel).`);
      return { state };
    }

    case 'ADJUST': {
      const { target, stat, delta } = action;
      if (target.kind === 'hero') {
        const player = state.players[target.player];
        if (stat === 'will') {
          player.will = Math.max(0, player.will + delta);
          log(state, target.player, 'manual', `${player.name} : Volonté générée ${delta > 0 ? '+' : ''}${delta} (reste ${player.will}).`);
        } else if (stat === 'spire') {
          const before = player.spire;
          player.spire = clampSpire(player.spire + delta);
          log(state, target.player, 'spire', `${player.name} : spire ${before} → ${player.spire} (effet).`);
        } else {
          player.heroHealth -= stat === 'damage' ? delta : -delta;
          log(state, target.player, 'manual', `PV du Héros de ${player.name} : ${player.heroHealth} (manuel).`);
          checkHeroes(state);
        }
        return { state };
      }
      const card = state.cards[target.uid];
      if (!card) return fail('Carte introuvable.');
      if (stat === 'damage') card.damage = Math.max(0, card.damage + delta);
      else if (stat === 'attack') card.attackBonus += delta;
      else if (stat === 'health') card.healthBonus += delta;
      log(state, card.owner, 'manual', `${defOf(state, card.uid).name} : ${stat === 'attack' ? 'ATK' : 'PV'} ${delta > 0 ? '+' : ''}${stat === 'damage' ? -delta : delta} (manuel).`);
      checkDeaths(state);
      return { state };
    }

    case 'MOVE': {
      const card = state.cards[action.uid];
      if (!card) return fail('Carte introuvable.');
      const labels: Record<Zone, string> = { deck: 'sur le deck', hand: 'en main', board: 'sur le terrain', imagination: 'en Imagination', discard: 'dans la défausse' };
      moveTo(state, card, action.to);
      if (action.to !== 'board') resetCard(card);
      if (action.to === 'board' || action.to === 'imagination') card.enteredOnTurn = state.turn;
      log(state, card.owner, 'manual', `${defOf(state, card.uid).name} est placée ${labels[action.to]} (manuel).`);
      return { state };
    }

    case 'CONCEDE': {
      endGame(state, other(action.player), `${state.players[action.player].name} abandonne.`);
      return { state };
    }
  }
}

/* ---------- Étapes internes (modifient l'état copié) ---------- */

const clampSpire = (value: number) => Math.max(RULES.spireMin, Math.min(RULES.spireMax, value));

function resetSpire(state: GameState, player: PlayerIndex) {
  const p = state.players[player];
  const before = p.spire;
  p.spire = clampSpire(RULES.spireAfterUltimate);
  log(state, player, 'spire', `${p.name} redescend : spire ${before} → ${p.spire}.`);
}

function log(state: GameState, player: PlayerIndex | null, kind: LogKind, text: string) {
  state.log.push({ turn: state.turn, player, kind, text });
}

function resetCard(card: CardInstance) {
  Object.assign(card, { damage: 0, attackBonus: 0, healthBonus: 0, exhausted: false });
}

function moveTo(state: GameState, card: CardInstance, zone: Zone) {
  const player = state.players[card.owner];
  for (const z of ZONES) {
    const i = player[z].indexOf(card.uid);
    if (i >= 0) player[z].splice(i, 1);
  }
  player[zone].push(card.uid);
  card.zone = zone;
}

/** Début de tour : toutes les cartes du joueur se redressent. */
function startTurn(state: GameState, player: PlayerIndex) {
  state.turn += 1;
  state.active = player;
  const p = state.players[player];
  for (const uid of p.board) state.cards[uid].exhausted = false;
  log(state, player, 'turn', `Tour ${state.turn} — ${p.name} (spire ${p.spire}).`);
}

function drawCards(state: GameState, player: PlayerIndex, count: number) {
  const p = state.players[player];
  for (let i = 0; i < count; i++) {
    if (!p.deck.length && RULES.reshuffleDiscardWhenEmpty && p.discard.length) {
      const [shuffled, next] = shuffle(p.discard, state.rng);
      state.rng = next;
      p.deck = shuffled;
      p.discard = [];
      for (const uid of p.deck) state.cards[uid].zone = 'deck';
      log(state, player, 'info', `Le deck de ${p.name} est vide : la défausse est mélangée pour former un nouveau deck.`);
    }
    const uid = p.deck.pop();
    if (!uid) return;
    state.cards[uid].zone = 'hand';
    p.hand.push(uid);
  }
}

function damageHero(state: GameState, player: PlayerIndex, amount: number, reason: string) {
  const p = state.players[player];
  p.heroHealth -= amount;
  log(state, player, 'damage', `${reason} : −${amount} PV (reste ${p.heroHealth}).`);
  checkHeroes(state);
}

/** Les Alliés sans PV restants partent à la défausse. */
function checkDeaths(state: GameState) {
  for (const p of state.players) {
    for (const uid of p.board.slice()) {
      if (isAlly(state, uid) && healthOf(state, uid) <= 0) {
        const card = state.cards[uid];
        moveTo(state, card, 'discard');
        resetCard(card);
        log(state, card.owner, 'destroy', `${defOf(state, uid).name} est détruit.`);
      }
    }
  }
}

function checkHeroes(state: GameState) {
  if (state.phase === 'over') return;
  const dead = state.players.filter(p => p.heroHealth <= 0);
  if (dead.length === 2) endGame(state, null, 'Les deux Héros tombent en même temps : égalité.');
  else if (dead.length === 1) endGame(state, other(dead[0].index), `Le Héros de ${dead[0].name} est vaincu.`);
}

function endGame(state: GameState, winner: PlayerIndex | null, reason: string) {
  state.phase = 'over';
  state.winner = winner;
  log(state, winner, 'end', `${reason} ${winner === null ? '' : `${state.players[winner].name} remporte la partie !`}`.trim());
}

export const heroTarget = (player: PlayerIndex): Target => ({ kind: 'hero', player });
export const cardTarget = (uid: string): Target => ({ kind: 'card', uid });
