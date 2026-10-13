/* ==========================================================================
   Moteur de jeu : création d'une partie et application des actions.
   applyAction() ne modifie jamais l'état reçu : il en renvoie une copie.
   ========================================================================== */

import type { Action, ActionResult, Attacker, CardDef, CardInstance, DeckList, GameState, LogKind, PlayerIndex, PlayerState, Status, Target, Zone } from './types';
import { HERO_ATTACKER } from './types';
import { HERO_TYPE, RULES, TYPE_CATEGORY, ULTIMATE_TYPES, type Category } from './rules';
import { activeText, arrivesExhausted, cardKeywords, grantsHeroReach, isWeapon, statusEffects } from './keywords';
import { shuffle } from './rng';

const ZONES = ['deck', 'hand', 'board', 'imagination', 'discard'] as const;

/* ---------- Lecture de l'état ---------- */

export const other = (p: PlayerIndex): PlayerIndex => (p === 0 ? 1 : 0);
export const defOf = (state: GameState, uid: string): CardDef => state.defs[state.cards[uid].defId];
/** Catégorie d'une carte : une arme (Equipement Héroïque) est toujours un Objet. */
export const categoryOf = (def: CardDef): Category => (isWeapon(def) ? 'object' : TYPE_CATEGORY[def.type] ?? 'drawing');
const hasStats = (def: CardDef) => def.attack > 0 || def.health > 0;
export const hasKeyword = (state: GameState, uid: string, keyword: string) => state.cards[uid]?.keywords.includes(keyword) ?? false;

/** Carte qui combat : un Allié, ou un Dessin Éternel qui a des ATK/PV (il compte alors comme Allié). */
export function isAlly(state: GameState, uid: string): boolean {
  const card = state.cards[uid];
  const def = defOf(state, uid);
  return categoryOf(def) === 'ally' || (card.eternal && hasStats(def));
}

export function attackOf(state: GameState, uid: string): number {
  return Math.max(0, defOf(state, uid).attack + state.cards[uid].attackBonus);
}

export function healthOf(state: GameState, uid: string): number {
  const card = state.cards[uid];
  return defOf(state, uid).health + card.healthBonus - card.damage;
}

export const alliesOf = (state: GameState, player: PlayerIndex) => state.players[player].board.filter(uid => isAlly(state, uid));
export const objectsOf = (state: GameState, player: PlayerIndex) => state.players[player].board.filter(uid => !state.cards[uid].eternal && categoryOf(defOf(state, uid)) === 'object');
export const weaponsOf = (state: GameState, player: PlayerIndex) => state.players[player].board.filter(uid => isWeapon(defOf(state, uid)));
/** Dessin légendaire : se lance à la spire 6 et fait redescendre la spire. */
export const isUltimateCard = (def: CardDef) => ULTIMATE_TYPES.has(def.type);
/** Dessin Feu = Dessin de l'élément Feu (Rouge). */
const isFireDrawing = (def: CardDef) => categoryOf(def) === 'drawing' && def.color === 'Rouge';

/** ATK du Héros : ses armes + les bonus jusqu'à la fin du tour. */
export function heroAttackOf(state: GameState, player: PlayerIndex): number {
  const p = state.players[player];
  return Math.max(0, p.heroAttackBonus + weaponsOf(state, player).reduce((n, uid) => n + attackOf(state, uid), 0));
}
export const heroHasReach = (state: GameState, player: PlayerIndex) => weaponsOf(state, player).some(uid => grantsHeroReach(defOf(state, uid)));

/** Un état (Surchauffe, Brûlure…) est-il actif ou à venir pour ce joueur ? */
export function statusActive(state: GameState, player: PlayerIndex, status: Status): boolean {
  const p = state.players[player];
  if (status === 'surchauffe') return p.noFireOnTurn >= state.turn;
  if (status === 'brulure') return p.noHealUntilTurn >= state.turn;
  return p.spireBurnUntilTurn >= state.turn;
}

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
  if (category === 'drawing') {
    if (isFireDrawing(def) && player.noFireOnTurn === state.turn) return 'Surchauffe : pas de Dessin Feu ce tour-ci.';
    // Un Dessin qui deviendrait Éternel avec des ATK/PV prend une place d'Allié.
    const kws = cardKeywords(def, player.spire, card.zone === 'imagination');
    if (kws.includes('Éternel') && hasStats(def) && alliesOf(state, card.owner).length >= RULES.maxAllies) return `${def.name} deviendrait un Allié Éternel, mais tu as déjà ${RULES.maxAllies} Alliés sur le terrain.`;
  }
  if (isUltimateCard(def) && player.spire < RULES.ultimateSpire) return `${def.type} : se lance seulement à la spire ${RULES.ultimateSpire} (tu es à ${player.spire}).`;
  if (def.unique && player.board.some(u => state.cards[u].defId === card.defId)) return `${def.name} est unique : un exemplaire est déjà sur le terrain.`;
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

/** Pourquoi une carte du terrain (ou le Héros, attacker = 'hero') ne peut pas attaquer. */
export function cannotAttackReason(state: GameState, attacker: Attacker): string | null {
  if (state.phase !== 'playing') return 'La partie est terminée.';
  if (attacker === HERO_ATTACKER) {
    const p = state.players[state.active];
    if (heroAttackOf(state, state.active) <= 0) return "Ton Héros n'a pas d'ATK (il lui faut une arme ou un bonus).";
    if (p.heroExhausted) return 'Ton Héros est engagé.';
    return null;
  }
  const card = state.cards[attacker];
  if (!card || card.zone !== 'board') return "Cette carte n'est pas sur le terrain.";
  if (card.owner !== state.active) return "Ce n'est pas ton tour.";
  if (!isAlly(state, attacker)) return 'Seuls les Alliés peuvent attaquer.';
  if (hasKeyword(state, attacker, 'Défenseur')) return 'Défenseur : cette carte ne peut pas attaquer.';
  if (attackOf(state, attacker) <= 0) return "Cet Allié n'a pas d'attaque.";
  if (card.exhausted) return 'Cet Allié est engagé : il a déjà attaqué.';
  if (RULES.summoningSickness && card.enteredOnTurn === state.turn && !hasKeyword(state, attacker, 'Fonceur')) return 'Il vient d’arriver : il pourra attaquer au prochain tour.';
  return null;
}

/** Alliés adverses avec Provocation, redressés : ils doivent être attaqués en premier. */
export const provokersOf = (state: GameState, player: PlayerIndex) =>
  alliesOf(state, player).filter(uid => !state.cards[uid].exhausted && hasKeyword(state, uid, 'Provocation'));

/** Pourquoi cette cible ne peut pas être attaquée (null = elle peut). */
export function cannotTargetReason(state: GameState, target: Target): string | null {
  const enemy = other(state.active);
  if (target.kind === 'hero') {
    if (target.player !== enemy) return 'Tu ne peux attaquer que le Héros adverse.';
  } else {
    const card = state.cards[target.uid];
    if (!card || card.zone !== 'board' || card.owner !== enemy) return 'Cible invalide.';
    if (!isAlly(state, target.uid)) return 'Seuls les Alliés peuvent être attaqués.';
  }
  const provokers = provokersOf(state, enemy);
  if (provokers.length && (target.kind === 'hero' || !provokers.includes(target.uid))) {
    return `Provocation : attaque d’abord ${provokers.map(u => defOf(state, u).name).join(' ou ')}.`;
  }
  return null;
}

/** Le défenseur peut-il répliquer ? (Allié redressé avec de l'attaque, ou Riposte ; pas contre Portée) */
export function canRiposte(state: GameState, defender: string, attacker?: Attacker): boolean {
  const card = state.cards[defender];
  if (!card || card.zone !== 'board' || !isAlly(state, defender) || attackOf(state, defender) <= 0) return false;
  if (card.exhausted && !hasKeyword(state, defender, 'Riposte')) return false;
  if (attacker === HERO_ATTACKER && heroHasReach(state, state.active)) return false;
  if (attacker && attacker !== HERO_ATTACKER && hasKeyword(state, attacker, 'Portée')) return false;
  return true;
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
        cards[uid] = { uid, defId, owner, zone: 'deck', damage: 0, attackBonus: 0, healthBonus: 0, exhausted: false, enteredOnTurn: 0, keywords: [], eternal: false };
        uids.push(uid);
      }
    }
    const [shuffled, next] = shuffle(uids, rng);
    rng = next;
    const heroDefId = deck.hero ? register(deck.hero) : null;
    const heroHealth = deck.hero?.health || RULES.defaultHeroHealth;
    return {
      index: owner, name: names[index], heroDefId, heroHealth, heroMaxHealth: heroHealth,
      heroExhausted: false, heroAttackBonus: 0, shields: 0, noFireOnTurn: 0, noHealUntilTurn: 0, spireBurnUntilTurn: 0,
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
  if (previous.phase === 'over' && !['ADJUST', 'MOVE', 'KEYWORD', 'STATUS', 'TAP'].includes(action.type)) return { state: previous, error: 'La partie est terminée.' };
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
      const fromImagination = card.zone === 'imagination';
      const from = fromImagination ? ' depuis son Imagination' : '';
      const paid = def.spire ? ` (${def.spire} Volonté${needed ? ` : ${payWith.map(u => defOf(state, u).name).join(', ')} défaussée${needed > 1 ? 's' : ''}` : ''})` : '';
      const spire = player.spire;
      const keywords = cardKeywords(def, spire, fromImagination);

      if (categoryOf(def) === 'drawing') {
        const eternal = keywords.includes('Éternel');
        if (eternal) enterBoard(state, card, keywords, true);
        else moveTo(state, card, 'discard');
        // Le journal rappelle la spire au moment du lancement (bonus de spire parfaite).
        log(state, card.owner, 'play', `${player.name} lance ${def.name}${from}${paid}, à la spire ${spire}${eternal ? ' : il reste en jeu (Éternel)' : ''}. Effet à appliquer.`);
        applyDrawingStatuses(state, card.owner, activeText(def, spire, fromImagination).text);
        if (isUltimateCard(def)) resetSpire(state, card.owner);
      } else {
        enterBoard(state, card, keywords, false);
        log(state, card.owner, 'play', `${player.name} pose ${def.name}${from}${paid}${card.exhausted ? ' (arrive engagé)' : ''}.`);
      }
      if (fromImagination && player.spireBurnUntilTurn >= state.turn) damageHero(state, card.owner, 1, `Brûlure de Spire (${def.name} jouée depuis l’Imagination)`);
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
      const reason = cannotAttackReason(state, action.attacker) ?? cannotTargetReason(state, action.target);
      if (reason) return fail(reason);
      const me = state.active;
      const enemy = other(me);
      const byHero = action.attacker === HERO_ATTACKER;
      const attackerName = byHero ? `Le Héros de ${state.players[me].name}` : defOf(state, action.attacker).name;
      const power = byHero ? heroAttackOf(state, me) : attackOf(state, action.attacker);
      if (byHero) state.players[me].heroExhausted = true;
      else state.cards[action.attacker].exhausted = true;

      if (action.target.kind === 'hero') {
        damageHero(state, enemy, power, `${attackerName} attaque le Héros de ${state.players[enemy].name}`);
      } else {
        const defender = action.target.uid;
        if (action.riposte && !canRiposte(state, defender, action.attacker)) return fail('Ce défenseur ne peut pas répliquer (engagé, sans attaque, ou attaquant avec Portée).');
        log(state, me, 'attack', `${attackerName} attaque ${defOf(state, defender).name}${action.riposte ? ', qui réplique' : ', qui ne réplique pas'}.`);
        damageCard(state, defender, power, true);
        if (action.riposte) {
          const back = attackOf(state, defender);
          if (byHero) damageHero(state, me, back, `${defOf(state, defender).name} réplique`);
          else damageCard(state, action.attacker, back, true);
        }
      }
      // Une arme perd 1 point de durabilité à chaque attaque du Héros.
      if (byHero) {
        for (const uid of weaponsOf(state, me)) {
          if (attackOf(state, uid) > 0) state.cards[uid].damage += 1;
        }
      }
      checkDeaths(state);
      return { state };
    }

    case 'TAP': {
      const { target, mode } = action;
      const engaged = mode !== 'disengage';
      if (target.kind === 'hero') {
        const p = state.players[target.player];
        if (mode === 'use' && p.heroExhausted) return fail('Le Héros est déjà engagé.');
        p.heroExhausted = engaged;
        log(state, target.player, mode === 'use' ? 'play' : 'manual', mode === 'use' ? `Le Héros de ${p.name} s’engage pour son effet {T}. Effet à appliquer.` : `Héros de ${p.name} ${engaged ? 'engagé' : 'désengagé'} (manuel).`);
        return { state };
      }
      const card = state.cards[target.uid];
      if (!card || card.zone !== 'board') return fail("Cette carte n'est pas sur le terrain.");
      if (mode === 'use' && card.exhausted) return fail('Cette carte est déjà engagée.');
      card.exhausted = engaged;
      const name = defOf(state, card.uid).name;
      log(state, card.owner, mode === 'use' ? 'play' : 'manual', mode === 'use' ? `${name} s’engage pour son effet {T}. Effet à appliquer.` : `${name} ${engaged ? 'engagée' : 'désengagée'} (manuel).`);
      return { state };
    }

    case 'STATUS': {
      const p = state.players[action.player];
      // Un état posé à la main vaut pour le prochain tour de ce joueur (ou le tour en cours si c'est le sien).
      const nextOwnTurn = action.player === state.active ? state.turn + 2 : state.turn + 1;
      const value = action.on ? nextOwnTurn : 0;
      const labels: Record<Status, string> = { surchauffe: 'Surchauffe', brulure: 'Brûlure', brulureSpire: 'Brûlure de Spire' };
      if (action.status === 'surchauffe') p.noFireOnTurn = value;
      else if (action.status === 'brulure') p.noHealUntilTurn = value;
      else p.spireBurnUntilTurn = value;
      log(state, action.player, 'status', `${labels[action.status]} ${action.on ? 'appliquée à' : 'retirée de'} ${p.name} (manuel).`);
      return { state };
    }

    case 'KEYWORD': {
      const card = state.cards[action.uid];
      if (!card) return fail('Carte introuvable.');
      card.keywords = action.on ? [...new Set([...card.keywords, action.keyword])] : card.keywords.filter(k => k !== action.keyword);
      log(state, card.owner, 'manual', `${defOf(state, card.uid).name} ${action.on ? 'gagne' : 'perd'} ${action.keyword} (manuel).`);
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
      p.heroAttackBonus = 0;
      // Vigueur : se redresse à la fin du tour de son propriétaire.
      for (const uid of p.board) if (hasKeyword(state, uid, 'Vigueur')) state.cards[uid].exhausted = false;
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
        } else if (stat === 'shields') {
          player.shields = Math.max(0, player.shields + delta);
          log(state, target.player, 'manual', `${player.name} : ${player.shields} bouclier${player.shields > 1 ? 's' : ''}.`);
        } else if (stat === 'heroAttack') {
          player.heroAttackBonus += delta;
          log(state, target.player, 'manual', `Héros de ${player.name} : ATK ${delta > 0 ? '+' : ''}${delta} jusqu’à la fin du tour.`);
        } else {
          const heal = stat === 'damage' ? -delta : delta;
          if (heal > 0 && player.noHealUntilTurn >= state.turn) return fail(`Brûlure : ${player.name} ne peut pas se soigner ce tour-ci.`);
          if (heal > 0) {
            player.heroHealth += heal;
            log(state, target.player, 'manual', `Le Héros de ${player.name} est soigné de ${heal} (reste ${player.heroHealth}).`);
          } else damageHero(state, target.player, -heal, `Le Héros de ${player.name} subit des blessures`);
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
      if (action.to === 'board') {
        const def = defOf(state, card.uid);
        enterBoard(state, card, cardKeywords(def, state.players[card.owner].spire), categoryOf(def) === 'drawing');
      } else {
        moveTo(state, card, action.to);
        resetCard(card);
        if (action.to === 'imagination') card.enteredOnTurn = state.turn;
      }
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
  Object.assign(card, { damage: 0, attackBonus: 0, healthBonus: 0, exhausted: false, keywords: [], eternal: false });
}

/** Une carte arrive sur le terrain avec ses mots-clés (lus à la spire où elle est jouée). */
function enterBoard(state: GameState, card: CardInstance, keywords: string[], eternal: boolean) {
  moveTo(state, card, 'board');
  Object.assign(card, { damage: 0, attackBonus: 0, healthBonus: 0, keywords, eternal, enteredOnTurn: state.turn });
  card.exhausted = arrivesExhausted(defOf(state, card.uid));
}

/** Surchauffe, Brûlure et Brûlure de Spire déclenchées par un Dessin lancé. */
function applyDrawingStatuses(state: GameState, caster: PlayerIndex, text: string) {
  const fx = statusEffects(text);
  const enemy = other(caster);
  if (fx.surchauffe) {
    state.players[caster].noFireOnTurn = state.turn + 2;
    log(state, caster, 'status', `Surchauffe : ${state.players[caster].name} ne pourra pas jouer de Dessin Feu à son prochain tour.`);
  }
  if (fx.brulure) {
    state.players[enemy].noHealUntilTurn = state.turn + 1;
    log(state, enemy, 'status', `Brûlure : ${state.players[enemy].name} ne pourra pas se soigner à son prochain tour.`);
  }
  if (fx.brulureSpire) {
    state.players[enemy].spireBurnUntilTurn = state.turn + 1;
    log(state, enemy, 'status', `Brûlure de Spire : ${state.players[enemy].name} subira 1 blessure par carte jouée depuis son Imagination à son prochain tour.`);
  }
}

/** Blessures infligées à une carte (Robuste et Immunité au combat appliqués). */
function damageCard(state: GameState, uid: string, amount: number, combat: boolean) {
  let value = amount;
  if (combat && hasKeyword(state, uid, 'Immunité au combat')) value = 0;
  if (value > 0 && hasKeyword(state, uid, 'Robuste')) value -= 1;
  state.cards[uid].damage += Math.max(0, value);
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

/** Début de tour : toutes les cartes du joueur (et son Héros) se redressent. */
function startTurn(state: GameState, player: PlayerIndex) {
  state.turn += 1;
  state.active = player;
  const p = state.players[player];
  for (const uid of p.board) state.cards[uid].exhausted = false;
  p.heroExhausted = false;
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

/** Blessures au Héros : les boucliers les absorbent d'abord (1 bouclier = 1 blessure). */
function damageHero(state: GameState, player: PlayerIndex, amount: number, reason: string) {
  const p = state.players[player];
  const absorbed = Math.min(p.shields, Math.max(0, amount));
  p.shields -= absorbed;
  const rest = Math.max(0, amount - absorbed);
  p.heroHealth -= rest;
  const shieldNote = absorbed ? ` (${absorbed} absorbée${absorbed > 1 ? 's' : ''} par les boucliers)` : '';
  log(state, player, 'damage', `${reason} : ${amount} blessure${amount > 1 ? 's' : ''}${shieldNote}, reste ${p.heroHealth} PV.`);
  checkHeroes(state);
}

/** Les Alliés sans PV restants et les armes sans durabilité partent à la défausse. */
function checkDeaths(state: GameState) {
  for (const p of state.players) {
    for (const uid of p.board.slice()) {
      const weapon = isWeapon(defOf(state, uid));
      if ((isAlly(state, uid) || weapon) && healthOf(state, uid) <= 0) {
        const card = state.cards[uid];
        const name = defOf(state, uid).name;
        moveTo(state, card, 'discard');
        resetCard(card);
        log(state, card.owner, 'destroy', weapon ? `${name} se brise.` : `${name} est détruit.`);
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
