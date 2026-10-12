/* ==========================================================================
   Cartes et decks : lecture des fichiers exportés par le deckbuilder.
   ========================================================================== */

import type { CardDef, DeckList } from './types';
import { HERO_TYPE } from './rules';

const COLORS = ['Rouge', 'Bleu', 'Vert', 'Violet', 'Marron', 'Jaune', 'Gris'];
const RARITIES = ['Commun', 'Rare', 'Légendaire'];
const AUTO_HIDE_SPIRE_TYPES = new Set(['Personnage', 'Objet', 'Jeton', 'Dessin de base jeton']);

const num = (v: unknown, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/** Toute carte qui entre dans le jeu passe par ici : valeurs manquantes complétées,
    valeurs aberrantes corrigées (même logique que le deckbuilder). */
export function normalizeCard(raw: Partial<CardDef> & Record<string, unknown>): CardDef {
  let type = String(raw.type ?? raw.tribal ?? 'Carte').trim() || 'Carte';
  if (type === 'Tribal jeton') type = 'Jeton';
  const isCharacter = type.includes('Personnage');
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? 'Carte sans nom'),
    type,
    subtype: String(raw.subtype ?? '').trim(),
    color: COLORS.includes(String(raw.color)) ? String(raw.color) : 'Gris',
    rarity: RARITIES.includes(String(raw.rarity)) ? String(raw.rarity) : 'Commun',
    set: String(raw.set ?? ''),
    spire: Math.max(0, Math.min(6, Math.round(num(raw.spire)))),
    text: String(raw.text ?? ''),
    attack: Math.max(0, num(raw.attack)),
    health: Math.max(0, num(raw.health)),
    showAttack: raw.showAttack === undefined ? isCharacter : raw.showAttack !== false,
    showHealth: raw.showHealth === undefined ? isCharacter || type === HERO_TYPE : raw.showHealth !== false,
    showSpire: raw.showSpire === undefined ? !AUTO_HIDE_SPIRE_TYPES.has(type) : raw.showSpire !== false,
    fullArt: raw.fullArt === true,
    unique: raw.unique === true,
    image: typeof raw.image === 'string' && raw.image ? raw.image : undefined,
  };
}

export const DECK_FILE_FORMAT = 'gwendalavirs-battle-deck';

/** Lit un fichier deck exporté par le deckbuilder (« Exporter pour le jeu »). */
export function parseDeckFile(json: unknown): DeckList {
  const data = json as { format?: string; name?: string; hero?: unknown; cards?: unknown };
  if (!data || data.format !== DECK_FILE_FORMAT) throw new Error("Ce fichier n'est pas un deck exporté par le deckbuilder.");
  if (!Array.isArray(data.cards)) throw new Error('Le fichier ne contient aucune carte.');
  const cards = data.cards
    .filter((entry): entry is { card: Record<string, unknown>; quantity: number } => !!entry && typeof entry === 'object' && 'card' in entry)
    .map(entry => ({ card: normalizeCard(entry.card), quantity: Math.max(0, Math.round(num(entry.quantity, 1))) }))
    .filter(entry => entry.quantity > 0);
  return {
    name: String(data.name || 'Deck importé'),
    hero: data.hero && typeof data.hero === 'object' ? normalizeCard(data.hero as Record<string, unknown>) : null,
    cards,
  };
}

export function deckSize(deck: DeckList): number {
  return deck.cards.reduce((n, entry) => n + entry.quantity, 0);
}
