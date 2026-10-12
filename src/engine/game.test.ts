import { describe, expect, it } from 'vitest';
import { applyAction, cannotAttackReason, cannotPlayReason, cannotUltimateReason, createGame, healthOf } from './game';
import { normalizeCard, parseDeckFile, DECK_FILE_FORMAT } from './cards';
import { RULES } from './rules';
import type { Action, CardDef, DeckList, GameState } from './types';
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
  it('3 Alliés maximum, Objets illimités', () => {
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
    expect(cannotAttackReason(s, a)).toMatch(/incliné/);
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

  it('la spire reste entre 0 et 6, ultimate à 6, une fois', () => {
    let s = createGame({ decks: [DEMO_DECKS[0], DEMO_DECKS[1]], names: ['A', 'B'], seed: 3 });
    s = act(s, { type: 'ADJUST', target: { kind: 'hero', player: s.active }, stat: 'spire', delta: -1 });
    expect(s.players[s.active].spire).toBe(0);
    expect(cannotUltimateReason(s, s.active)).toMatch(/spire 6/);
    for (let i = 0; i < 8; i++) s = act(s, { type: 'ADJUST', target: { kind: 'hero', player: s.active }, stat: 'spire', delta: 1 });
    expect(s.players[s.active].spire).toBe(RULES.spireMax);
    s = act(s, { type: 'ULTIMATE', player: s.active });
    expect(cannotUltimateReason(s, s.active)).toMatch(/déjà/);
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
