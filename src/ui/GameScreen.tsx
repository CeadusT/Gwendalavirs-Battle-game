import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import type { Action, CardDef, GameState, PlayerIndex, Target } from '../engine/types';
import { applyAction, attackOf, behaviourOf, cannotAttackReason, cannotPlayReason, defOf, healthOf, other } from '../engine/game';
import { RULES } from '../engine/rules';
import { CardBack, CardView, type CardStats } from './CardView';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { COLORS } from './cardStyle';

interface Props {
  initial: GameState;
  hotseat: boolean;
  onRematch: () => void;
  onQuit: () => void;
}

const HAND_SIZE = 138;
const BOARD_SIZE = 124;
const INSPECT_SIZE = 300;
const HISTORY_LIMIT = 100;

export function GameScreen({ initial, hotseat, onRematch, onQuit }: Props) {
  const [history, setHistory] = useState<GameState[]>([initial]);
  const state = history[history.length - 1];
  const [selected, setSelected] = useState<string | null>(null);
  const [inspected, setInspected] = useState<{ def: CardDef; stats?: CardStats } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [discardOf, setDiscardOf] = useState<PlayerIndex | null>(null);
  // Le joueur actif est toujours en bas de l'écran. En mode « passe l'ordinateur »,
  // sa main reste cachée jusqu'au clic sur l'écran de passage.
  const [revealedFor, setRevealedFor] = useState<PlayerIndex | null>(null);
  const viewer = state.active;
  const handHidden = hotseat && revealedFor !== state.active && state.phase === 'playing';
  const toastTimer = useRef<number>(0);

  const showToast = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const dispatch = useCallback((action: Action) => {
    const result = applyAction(state, action);
    if (result.error) {
      showToast(result.error);
      return false;
    }
    setHistory(h => [...h.slice(-HISTORY_LIMIT), result.state]);
    return true;
  }, [state, showToast]);

  const undo = useCallback(() => {
    setHistory(h => (h.length > 1 ? h.slice(0, -1) : h));
    setSelected(null);
  }, []);

  const endTurn = useCallback(() => {
    if (state.phase !== 'playing') return;
    setSelected(null);
    dispatch({ type: 'END_TURN' });
  }, [dispatch, state.phase]);

  // Changement de joueur : on oublie la carte inspectée (elle pourrait venir de la main
  // de l'autre joueur) et l'attaquant sélectionné.
  useEffect(() => {
    setInspected(null);
    setSelected(null);
  }, [state.active]);

  // La sélection d'attaquant n'a plus de sens si la carte a quitté le terrain.
  useEffect(() => {
    if (selected && state.cards[selected]?.zone !== 'board') setSelected(null);
  }, [selected, state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      else if (e.key === 'Escape') { setSelected(null); setMenu(null); setDiscardOf(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  const statsOf = useCallback((uid: string): CardStats => {
    const def = defOf(state, uid);
    return { attack: attackOf(state, uid), health: healthOf(state, uid), baseAttack: def.attack, baseHealth: def.health };
  }, [state]);

  const inspect = (uid: string) => setInspected({ def: defOf(state, uid), stats: state.cards[uid].zone === 'board' ? statsOf(uid) : undefined });

  /* ---------- Clics ---------- */

  const attack = (target: Target) => {
    if (!selected) return;
    if (dispatch({ type: 'ATTACK', attacker: selected, target })) setSelected(null);
  };

  const clickHandCard = (uid: string) => {
    const reason = cannotPlayReason(state, uid);
    if (reason) return showToast(reason);
    dispatch({ type: 'PLAY_CARD', uid });
  };

  const clickBoardCard = (uid: string) => {
    const card = state.cards[uid];
    if (card.owner !== state.active) {
      if (selected) attack({ kind: 'card', uid });
      else showToast('Choisis d’abord une de tes cartes pour attaquer.');
      return;
    }
    if (selected === uid) return setSelected(null);
    const reason = cannotAttackReason(state, uid);
    if (reason) return showToast(reason);
    setSelected(uid);
  };

  const clickHero = (player: PlayerIndex) => {
    if (player !== state.active && selected) attack({ kind: 'hero', player });
  };

  /* ---------- Menu clic droit (bac à sable) ---------- */

  const openMenu = (e: ReactMouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const cardMenu = (e: ReactMouseEvent, uid: string) => {
    const card = state.cards[uid];
    const def = defOf(state, uid);
    const t: Target = { kind: 'card', uid };
    const items: MenuItem[] = [{ label: def.name, header: true }];
    if (card.zone === 'board') {
      if (behaviourOf(def) === 'unit') {
        items.push(
          { label: 'Infliger 1 dégât', action: () => dispatch({ type: 'ADJUST', target: t, stat: 'damage', delta: 1 }) },
          { label: 'Soigner 1 PV', action: () => dispatch({ type: 'ADJUST', target: t, stat: 'damage', delta: -1 }), disabled: card.damage === 0 },
          { label: '+1 PV max', action: () => dispatch({ type: 'ADJUST', target: t, stat: 'health', delta: 1 }) },
          { label: '−1 PV max', action: () => dispatch({ type: 'ADJUST', target: t, stat: 'health', delta: -1 }) },
          { label: '+1 ATK', action: () => dispatch({ type: 'ADJUST', target: t, stat: 'attack', delta: 1 }) },
          { label: '−1 ATK', action: () => dispatch({ type: 'ADJUST', target: t, stat: 'attack', delta: -1 }) },
          { separator: true },
        );
      }
    }
    if (card.zone !== 'hand') items.push({ label: 'Renvoyer en main', action: () => dispatch({ type: 'MOVE', uid, to: 'hand' }) });
    if (card.zone !== 'board') items.push({ label: 'Poser sur le terrain (gratuit)', action: () => dispatch({ type: 'MOVE', uid, to: 'board' }) });
    if (card.zone !== 'discard') items.push({ label: 'Défausser', action: () => dispatch({ type: 'MOVE', uid, to: 'discard' }) });
    items.push({ label: 'Remettre sur le deck', action: () => dispatch({ type: 'MOVE', uid, to: 'deck' }) });
    openMenu(e, items);
  };

  const heroMenu = (e: ReactMouseEvent, player: PlayerIndex) => {
    const t: Target = { kind: 'hero', player };
    openMenu(e, [
      { label: `Héros de ${state.players[player].name}`, header: true },
      { label: 'Infliger 1 dégât', action: () => dispatch({ type: 'ADJUST', target: t, stat: 'damage', delta: 1 }) },
      { label: 'Soigner 1 PV', action: () => dispatch({ type: 'ADJUST', target: t, stat: 'damage', delta: -1 }) },
      { label: '+1 Volonté', action: () => dispatch({ type: 'ADJUST', target: t, stat: 'will', delta: 1 }) },
      { label: '−1 Volonté', action: () => dispatch({ type: 'ADJUST', target: t, stat: 'will', delta: -1 }) },
      { label: 'Piocher une carte', action: () => dispatch({ type: 'DRAW', player }) },
      { separator: true },
      { label: 'Abandonner la partie', danger: true, action: () => dispatch({ type: 'CONCEDE', player }) },
    ]);
  };

  /* ---------- Affichage ---------- */

  const bottom = viewer;
  const top = other(viewer);
  const attackableTargets = useMemo(() => new Set(selected ? state.players[other(state.active)].board.filter(uid => behaviourOf(defOf(state, uid)) === 'unit') : []), [selected, state]);

  const renderBoard = (player: PlayerIndex) => (
    <div className={`board-row ${player === bottom ? 'is-mine' : 'is-theirs'}`}>
      {state.players[player].board.length === 0 && <span className="board-empty">Terrain vide</span>}
      {state.players[player].board.map(uid => {
        const card = state.cards[uid];
        const ready = card.owner === state.active && !cannotAttackReason(state, uid);
        const classes = [
          'board-card',
          ready ? 'is-ready' : '',
          card.exhausted ? 'is-exhausted' : '',
          selected === uid ? 'is-selected' : '',
          attackableTargets.has(uid) ? 'is-target' : '',
        ].join(' ');
        return (
          <button key={uid} className={classes} onClick={() => clickBoardCard(uid)} onContextMenu={e => cardMenu(e, uid)} onMouseEnter={() => inspect(uid)}>
            <CardView def={defOf(state, uid)} size={BOARD_SIZE} stats={statsOf(uid)} />
          </button>
        );
      })}
    </div>
  );

  const renderHero = (player: PlayerIndex) => {
    const p = state.players[player];
    const heroDef = p.heroDefId ? state.defs[p.heroDefId] : null;
    const isTarget = !!selected && player !== state.active;
    return (
      <div className={`hero ${player === state.active ? 'is-active' : ''} ${isTarget ? 'is-target' : ''}`}>
        <button className="hero-plate" onClick={() => clickHero(player)} onContextMenu={e => heroMenu(e, player)}
          onMouseEnter={() => heroDef && setInspected({ def: heroDef, stats: { attack: 0, health: p.heroHealth, baseHealth: p.heroMaxHealth } })}
          style={{ '--hero-el': (COLORS[heroDef?.color ?? 'Gris'] ?? COLORS.Gris).hex } as CSSProperties}>
          <span className="hero-name">{p.name}</span>
          <span className="hero-title">{heroDef?.name ?? 'Sans Héros'}</span>
          <span className={`hero-health ${p.heroHealth < p.heroMaxHealth ? 'is-hurt' : ''}`} title="Points de vie du Héros">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
            {p.heroHealth}
          </span>
        </button>
        <div className="hero-will" title={`Volonté : ${p.will} disponible sur ${p.maxWill}`}>
          <span className="hero-willValue">{p.will}<small>/{p.maxWill}</small></span>
          <span className="hero-willPips">
            {Array.from({ length: Math.max(p.maxWill, p.will) }, (_, i) => <i key={i} className={i < p.will ? 'on' : ''} />)}
          </span>
          <span className="hero-willLabel">Volonté</span>
        </div>
        <div className="piles">
          <div className="pile" title="Cartes restantes dans le deck">
            {p.deck.length ? <CardBack size={46} /> : <div className="pile-empty" />}
            <span>{p.deck.length}</span>
          </div>
          <button className="pile" title="Voir la défausse" onClick={() => setDiscardOf(player)}>
            {p.discard.length ? <CardView def={defOf(state, p.discard[p.discard.length - 1])} size={46} /> : <div className="pile-empty" />}
            <span>{p.discard.length}</span>
          </button>
        </div>
      </div>
    );
  };

  const winner = state.winner === null ? null : state.players[state.winner];

  return (
    <div className="game" onClick={() => setMenu(null)}>
      <main className="table">
        <section className="side side--top">
          {renderHero(top)}
          <div className="hand hand--theirs" aria-label="Main adverse">
            {state.players[top].hand.map(uid => <CardBack key={uid} size={64} />)}
          </div>
        </section>

        <section className="battlefield">
          {renderBoard(top)}
          <div className="midline">
            <span className="midline-turn">Tour {state.turn} — {state.players[state.active].name}</span>
            <span className="midline-hint">
              {selected ? 'Choisis une cible : une carte adverse ou le Héros adverse.' : 'Clique une carte de ta main pour la jouer, puis une de tes cartes pour attaquer.'}
            </span>
            <button className="btn btn-small" onClick={undo} disabled={history.length < 2} title="Annuler la dernière action (Ctrl+Z)">Annuler</button>
            <button className="btn btn-primary btn-endTurn" onClick={endTurn} disabled={state.phase !== 'playing'}>Fin du tour</button>
          </div>
          {renderBoard(bottom)}
        </section>

        <section className="side side--bottom">
          {renderHero(bottom)}
          <div className="hand hand--mine" aria-label="Ta main">
            {handHidden
              ? state.players[bottom].hand.map(uid => <CardBack key={uid} size={HAND_SIZE * 0.7} />)
              : state.players[bottom].hand.map(uid => {
                const playable = bottom === state.active && !cannotPlayReason(state, uid);
                return (
                  <button key={uid} className={`hand-card ${playable ? 'is-playable' : ''}`} onClick={() => clickHandCard(uid)} onContextMenu={e => cardMenu(e, uid)} onMouseEnter={() => inspect(uid)}>
                    <CardView def={defOf(state, uid)} size={HAND_SIZE} />
                  </button>
                );
              })}
            {state.players[bottom].hand.length >= RULES.maxHandSize && <span className="hand-full">Main pleine</span>}
          </div>
        </section>
      </main>

      <aside className="sidebar">
        <div className="inspect">
          {inspected ? <CardView def={inspected.def} size={INSPECT_SIZE} stats={inspected.stats} /> : <div className="inspect-empty">Survole une carte pour la voir en grand</div>}
        </div>
        <GameLog state={state} />
        <div className="sidebar-actions">
          <button className="btn btn-small" onClick={onQuit}>Quitter la partie</button>
        </div>
      </aside>

      {toast && <div className="toast" role="status">{toast}</div>}
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}

      {discardOf !== null && (
        <div className="overlay" onClick={() => setDiscardOf(null)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <h2>Défausse de {state.players[discardOf].name} ({state.players[discardOf].discard.length})</h2>
            <div className="dialog-cards">
              {state.players[discardOf].discard.length === 0 && <p>La défausse est vide.</p>}
              {state.players[discardOf].discard.slice().reverse().map(uid => (
                <button key={uid} className="hand-card" onContextMenu={e => cardMenu(e, uid)} onMouseEnter={() => inspect(uid)}>
                  <CardView def={defOf(state, uid)} size={130} />
                </button>
              ))}
            </div>
            <p className="dialog-hint">Clic droit sur une carte pour la récupérer.</p>
            <button className="btn" onClick={() => setDiscardOf(null)}>Fermer</button>
          </div>
        </div>
      )}

      {handHidden && (
        <div className="overlay overlay--pass">
          <div className="pass">
            <p>Au tour de</p>
            <h2>{state.players[state.active].name}</h2>
            <button className="btn btn-primary" onClick={() => setRevealedFor(state.active)}>Afficher ma main</button>
          </div>
        </div>
      )}

      {state.phase === 'over' && (
        <div className="overlay">
          <div className="dialog dialog--end">
            <h2>{winner ? `${winner.name} remporte la partie !` : 'Égalité'}</h2>
            <p>{state.log[state.log.length - 1]?.text}</p>
            <div className="dialog-buttons">
              <button className="btn" onClick={undo}>Annuler le dernier coup</button>
              <button className="btn" onClick={onQuit}>Retour au menu</button>
              <button className="btn btn-primary" onClick={onRematch}>Revanche</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GameLog({ state }: { state: GameState }) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [state.log.length]);
  return (
    <ol className="log" ref={list}>
      {state.log.map((entry, i) => (
        <li key={i} className={`log-${entry.kind} ${entry.player === null ? '' : `log-p${entry.player}`}`}>{entry.text}</li>
      ))}
    </ol>
  );
}
