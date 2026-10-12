/* ==========================================================================
   Moteur de jeu : création d'une partie et application des actions.
   applyAction() ne modifie jamais l'état reçu : il en renvoie une copie.
   ========================================================================== */

import type { Action, ActionResult, CardDef, CardInstance, DeckList, GameState, LogKind, PlayerIndex, PlayerState, Target, Zone } from './types';
import { HERO_TYPE, RULES, TYPE_BEHAVIOUR } from './rules';
import { shuffle } from './rng';

/* ---------- Lecture de l'état ---------- */

export const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);
export const defOf = (state: GameState, uid: string): CardDef => state.defs[state.cards[uid].defId];
export const behaviourOf = (def: CardDef) => TYPE_BEHAVIOUR[def.type] ?? 'spell';

export function attackOf(state: GameState, uid: string): number {
  return Math.max(0, defOf(state, uid).attack + state.cards[uid].attackBonus);
}

export function healthOf(state: GameState, uid: string): number {
  const card = state.cards[uid];
  return defOf(state, uid).health + card.healthBonus - card.damage;
}

/** Pourquoi une carte de la main ne peut pas être jouée (null = elle peut l'être). */
export function cannotPlayReason(state: GameState, uid: string): string | null {
  const card = state.cards[uid];
  if (!card) return 'Carte introuvable.';
  if (state.phase !== 'playing') return 'La partie est terminée.';
  if (card.owner !== state.active) return "Ce n'est pas ton tour.";
  if (card.zone !== 'hand') return "Cette carte n'est pas dans ta main.";
  const def = defOf(state, uid);
  const player = state.players[card.owner];
  if (def.spire > player.will) return `Pas assez de Volonté (${def.spire} requise, ${player.will} disponible).`;
  if (behaviourOf(def) !== 'spell' && player.board.length >= RULES.boardLimit) return 'Le terrain est plein.';
  return null;
}

/** Pourquoi une carte du terrain ne peut pas attaquer (null = elle peut). */
export function cannotAttackReason(state: GameState, uid: string): string | null {
  const card = state.cards[uid];
  if (!card || card.zone !== 'board') return "Cette carte n'est pas sur le terrain.";
  if (state.phase !== 'playing') return 'La partie est terminée.';
  if (card.owner !== state.active) return "Ce n'est pas ton tour.";
  const def = defOf(state, uid);
  if (behaviourOf(def) !== 'unit') return 'Cette carte ne peut pas attaquer.';
  if (attackOf(state, uid) <= 0) return "Cette carte n'a pas d'attaque.";
  if (card.exhausted) return 'Cette carte a déjà attaqué ce tour.';
  if (RULES.summoningSickness && card.playedOnTurn === state.turn) return 'Elle vient d’arriver : elle pourra attaquer au prochain tour.';
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
    // Les définitions sont préfixées par le joueur : deux decks peuvent contenir
    // des cartes de même id mais de contenu différent (versions modifiées).
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
        cards[uid] = { uid, defId, owner, zone: 'deck', damage: 0, attackBonus: 0, healthBonus: 0, exhausted: false, playedOnTurn: 0 };
        uids.push(uid);
      }
    }
    const [shuffled, next] = shuffle(uids, rng);
    rng = next;
    const heroDefId = deck.hero ? register(deck.hero) : null;
    const heroHealth = deck.hero?.health || RULES.defaultHeroHealth;
    return {
      index: owner, name: names[index], heroDefId, heroHealth, heroMaxHealth: heroHealth,
      will: 0, maxWill: 0, fatigue: 0, deck: shuffled, hand: [], board: [], discard: [],
    };
  }) as [PlayerState, PlayerState];

  let state: GameState = {
    turn: 0, active: firstPlayer, firstPlayer, phase: 'playing', winner: null,
    players, cards, defs, rng, log: [],
  };
  log(state, null, 'info', `La partie commence. ${players[firstPlayer].name} joue en premier.`);
  for (const p of [firstPlayer, other(firstPlayer)]) {
    const count = RULES.startingHand + (p === firstPlayer ? 0 : RULES.secondPlayerBonusCards);
    for (let i = 0; i < count; i++) drawCard(state, p, false);
  }
  state = startTurn(state, firstPlayer);
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
      player.will -= def.spire;
      remove(player.hand, action.uid);
      if (behaviourOf(def) === 'spell') {
        moveTo(state, card, 'discard');
        log(state, card.owner, 'play', `${player.name} lance ${def.name}${def.spire ? ` (${def.spire} Volonté)` : ''}. Effet à appliquer à la main si besoin.`);
      } else {
        moveTo(state, card, 'board');
        card.playedOnTurn = state.turn;
        log(state, card.owner, 'play', `${player.name} joue ${def.name}${def.spire ? ` (${def.spire} Volonté)` : ''}.`);
      }
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
      const defenderDef = defOf(state, defender.uid);
      if (behaviourOf(defenderDef) !== 'unit') return fail('Seuls les Personnages et les Jetons peuvent être attaqués.');
      attacker.exhausted = true;
      log(state, attacker.owner, 'attack', `${attackerDef.name} attaque ${defenderDef.name}.`);
      defender.damage += power;
      if (RULES.defenderStrikesBack) attacker.damage += attackOf(state, defender.uid);
      checkDeaths(state);
      return { state };
    }

    case 'END_TURN': {
      log(state, state.active, 'turn', `${state.players[state.active].name} termine son tour.`);
      return { state: startTurn(state, other(state.active)) };
    }

    case 'DRAW': {
      drawCard(state, action.player, true);
      log(state, action.player, 'manual', `${state.players[action.player].name} pioche une carte (manuel).`);
      return { state };
    }

    case 'ADJUST': {
      const { target, stat, delta } = action;
      if (target.kind === 'hero') {
        const player = state.players[target.player];
        if (stat === 'will') {
          player.will = Math.max(0, player.will + delta);
          log(state, target.player, 'manual', `Volonté de ${player.name} ${delta > 0 ? '+' : ''}${delta} (manuel).`);
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
      const labels: Record<Zone, string> = { deck: 'sur le deck', hand: 'en main', board: 'sur le terrain', discard: 'dans la défausse' };
      moveTo(state, card, action.to);
      if (action.to !== 'board') Object.assign(card, { damage: 0, attackBonus: 0, healthBonus: 0, exhausted: false });
      else card.playedOnTurn = state.turn;
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

function log(state: GameState, player: PlayerIndex | null, kind: LogKind, text: string) {
  state.log.push({ turn: state.turn, player, kind, text });
}

function remove(list: string[], uid: string) {
  const index = list.indexOf(uid);
  if (index >= 0) list.splice(index, 1);
}

function moveTo(state: GameState, card: CardInstance, zone: Zone) {
  const player = state.players[card.owner];
  for (const z of ['deck', 'hand', 'board', 'discard'] as const) remove(player[z], card.uid);
  player[zone].push(card.uid);
  card.zone = zone;
}

function startTurn(state: GameState, player: PlayerIndex): GameState {
  state.turn += 1;
  state.active = player;
  const p = state.players[player];
  p.maxWill = Math.min(RULES.maxWill, p.maxWill === 0 ? RULES.startingWill : p.maxWill + RULES.willPerTurn);
  p.will = p.maxWill;
  for (const uid of p.board) state.cards[uid].exhausted = false;
  log(state, player, 'turn', `Tour ${state.turn} — ${p.name} (${p.will} Volonté).`);
  const skipDraw = RULES.firstPlayerSkipsFirstDraw && state.turn === 1;
  if (!skipDraw) drawCard(state, player, true);
  return state;
}

function drawCard(state: GameState, player: PlayerIndex, announce: boolean) {
  const p = state.players[player];
  const uid = p.deck.pop();
  if (!uid) {
    if (RULES.fatigueDamage && announce) {
      p.fatigue += 1;
      damageHero(state, player, p.fatigue, `${p.name} n'a plus de cartes : fatigue`);
    }
    return;
  }
  const card = state.cards[uid];
  if (p.hand.length >= RULES.maxHandSize) {
    card.zone = 'discard';
    p.discard.push(uid);
    log(state, player, 'destroy', `Main pleine : ${defOf(state, uid).name} est défaussée.`);
    return;
  }
  card.zone = 'hand';
  p.hand.push(uid);
}

function damageHero(state: GameState, player: PlayerIndex, amount: number, reason: string) {
  const p = state.players[player];
  p.heroHealth -= amount;
  log(state, player, 'damage', `${reason} : −${amount} PV (reste ${p.heroHealth}).`);
  checkHeroes(state);
}

/** Les cartes du terrain sans PV restants partent à la défausse. */
function checkDeaths(state: GameState) {
  for (const p of state.players) {
    for (const uid of p.board.slice()) {
      const def = defOf(state, uid);
      if (behaviourOf(def) === 'unit' && healthOf(state, uid) <= 0) {
        const card = state.cards[uid];
        moveTo(state, card, 'discard');
        Object.assign(card, { damage: 0, attackBonus: 0, healthBonus: 0, exhausted: false });
        log(state, card.owner, 'destroy', `${def.name} est détruite.`);
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

/* Raccourci pour les cibles */
export const heroTarget = (player: PlayerIndex): Target => ({ kind: 'hero', player });
export const cardTarget = (uid: string): Target => ({ kind: 'card', uid });
