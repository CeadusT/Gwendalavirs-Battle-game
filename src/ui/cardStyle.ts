/* Données visuelles des cartes, reprises du deckbuilder (js/data.js et js/cards.js)
   pour que les cartes aient exactement le même aspect dans le jeu. */

import type { CardDef } from '../engine/types';

export const COLORS: Record<string, { element: string; hex: string; icon: string }> = {
  Rouge: { element: 'Feu', hex: '#b5452f', icon: 'M12 3c.5 3.5-3.5 5-3.5 9a3.5 3.5 0 0 0 7 0c0-1.6-.8-2.8-1.5-3.6 2.2.7 4 2.9 4 5.6a6 6 0 0 1-12 0c0-5.2 5.4-6.8 6-11Z' },
  Bleu: { element: 'Eau', hex: '#2f6f9f', icon: 'M12 3s-6 6.8-6 11a6 6 0 0 0 12 0c0-4.2-6-11-6-11Z' },
  Vert: { element: 'Plante', hex: '#4f8a5b', icon: 'M20 4C11 4 6 8 5 17c7 1 12-3 15-13ZM5 19c3-5 7-8 12-11' },
  Violet: { element: 'Ombre', hex: '#6a4c93', icon: 'M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10Z' },
  Marron: { element: 'Terre', hex: '#8a6240', icon: 'M3 19 9 9l4 6 2-3 6 7H3Z' },
  Jaune: { element: 'Foudre', hex: '#c9a227', icon: 'M13 2 5 14h6l-1 8 8-12h-6l1-8Z' },
  Gris: { element: 'Neutre', hex: '#7d8288', icon: 'M12 4l7 8-7 8-7-8 7-8Z' },
};

export const RARITY_COLORS: Record<string, string> = { Commun: '#b9bec4', Rare: '#d8b25a', Légendaire: '#e07a3a' };

const PARCHMENT = '#efe6d2';

export function mixColor(a: string, b: string, t: number): string {
  const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const x = rgb(a);
  const y = rgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

export function cardPalette(c: CardDef) {
  const el = (COLORS[c.color] ?? COLORS.Gris).hex;
  return {
    el,
    light: mixColor(el, '#ffffff', 0.5),
    tint: mixColor(el, PARCHMENT, 0.8),
    skyTop: mixColor(el, '#06070c', 0.62),
    skyBottom: mixColor(el, '#f3e3c0', 0.38),
    sun: mixColor(el, '#fff3d6', 0.68),
    hillFar: mixColor(el, '#2a2f3a', 0.32),
    hillMid: mixColor(el, '#151821', 0.55),
    hillNear: mixColor(el, '#08090c', 0.78),
  };
}

export const PLACEHOLDER_HILLS = [
  'M0 168 L42 128 L84 150 L132 98 L182 140 L232 108 L300 150 L300 250 L0 250 Z',
  'M0 198 L62 158 L112 184 L162 148 L222 190 L272 164 L300 178 L300 250 L0 250 Z',
  'M0 224 L52 204 L122 220 L192 198 L252 216 L300 206 L300 250 L0 250 Z',
];

/** Taille du nom selon sa longueur, en em de la carte. */
export function nameSizeEm(name: string, fullArt: boolean): number {
  const n = name.length;
  const size = n > 26 ? 13 : n > 18 ? 14 : fullArt ? 17 : 15.5;
  return size / 16;
}

const RICH_TEXT_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'SPAN']);

/** Texte de carte : seuls gras / italique / souligné / retours à la ligne et la couleur
    des <span> sont conservés (même règle que le deckbuilder). */
export function sanitizeRichText(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = String(html ?? '').replace(/\n/g, '<br>');
  for (const el of Array.from(template.content.querySelectorAll('*'))) {
    if (el.tagName === 'FONT') {
      const span = document.createElement('span');
      span.style.color = el.getAttribute('color') ?? '';
      span.append(...Array.from(el.childNodes));
      el.replaceWith(span);
      continue;
    }
    if (!RICH_TEXT_TAGS.has(el.tagName)) {
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }
    const color = el instanceof HTMLElement && el.tagName === 'SPAN' ? el.style.color : '';
    for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
    if (color && el instanceof HTMLElement) el.style.color = color;
  }
  return template.innerHTML;
}
