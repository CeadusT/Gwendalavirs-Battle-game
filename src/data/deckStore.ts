/* Decks importés, conservés entre deux lancements du logiciel. */

import type { DeckList } from '../engine/types';
import { normalizeCard } from '../engine/cards';

const KEY = 'gwb-game.importedDecks';

export function loadImportedDecks(): DeckList[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as DeckList[];
    return raw.map(d => ({
      name: String(d.name),
      hero: d.hero ? normalizeCard(d.hero as never) : null,
      cards: d.cards.map(e => ({ card: normalizeCard(e.card as never), quantity: e.quantity })),
    }));
  } catch {
    return [];
  }
}

export function saveImportedDecks(decks: DeckList[]): string | null {
  try {
    localStorage.setItem(KEY, JSON.stringify(decks));
    return null;
  } catch {
    return 'Le deck est chargé pour cette session, mais trop volumineux pour être conservé (illustrations trop lourdes ?).';
  }
}
