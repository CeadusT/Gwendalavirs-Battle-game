/* ==========================================================================
   Lecture du texte des cartes : mots-clés et paliers de spire.

   Le texte d'une carte se découpe en sections :
     « Effet de base. Spire 3 — Éternel — Provocation - Défenseur »
   Seules les sections dont la condition de spire est remplie au moment où la
   carte est jouée s'appliquent (Spire X = exactement X, Basses Spires = 0 à 2,
   Hautes Spires = 3 à 6, Spire paire / impaire, Parfait = spire égale au coût).
   ========================================================================== */

import type { CardDef } from './types';

export const KEYWORDS = [
  'Fonceur', 'Provocation', 'Défenseur', 'Riposte', 'Vigueur', 'Robuste', 'Portée', 'Immunité au combat', 'Éternel',
] as const;
export type Keyword = (typeof KEYWORDS)[number];

export const KEYWORD_HELP: Record<Keyword, string> = {
  Fonceur: 'Peut attaquer dès son arrivée en jeu.',
  Provocation: 'Tant qu’elle est redressée, l’adversaire doit l’attaquer en premier.',
  Défenseur: 'Ne peut pas attaquer, mais peut répliquer.',
  Riposte: 'Réplique même quand elle est engagée.',
  Vigueur: 'Se redresse à la fin de votre tour.',
  Robuste: 'Chaque blessure subie est réduite de 1.',
  Portée: 'La cible ne peut pas répliquer.',
  'Immunité au combat': 'Ne subit aucune blessure en combat.',
  Éternel: 'Le Dessin reste en jeu.',
};

/* Texte brut, sans balises ni entités HTML. */
export function plainText(html: string): string {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, '\'')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ');
}

/* Rappels de règles à ignorer (« Fonceur : Peut attaquer… ») pour ne pas confondre
   la définition d'un mot-clé avec le mot-clé lui-même. */
const REMINDER = /(Fonceur|Vigueur|Robuste|Portée|Esquisse|Saboter|Brûlure de Spire)\s*[:—]\s*[^.\n]*\.?/g;

interface Section { test: (spire: number, cost: number, fromImagination: boolean) => boolean; text: string; perfect: boolean }

const MARKER = /(Basses Spires|Hautes Spires|Spire paire|Spire impaire|Spire\s+(\d)|\bParfait\b)/g;

function sections(text: string): { base: string; tiers: Section[] } {
  const clean = text.replace(REMINDER, ' ');
  const marks = [...clean.matchAll(MARKER)];
  const base = marks.length ? clean.slice(0, marks[0].index) : clean;
  const tiers = marks.map((m, i): Section => {
    const body = clean.slice(m.index! + m[0].length, i + 1 < marks.length ? marks[i + 1].index : undefined);
    const esquisse = /Esquisse/.test(body);
    const label = m[1];
    const cond = (spire: number, cost: number): boolean => {
      if (label === 'Basses Spires') return spire <= 2;
      if (label === 'Hautes Spires') return spire >= 3;
      if (label === 'Spire paire') return spire % 2 === 0;
      if (label === 'Spire impaire') return spire % 2 === 1;
      if (label === 'Parfait') return spire === cost;
      return spire === Number(m[2]);
    };
    return { test: (spire, cost, fromImagination) => cond(spire, cost) && (!esquisse || fromImagination), text: body, perfect: label === 'Parfait' };
  });
  return { base, tiers };
}

/** Le texte qui s'applique quand la carte est jouée à cette spire. */
export function activeText(def: CardDef, spire: number, fromImagination = false): { text: string; perfect: boolean; tier: boolean } {
  const { base, tiers } = sections(plainText(def.text));
  const active = tiers.filter(t => t.test(spire, def.spire, fromImagination));
  return {
    text: [base, ...active.map(t => t.text)].join('\n'),
    perfect: active.some(t => t.perfect),
    tier: active.length > 0,
  };
}

/** Mots-clés présents « en position de mot-clé » (début de section, après un tiret ou un point). */
export function keywordsIn(text: string): Keyword[] {
  const found = new Set<Keyword>();
  for (const k of KEYWORDS) {
    const name = k === 'Éternel' ? '[ÉE]ternel(?:le)?' : k.replace(/ /g, '\\s+');
    const re = new RegExp(`(?:^|\\n|[-—–•.]\\s*)\\s*${name}(?![\\p{L}])`, 'iu');
    if (re.test(text.trim()) || re.test(`\n${text.trim()}`)) found.add(k);
  }
  if (/devient [ÉE]ternel/i.test(text)) found.add('Éternel');
  return KEYWORDS.filter(k => found.has(k));
}

/** Mots-clés d'une carte jouée à cette spire (Parfait = ancien Éternel). */
export function cardKeywords(def: CardDef, spire: number, fromImagination = false): Keyword[] {
  const active = activeText(def, spire, fromImagination);
  const list = keywordsIn(active.text);
  if (active.perfect && !list.includes('Éternel')) list.push('Éternel');
  return list;
}

export const arrivesExhausted = (def: CardDef) => /Arrive engagée?/i.test(plainText(def.text));
export const isWeapon = (def: CardDef) => /Equipement Héroïque|Équipement Héroïque/i.test(def.subtype);
export const grantsHeroReach = (def: CardDef) => isWeapon(def) && /Portée/.test(plainText(def.text));

/** États déclenchés par un Dessin lancé. */
export function statusEffects(raw: string) {
  // Le texte entre guillemets décrit un effet donné à une autre carte : on l'ignore.
  const text = raw.replace(/"[^"]*"|«[^»]*»|“[^”]*”/g, ' ');
  return {
    surchauffe: /(^|[^\p{L}])Surchauffe/u.test(text) && !/Annule les effets de surchauffe/i.test(text),
    brulure: /Brûlure(?! de Spire)/.test(text),
    brulureSpire: /appliquez(?: lui)? Brûlure de Spire/i.test(text),
  };
}
