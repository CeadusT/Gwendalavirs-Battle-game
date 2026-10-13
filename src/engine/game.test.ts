import { describe, expect, it } from 'vitest';
import { alliesOf, applyAction, canRiposte, cannotAttackReason, cannotPlayReason, cannotUltimateReason, createGame, healthOf, heroAttackOf, statusActive } from './game';
import { normalizeCard, parseDeckFile, DECK_FILE_FORMAT } from './cards';
import { RULES } from './rules';
import type { Action, CardDef, DeckList, GameState } from './types';
import { HERO_ATTACKER } from './types';
import { DEMO_DECKS } from '../data/demoDecks';

function act(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  expect(result.error).toBeUndefined();
  return result.state;
}

const ally = (over: Partial<CardDef> = {}) => normalizeCard({ id: 'a', name: 'Soldat', type: 'Personnage', spire: 0, attack: 2, health: 2, ...over });
const deckOf = (...entries: [CardDef, number][]): DeckList => ({ name: 'Test', hero: null, cards: entries.map(([card, quantity]) => ({ card, quantity })) });
const game = (a: DeckList, b: DeckList, seed = 1) => createGame({ decks: [a, b], names: ['A', 'B'], seed });
const endTurn = (s: GameState) => act(s, { type: 'END_TURN' });

describe('création de partie', () => {
  it('chaque joueur pioche 5 cartes, spire 0, 20 PV', () => {
    const s = createGame({ decks: [DEMO_DECKS[0], DEMO_DECKS[1]], names: ['A', 'B'], seed: 42 });
    expect(s.players[0].hand).toHaveLength(5);
    expect(s.players[1].hand).toHaveLength(5);
    expect(s.players[0].spire).toBe(0);
    expect(s.players[0].heroHealth).toBe(20);
  });
});

describe('fin de tour', () => {
  it('défausse toute la main et pioche 5 cartes', () => {
    let s = game(deckOf([ally(), 30]), deckOf([ally(), 30]));
    const oldHand = s.players[0].hand.slice();
    s = endTurn(s);
    expect(s.players[0].hand).toHaveLength(5);
    expect(s.players[0].discard).toEqual(oldHand);
    expect(s.active).toBe(1);
  });

  it('deck vide : la défausse est remélangée', () => {
    let s = game(deckOf([ally(), 7]), deckOf([ally(), 30]));
    s = endTurn(s); // A : 5 défaussées, pioche 2 + remélange
    expect(s.players[0].hand).toHaveLength(5);
  });
});

describe('Volonté', () => {
  it('on paye en défaussant des cartes de sa main', () => {
    let s = game(deckOf([ally({ spire: 2 }), 30]), deckOf([ally(), 30]));
    const [card, p1, p2] = s.players[0].hand;
    expect(applyAction(s, { type: 'PLAY_CARD', uid: card, payWith: [p1] }).error).toMatch(/2 cartes/);
    s = act(s, { type: 'PLAY_CARD', uid: card, payWith: [p1, p2] });
    expect(s.players[0].board).toEqual([card]);
    expect(s.players[0].discard).toEqual([p1, p2]);
    expect(s.players[0].hand).toHaveLength(2);
  });

  it('la Volonté générée se dépense en premier', () => {
    let s = game(deckOf([ally({ spire: 2 }), 30]), deckOf([ally(), 30]));
    s = act(s, { type: 'ADJUST', target: { kind: 'hero', player: 0 }, stat: 'will', delta: 1 });
    const [card, p1] = s.players[0].hand;
    s = act(s, { type: 'PLAY_CARD', uid: card, payWith: [p1] });
    expect(s.players[0].will).toBe(0);
  });
});

describe('Alliés et Objets', () => {
  it('3 Alliés maximum', () => {
    const relic = normalizeCard({ id: 'o', name: 'Relique', type: 'Objet', spire: 0 });
    let s = game(deckOf([ally(), 4], [relic, 1]), deckOf([ally(), 30]), 4);
    const refused: string[] = [];
    for (const uid of s.players[0].hand.slice()) {
      const result = applyAction(s, { type: 'PLAY_CARD', uid, payWith: [] });
      if (result.error) refused.push(result.error);
      s = result.state;
    }
    expect(s.players[0].board).toHaveLength(4);
    expect(refused).toEqual([expect.stringMatching(/3 Alliés/)]);
  });

  it('3 Objets maximum', () => {
    const relic = normalizeCard({ id: 'o', name: 'Relique', type: 'Objet', spire: 0 });
    let s = game(deckOf([relic, 30]), deckOf([ally(), 30]));
    const hand = s.players[0].hand.slice();
    for (const uid of hand.slice(0, 3)) s = act(s, { type: 'PLAY_CARD', uid, payWith: [] });
    expect(cannotPlayReason(s, hand[3])).toMatch(/3 Objets/);
  });

  it('un Allié unique ne peut être posé qu’une fois', () => {
    const hero = ally({ id: 'u', name: 'Ewilan', unique: true });
    let s = game(deckOf([hero, 30]), deckOf([ally(), 30]));
    const [a, b] = s.players[0].hand;
    s = act(s, { type: 'PLAY_CARD', uid: a, payWith: [] });
    expect(cannotPlayReason(s, b)).toMatch(/unique/);
  });
});

describe('combat', () => {
  const setup = () => {
    let s = game(deckOf([ally(), 30]), deckOf([ally({ id: 'w', name: 'Mur', attack: 1, health: 5 }), 30]));
    const a = s.players[0].hand[0];
    s = act(s, { type: 'PLAY_CARD', uid: a, payWith: [] });
    expect(cannotAttackReason(s, a)).toMatch(/prochain tour/);
    s = endTurn(s);
    const b = s.players[1].hand[0];
    s = act(s, { type: 'PLAY_CARD', uid: b, payWith: [] });
    s = endTurn(s);
    return { s, a, b };
  };

  it('le défenseur choisit de répliquer', () => {
    const { s: start, a, b } = setup();
    const s = act(start, { type: 'ATTACK', attacker: a, target: { kind: 'card', uid: b }, riposte: true });
    expect(healthOf(s, b)).toBe(3);
    expect(healthOf(s, a)).toBe(1);
    expect(cannotAttackReason(s, a)).toMatch(/engagé/);
  });

  it('ou de ne pas répliquer', () => {
    const { s: start, a, b } = setup();
    const s = act(start, { type: 'ATTACK', attacker: a, target: { kind: 'card', uid: b }, riposte: false });
    expect(healthOf(s, a)).toBe(2);
  });

  it('un Allié incliné ne peut pas répliquer, et se redresse au début de son tour', () => {
    let { s, a, b } = setup();
    s = act(s, { type: 'ATTACK', attacker: a, target: { kind: 'hero', player: 1 }, riposte: false });
    s = endTurn(s);
    expect(s.cards[a].exhausted).toBe(true);
    expect(applyAction(s, { type: 'ATTACK', attacker: b, target: { kind: 'card', uid: a }, riposte: true }).error).toMatch(/répliquer/);
    s = endTurn(s);
    expect(s.cards[a].exhausted).toBe(false);
  });

  it('le Héros à 0 PV perd la partie', () => {
    let { s, a } = setup();
    s = act(s, { type: 'ADJUST', target: { kind: 'hero', player: 1 }, stat: 'damage', delta: 18 });
    s = act(s, { type: 'ATTACK', attacker: a, target: { kind: 'hero', player: 1 }, riposte: false });
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(0);
  });
});

describe('spire et Imagination', () => {
  const drawing = normalizeCard({ id: 'd', name: 'Trait', type: 'Dessin de base', spire: 0 });

  it('poser un Dessin en Imagination fait monter ou descendre la spire', () => {
    let s = game(deckOf([drawing, 30]), deckOf([ally(), 30]));
    const [d1, d2, d3] = s.players[0].hand;
    s = act(s, { type: 'IMAGINE', uid: d1, direction: 1 });
    s = act(s, { type: 'IMAGINE', uid: d2, direction: 1 });
    s = act(s, { type: 'IMAGINE', uid: d3, direction: -1 });
    expect(s.players[0].spire).toBe(1);
    expect(s.players[0].imagination).toHaveLength(3);
    expect(cannotPlayReason(s, d1)).toMatch(/ce tour-ci/);
    s = act(s, { type: 'END_TURN', keepImagination: [d1, d3] });
    expect(s.players[0].imagination).toEqual([d1, d3]);
    s = endTurn(s);
    s = act(s, { type: 'PLAY_CARD', uid: d1, payWith: [] });
    expect(s.players[0].discard).toContain(d1);
  });

  it('un Dessin légendaire se lance à la spire 6 et la fait redescendre à 0', () => {
    const legend = normalizeCard({ id: 'l', name: 'Monolithe', type: 'Dessin légendaire', spire: 0 });
    let s = game(deckOf([legend, 30]), deckOf([ally(), 30]));
    const uid = s.players[0].hand[0];
    expect(cannotPlayReason(s, uid)).toMatch(/spire 6/);
    s = act(s, { type: 'ADJUST', target: { kind: 'hero', player: 0 }, stat: 'spire', delta: 6 });
    s = act(s, { type: 'PLAY_CARD', uid, payWith: [] });
    expect(s.players[0].spire).toBe(0);
  });

  it('la spire reste entre 0 et 6, l’ultimate se lance à 6 et la fait redescendre à 0', () => {
    let s = createGame({ decks: [DEMO_DECKS[0], DEMO_DECKS[1]], names: ['A', 'B'], seed: 3 });
    s = act(s, { type: 'ADJUST', target: { kind: 'hero', player: s.active }, stat: 'spire', delta: -1 });
    expect(s.players[s.active].spire).toBe(0);
    expect(cannotUltimateReason(s, s.active)).toMatch(/spire 6/);
    for (let i = 0; i < 8; i++) s = act(s, { type: 'ADJUST', target: { kind: 'hero', player: s.active }, stat: 'spire', delta: 1 });
    expect(s.players[s.active].spire).toBe(RULES.spireMax);
    s = act(s, { type: 'ULTIMATE', player: s.active });
    expect(s.players[s.active].spire).toBe(0);
    expect(cannotUltimateReason(s, s.active)).toMatch(/spire 6/);
  });
});

describe('fichier deck', () => {
  it('lit un export du deckbuilder', () => {
    const deck = parseDeckFile({ format: DECK_FILE_FORMAT, version: 1, name: 'Mon deck', hero: { id: 'h', name: 'H', type: 'Héros', health: 25 }, cards: [{ card: { id: 'a', name: 'A', type: 'Personnage', unique: true }, quantity: 3 }] });
    expect(deck.hero?.health).toBe(25);
    expect(deck.cards[0].card.unique).toBe(true);
    expect(() => parseDeckFile({ cards: [] })).toThrow();
  });
});

/* ---------- Mots-clés, Héros, boucliers, Éternels, états ---------- */

/** Pose des cartes directement (sans payer) pour préparer une situation de combat. */
function setupBoards(mine: CardDef[], theirs: CardDef[], filler = ally({ id: 'f', name: 'Recrue' })) {
  let s = game(deckOf(...mine.map(c => [c, 1] as [CardDef, number]), [filler, 20]), deckOf(...theirs.map(c => [c, 1] as [CardDef, number]), [filler, 20]));
  const place = (player: 0 | 1, names: string[]) => {
    for (const name of names) {
      const uid = Object.values(s.cards).find(c => c.owner === player && c.zone !== 'board' && s.defs[c.defId].name === name)!.uid;
      s = act(s, { type: 'MOVE', uid, to: 'board' });
    }
  };
  place(0, mine.map(c => c.name));
  place(1, theirs.map(c => c.name));
  // Laisse passer un tour complet pour que tout le monde puisse attaquer.
  if (s.active !== 0) s = endTurn(s);
  s = endTurn(endTurn(s));
  const uidOf = (name: string) => Object.values(s.cards).find(c => c.zone === 'board' && s.defs[c.defId].name === name)!.uid;
  return { s, uidOf };
}

describe('types du deckbuilder', () => {
  it('« Allié » est un Allié, une arme est un Objet', () => {
    const { s, uidOf } = setupBoards([normalizeCard({ id: 'x', name: 'Hans', type: 'Allié', attack: 2, health: 1 })], []);
    expect(cannotAttackReason(s, uidOf('Hans'))).toBeNull();
  });
});

describe('mots-clés', () => {
  it('Provocation oblige à attaquer la carte, sauf si elle est engagée', () => {
    const wall = normalizeCard({ id: 'b', name: 'Bjorn', type: 'Allié', attack: 1, health: 4, text: 'Provocation' });
    const { s, uidOf } = setupBoards([ally({ name: 'A' })], [wall, ally({ id: 'z', name: 'Z' })]);
    const a = uidOf('A');
    expect(applyAction(s, { type: 'ATTACK', attacker: a, target: { kind: 'hero', player: 1 }, riposte: false }).error).toMatch(/Provocation/);
    expect(applyAction(s, { type: 'ATTACK', attacker: a, target: { kind: 'card', uid: uidOf('Z') }, riposte: false }).error).toMatch(/Provocation/);
    const tapped = act(s, { type: 'TAP', target: { kind: 'card', uid: uidOf('Bjorn') }, mode: 'engage' });
    act(tapped, { type: 'ATTACK', attacker: a, target: { kind: 'hero', player: 1 }, riposte: false });
  });

  it('Défenseur ne peut pas attaquer ; Fonceur attaque tout de suite', () => {
    const guard = normalizeCard({ id: 'g', name: 'Garde', type: 'Allié', attack: 1, health: 1, text: 'Provocation - Défenseur' });
    const { s, uidOf } = setupBoards([guard], []);
    expect(cannotAttackReason(s, uidOf('Garde'))).toMatch(/Défenseur/);
    let t = game(deckOf([normalizeCard({ id: 'm', name: 'Marcheur', type: 'Allié', attack: 2, health: 1, text: 'Fonceur Fonceur — Peut attaquer dès son arrivée en jeu.' }), 30]), deckOf([ally(), 30]));
    const m = t.players[0].hand[0];
    t = act(t, { type: 'PLAY_CARD', uid: m, payWith: [] });
    expect(cannotAttackReason(t, m)).toBeNull();
  });

  it('Riposte réplique même engagé ; Robuste réduit chaque blessure de 1', () => {
    const tslich = normalizeCard({ id: 't', name: 'Tslich', type: 'Allié', attack: 4, health: 4, text: 'Fonceur - Riposte - Parade 1' });
    const goule = normalizeCard({ id: 'o', name: 'Goule', type: 'Allié', attack: 1, health: 4, text: 'Robuste' });
    const { s, uidOf } = setupBoards([ally({ name: 'A', attack: 3, health: 5 })], [tslich, goule]);
    const engaged = act(s, { type: 'TAP', target: { kind: 'card', uid: uidOf('Tslich') }, mode: 'engage' });
    expect(canRiposte(engaged, uidOf('Tslich'), uidOf('A'))).toBe(true);
    const hit = act(engaged, { type: 'ATTACK', attacker: uidOf('A'), target: { kind: 'card', uid: uidOf('Goule') }, riposte: false });
    expect(healthOf(hit, uidOf('Goule'))).toBe(2);
  });

  it('Vigueur se redresse en fin de tour', () => {
    const maniel = normalizeCard({ id: 'v', name: 'Maniel', type: 'Allié', attack: 2, health: 2, text: 'Vigueur Vigueur : Se désengage en fin de tour' });
    const { s, uidOf } = setupBoards([maniel], []);
    const after = endTurn(act(s, { type: 'ATTACK', attacker: uidOf('Maniel'), target: { kind: 'hero', player: 1 }, riposte: false }));
    expect(after.cards[uidOf('Maniel')].exhausted).toBe(false);
  });
});

describe('Héros', () => {
  const bow = normalizeCard({ id: 'arc', name: 'Arc Long', type: 'Objet', subtype: 'Equipement Héroïque', attack: 1, health: 2, text: 'Donne Portée à mon Héros' });

  it('attaque avec son arme, qui perd 1 durabilité et se brise', () => {
    const { s: start, uidOf } = setupBoards([bow], [ally({ name: 'Cible', attack: 3, health: 5 })]);
    expect(heroAttackOf(start, 0)).toBe(1);
    // Portée : la cible ne peut pas répliquer.
    expect(canRiposte(start, uidOf('Cible'), HERO_ATTACKER)).toBe(false);
    let s = act(start, { type: 'ATTACK', attacker: HERO_ATTACKER, target: { kind: 'hero', player: 1 }, riposte: false });
    expect(s.players[1].heroHealth).toBe(19);
    expect(cannotAttackReason(s, HERO_ATTACKER)).toMatch(/engagé/);
    s = endTurn(endTurn(s));
    s = act(s, { type: 'ATTACK', attacker: HERO_ATTACKER, target: { kind: 'hero', player: 1 }, riposte: false });
    expect(s.players[0].discard).toContain(uidOf('Arc Long'));
  });

  it('les boucliers absorbent les blessures', () => {
    const { s: start, uidOf } = setupBoards([ally({ name: 'A', attack: 3 })], []);
    let s = act(start, { type: 'ADJUST', target: { kind: 'hero', player: 1 }, stat: 'shields', delta: 2 });
    s = act(s, { type: 'ATTACK', attacker: uidOf('A'), target: { kind: 'hero', player: 1 }, riposte: false });
    expect(s.players[1].shields).toBe(0);
    expect(s.players[1].heroHealth).toBe(19);
  });
});

describe('Dessins Éternels et états', () => {
  const raflesie = normalizeCard({ id: 'r', name: 'Raflésie', type: 'Dessin', spire: 0, attack: 1, health: 4, text: 'Prévient les 2 prochaines blessures. Spire 3 — Éternel — Provocation - Défenseur' });

  it('un Dessin reste en jeu seulement à sa spire, et compte comme Allié', () => {
    let s = game(deckOf([raflesie, 30]), deckOf([ally(), 30]));
    const [a, b] = s.players[0].hand;
    s = act(s, { type: 'PLAY_CARD', uid: a, payWith: [] });
    expect(s.players[0].discard).toContain(a);
    s = act(s, { type: 'ADJUST', target: { kind: 'hero', player: 0 }, stat: 'spire', delta: 3 });
    s = act(s, { type: 'PLAY_CARD', uid: b, payWith: [] });
    expect(s.players[0].board).toContain(b);
    expect(s.cards[b].keywords).toEqual(expect.arrayContaining(['Provocation', 'Défenseur', 'Éternel']));
    expect(alliesOf(s, 0)).toContain(b);
  });

  it('Surchauffe bloque les Dessins Feu au tour suivant ; Brûlure empêche de se soigner', () => {
    const zele = normalizeCard({ id: 'z', name: 'Excès de Zèle', type: 'Dessin', color: 'Rouge', spire: 0, text: 'Pioche deux cartes Surchauffe' });
    const inferno = normalizeCard({ id: 'i', name: 'Inferno', type: 'Dessin', color: 'Rouge', spire: 0, text: 'Inflige 3 dégâts à votre adversaire Brûlure Votre adversaire ne peut pas se soigner au tour suivant' });
    let s = game(deckOf([zele, 15], [inferno, 15]), deckOf([ally(), 30]), 2);
    const z = s.players[0].hand.find(u => s.defs[s.cards[u].defId].name === 'Excès de Zèle')!;
    const i = s.players[0].hand.find(u => s.defs[s.cards[u].defId].name === 'Inferno')!;
    s = act(s, { type: 'PLAY_CARD', uid: i, payWith: [] });
    s = act(s, { type: 'PLAY_CARD', uid: z, payWith: [] });
    s = endTurn(s);
    expect(applyAction(s, { type: 'ADJUST', target: { kind: 'hero', player: 1 }, stat: 'damage', delta: -1 }).error).toMatch(/Brûlure/);
    s = endTurn(s);
    const fire = s.players[0].hand.find(u => s.defs[s.cards[u].defId].color === 'Rouge');
    if (fire) expect(cannotPlayReason(s, fire)).toMatch(/Surchauffe/);
    expect(statusActive(s, 0, 'surchauffe')).toBe(true);
  });
});
