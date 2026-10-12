import { describe, expect, it } from 'vitest';
import { applyAction, cannotAttackReason, createGame, healthOf } from './game';
import { normalizeCard, parseDeckFile, DECK_FILE_FORMAT } from './cards';
import { RULES } from './rules';
import type { Action, DeckList, GameState } from './types';
import { DEMO_DECKS } from '../data/demoDecks';

const newGame = (seed = 42) => createGame({ decks: [DEMO_DECKS[0], DEMO_DECKS[1]], names: ['Alice', 'Bob'], seed });

function act(state: GameState, action: Action): GameState {
  const result = applyAction(state, action);
  expect(result.error).toBeUndefined();
  return result.state;
}

const soldier = normalizeCard({ id: 's', name: 'Soldat', type: 'Personnage', spire: 1, attack: 2, health: 2 });
const wall = normalizeCard({ id: 'w', name: 'Mur', type: 'Personnage', spire: 1, attack: 1, health: 5 });
const deckOf = (c: typeof soldier, n = 30): DeckList => ({ name: 'Test', hero: null, cards: [{ card: c, quantity: n }] });

describe('création de partie', () => {
  it('distribue les mains de départ et donne 1 Volonté au premier joueur', () => {
    const s = newGame();
    expect(s.players[0].hand).toHaveLength(RULES.startingHand);
    expect(s.players[1].hand).toHaveLength(RULES.startingHand + RULES.secondPlayerBonusCards);
    expect(s.players[0].will).toBe(1);
    expect(s.turn).toBe(1);
    expect(s.players[0].heroHealth).toBe(20);
  });

  it('est reproductible avec la même graine', () => {
    expect(newGame(7).players[0].hand).toEqual(newGame(7).players[0].hand);
    expect(newGame(7).players[0].deck).not.toEqual(newGame(8).players[0].deck);
  });
});

describe('tour de jeu', () => {
  it('fin de tour : Volonté +1 et pioche', () => {
    let s = newGame();
    s = act(s, { type: 'END_TURN' });
    expect(s.active).toBe(1);
    expect(s.players[1].will).toBe(1);
    expect(s.players[1].hand).toHaveLength(RULES.startingHand + RULES.secondPlayerBonusCards + 1);
    s = act(s, { type: 'END_TURN' });
    expect(s.players[0].maxWill).toBe(2);
  });

  it('refuse une carte trop chère et ne modifie pas l’état', () => {
    const s = createGame({ decks: [deckOf(normalizeCard({ id: 'x', name: 'Cher', type: 'Personnage', spire: 5 })), deckOf(soldier)], names: ['A', 'B'], seed: 1 });
    const result = applyAction(s, { type: 'PLAY_CARD', uid: s.players[0].hand[0] });
    expect(result.error).toMatch(/Volonté/);
    expect(result.state).toBe(s);
  });
});

describe('combat', () => {
  const setup = () => {
    let s = createGame({ decks: [deckOf(soldier), deckOf(wall)], names: ['A', 'B'], seed: 3 });
    const a = s.players[0].hand[0];
    s = act(s, { type: 'PLAY_CARD', uid: a });
    expect(cannotAttackReason(s, a)).toMatch(/prochain tour/);
    s = act(s, { type: 'END_TURN' });
    const b = s.players[1].hand[0];
    s = act(s, { type: 'PLAY_CARD', uid: b });
    s = act(s, { type: 'END_TURN' });
    return { s, a, b };
  };

  it('attaque une carte : dégâts et riposte', () => {
    const { s: start, a, b } = setup();
    const s = act(start, { type: 'ATTACK', attacker: a, target: { kind: 'card', uid: b } });
    expect(healthOf(s, b)).toBe(3);
    expect(healthOf(s, a)).toBe(1);
    expect(cannotAttackReason(s, a)).toMatch(/déjà attaqué/);
  });

  it('une carte sans PV part à la défausse, le Héros à 0 PV perd la partie', () => {
    let { s, a } = setup();
    s = act(s, { type: 'ADJUST', target: { kind: 'hero', player: 1 }, stat: 'damage', delta: 18 });
    s = act(s, { type: 'ATTACK', attacker: a, target: { kind: 'hero', player: 1 } });
    expect(s.players[1].heroHealth).toBe(0);
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(0);
    s = act(s, { type: 'ADJUST', target: { kind: 'card', uid: a }, stat: 'damage', delta: 5 });
    expect(s.players[0].discard).toContain(a);
  });
});

describe('fatigue', () => {
  it('piocher dans un deck vide fait perdre 1, puis 2 PV', () => {
    let s = createGame({ decks: [deckOf(soldier, 5), deckOf(soldier, 6)], names: ['A', 'B'], seed: 1 });
    s = act(s, { type: 'END_TURN' }); // B pioche dans un deck vide : −1
    expect(s.players[1].heroHealth).toBe(19);
    s = act(s, { type: 'END_TURN' }); // A : −1
    s = act(s, { type: 'END_TURN' }); // B : −2
    expect(s.players[1].heroHealth).toBe(17);
  });
});

describe('fichier deck', () => {
  it('lit un export du deckbuilder', () => {
    const deck = parseDeckFile({ format: DECK_FILE_FORMAT, version: 1, name: 'Mon deck', hero: { id: 'h', name: 'H', type: 'Héros', health: 25 }, cards: [{ card: { id: 'a', name: 'A', type: 'Personnage', attack: 1, health: 1 }, quantity: 3 }] });
    expect(deck.hero?.health).toBe(25);
    expect(deck.cards[0].quantity).toBe(3);
    expect(() => parseDeckFile({ cards: [] })).toThrow();
  });
});

describe('objets', () => {
  it('un Objet ne peut pas être attaqué', () => {
    const relic = normalizeCard({ id: 'o', name: 'Relique', type: 'Objet', spire: 0 });
    let s = createGame({ decks: [deckOf(soldier), deckOf(relic)], names: ['A', 'B'], seed: 5 });
    const a = s.players[0].hand[0];
    s = act(s, { type: 'PLAY_CARD', uid: a });
    s = act(s, { type: 'END_TURN' });
    const o = s.players[1].hand[0];
    s = act(s, { type: 'PLAY_CARD', uid: o });
    s = act(s, { type: 'END_TURN' });
    expect(applyAction(s, { type: 'ATTACK', attacker: a, target: { kind: 'card', uid: o } }).error).toMatch(/Personnages/);
  });
});
