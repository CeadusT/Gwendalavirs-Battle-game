import { memo, type CSSProperties } from 'react';
import type { CardDef } from '../engine/types';
import { COLORS, PLACEHOLDER_HILLS, RARITY_COLORS, cardPalette, nameSizeEm, sanitizeRichText } from './cardStyle';

export interface CardStats {
  attack: number;
  health: number;
  /** PV de départ : sert à colorer les PV en rouge quand la carte est blessée. */
  baseHealth?: number;
  baseAttack?: number;
}

interface Props {
  def: CardDef;
  /** Largeur de la carte en px (tout le reste suit). */
  size: number;
  /** Statistiques actuelles en partie (sinon celles de la carte). */
  stats?: CardStats;
  className?: string;
}

const AttackIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="gw-statIcon"><path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" /></svg>
);
const HealthIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="gw-statIcon"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
);

const statClass = (value: number, base: number | undefined) =>
  base === undefined || value === base ? '' : value < base ? ' is-lower' : ' is-higher';

/** Une carte au format de la charte graphique (style normal ou full art). */
export const CardView = memo(function CardView({ def, size, stats, className = '' }: Props) {
  const pal = cardPalette(def);
  const isHero = def.type === 'Héros';
  const element = COLORS[def.color] ?? COLORS.Gris;
  const vars = {
    '--size': `${size}px`, '--el': pal.el, '--el-light': pal.light, '--el-tint': pal.tint,
    '--sky-top': pal.skyTop, '--sky-bottom': pal.skyBottom,
  } as CSSProperties;
  const attack = stats?.attack ?? def.attack;
  const health = stats?.health ?? def.health;

  return (
    <div className={`card ${size < 170 ? 'card--small ' : ''}${className}`} style={vars}>
      <div className={`gw ${def.fullArt ? 'gw--full' : 'gw--normal'}${isHero ? ' gw--hero' : ''}`}>
        <div className="gw-body">
          <div className="gw-art" style={def.image ? { backgroundImage: `url("${def.image.replace(/["\\\n\r]/g, '')}")` } : undefined}>
            {!def.image && (
              <svg className="gw-placeholder" viewBox="0 0 300 250" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
                <circle cx="214" cy="92" r="24" fill={pal.sun} opacity=".85" />
                <path d={PLACEHOLDER_HILLS[0]} fill={pal.hillFar} />
                <path d={PLACEHOLDER_HILLS[1]} fill={pal.hillMid} />
                <path d={PLACEHOLDER_HILLS[2]} fill={pal.hillNear} />
              </svg>
            )}
          </div>
          <div className="gw-shade" aria-hidden="true" />
          <div className="gw-head">
            {def.showSpire && <div className="gw-cost" title="Coût en Volonté">{def.spire}</div>}
            <h3 className="gw-name" style={{ fontSize: `max(var(--card-name-min,0px),${nameSizeEm(def.name, def.fullArt)}em)` }}>{def.name}</h3>
            {!isHero && (
              <div className="gw-el" title={`Élément ${element.element}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d={element.icon} /></svg>
              </div>
            )}
          </div>
          <div className="gw-rules">
            <div className="gw-type">
              <span className="gw-typeName">{def.type}</span>
              {def.subtype && <><span className="gw-sep">·</span><span className="gw-subtype">{def.subtype}</span></>}
              <span className="gw-rarity" style={{ background: RARITY_COLORS[def.rarity] ?? RARITY_COLORS.Commun }} title={`Rareté ${def.rarity}`} />
            </div>
            <div className="gw-text" dangerouslySetInnerHTML={{ __html: sanitizeRichText(def.text) }} />
          </div>
          <div className="gw-foot">
            <span className="gw-set">{def.set}</span>
            {(def.showAttack || def.showHealth) && (
              <span className="gw-stats">
                {def.showAttack && <span className={`gw-stat gw-stat--attack${statClass(attack, stats?.baseAttack)}`} title="Attaque"><AttackIcon />{attack}</span>}
                {def.showAttack && def.showHealth && <i className="gw-statSep" aria-hidden="true" />}
                {def.showHealth && <span className={`gw-stat gw-stat--health${statClass(health, stats?.baseHealth)}`} title="Points de vie"><HealthIcon />{health}</span>}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

/** Dos de carte (deck, main adverse). */
export function CardBack({ size, className = '' }: { size: number; className?: string }) {
  return (
    <div className={`card card-back ${className}`} style={{ '--size': `${size}px` } as CSSProperties}>
      <div className="card-backInner"><span>GB</span></div>
    </div>
  );
}
