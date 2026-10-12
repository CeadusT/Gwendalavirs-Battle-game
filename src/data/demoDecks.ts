/* ==========================================================================
   Decks de démonstration, pour lancer une partie sans rien importer.
   Les cartes reprennent celles fournies avec le deckbuilder, avec des
   statistiques provisoires pour pouvoir tester les combats.
   ========================================================================== */

import { normalizeCard } from '../engine/cards';
import type { CardDef, DeckList } from '../engine/types';

const SET = "D'un monde à l'autre";
const card = (raw: Partial<CardDef> & { id: string; name: string; type: string }) => normalizeCard({ set: SET, ...raw });

const C = {
  aelya: card({ id: 'base-0', name: 'Aelya, Passeuse des Mondes', type: 'Héros', color: 'Bleu', rarity: 'Légendaire', health: 20, text: 'Traverse les frontières entre les mondes.' }),
  myr: card({ id: 'base-1', name: 'Myr, l’Archiviste Voilée', type: 'Héros', color: 'Violet', rarity: 'Légendaire', health: 20, text: 'Conserve ce qui devrait être oublié.' }),
  croquis: card({ id: 'base-2', name: 'Croquis vagabond', type: 'Dessin de base', color: 'Marron', spire: 1, text: 'Un trait simple qui ouvre la voie.' }),
  sentinelle: card({ id: 'base-3', name: 'Sentinelle des lisières', type: 'Personnage', color: 'Vert', spire: 2, attack: 2, health: 3, text: 'Garde les passages du monde vivant.' }),
  trait: card({ id: 'base-4', name: 'Trait azur', type: 'Dessin avancé', color: 'Bleu', rarity: 'Rare', spire: 2, text: 'Une ligne précise chargée de puissance.' }),
  braise: card({ id: 'base-5', name: 'Braise calligraphiée', type: 'Objet', color: 'Rouge', rarity: 'Rare', spire: 1, text: 'L’encre brûle encore après avoir séché.' }),
  portrait: card({ id: 'base-6', name: 'Portrait de l’ombre', type: 'Personnage', color: 'Violet', spire: 3, attack: 3, health: 3, text: 'Son regard semble suivre le dessinateur.' }),
  encre: card({ id: 'base-7', name: 'Encre des fondations', type: 'Dessin de base', color: 'Marron', spire: 0, text: 'Tout commence par une première marque.' }),
  jardin: card({ id: 'base-8', name: 'Jardin suspendu', type: 'Objet', color: 'Vert', rarity: 'Rare', spire: 4, text: 'Une parcelle de vie arrachée au vide.' }),
  fracture: card({ id: 'base-9', name: 'Fracture vermillon', type: 'Dessin avancé', color: 'Rouge', rarity: 'Rare', spire: 4, text: 'Déchire la composition avant qu’elle ne se referme.' }),
  constellation: card({ id: 'base-10', name: 'Constellation impossible', type: 'Dessin légendaire', color: 'Bleu', rarity: 'Légendaire', spire: 5, text: 'Les étoiles refusent ici leur ordre habituel.' }),
  monolithe: card({ id: 'base-11', name: 'Monolithe de l’entre-monde', type: 'Dessin légendaire', color: 'Violet', rarity: 'Légendaire', spire: 6, text: 'Il se tient là où deux réalités se touchent.' }),
  // Personnages supplémentaires (démo uniquement) pour que les decks aient de quoi combattre.
  eclaireur: card({ id: 'demo-1', name: 'Éclaireur des marches', type: 'Personnage', color: 'Bleu', spire: 1, attack: 1, health: 2, text: 'Toujours le premier à franchir la frontière.' }),
  gardienne: card({ id: 'demo-2', name: 'Gardienne de l’archive', type: 'Personnage', color: 'Violet', spire: 3, attack: 3, health: 5, unique: true, text: '<b>Unique.</b> Rien ne sort sans son accord.' }),
  golem: card({ id: 'demo-3', name: 'Golem d’argile vive', type: 'Personnage', color: 'Marron', spire: 4, attack: 5, health: 5, text: 'Façonné d’un seul geste.' }),
  esquisse: card({ id: 'demo-4', name: 'Esquisse animée', type: 'Jeton', color: 'Gris', spire: 0, attack: 1, health: 1, text: '' }),
};

export const DEMO_DECKS: DeckList[] = [
  {
    name: 'Démo — Passeuse des Mondes',
    hero: C.aelya,
    cards: [
      { card: C.eclaireur, quantity: 3 }, { card: C.sentinelle, quantity: 3 }, { card: C.portrait, quantity: 2 },
      { card: C.golem, quantity: 2 }, { card: C.croquis, quantity: 3 }, { card: C.trait, quantity: 3 },
      { card: C.encre, quantity: 2 }, { card: C.braise, quantity: 2 }, { card: C.constellation, quantity: 1 },
      { card: C.esquisse, quantity: 3 },
    ],
  },
  {
    name: 'Démo — Archiviste Voilée',
    hero: C.myr,
    cards: [
      { card: C.eclaireur, quantity: 2 }, { card: C.portrait, quantity: 3 }, { card: C.gardienne, quantity: 3 },
      { card: C.sentinelle, quantity: 2 }, { card: C.croquis, quantity: 2 }, { card: C.fracture, quantity: 3 },
      { card: C.encre, quantity: 3 }, { card: C.jardin, quantity: 2 }, { card: C.monolithe, quantity: 1 },
      { card: C.esquisse, quantity: 3 },
    ],
  },
];
