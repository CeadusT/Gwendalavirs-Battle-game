import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import type { Action, CardDef, GameState, PlayerIndex, Target } from '../engine/types';
import { applyAction, attackOf, canRiposte, cannotAttackReason, cannotImagineReason, cannotPlayReason, cannotUltimateReason, cardsToPay, categoryOf, defOf, healthOf, isAlly, other } from '../engine/game';
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
const IMAGINATION_SIZE = 96;
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
  // Étapes à plusieurs clics : paiement en Volonté, choix de réplique, tri de l'Imagination.
  const [paying, setPaying] = useState<{ uid: string; chosen: string[] } | null>(null);
  const [riposteAsk, setRiposteAsk] = useState<{ attacker: string; defender: string } | null>(null);
  const [trimImagination, setTrimImagination] = useState<string[] | null>(null);
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
    setPaying(null);
    if (state.players[state.active].imagination.length > RULES.imaginationLimit) return setTrimImagination([]);
    dispatch({ type: 'END_TURN' });
  }, [dispatch, state]);

  // Changement de joueur : on oublie la carte inspectée (elle pourrait venir de la main
  // de l'autre joueur) et l'attaquant sélectionné.
  useEffect(() => {
    setInspected(null);
    setSelected(null);
    setPaying(null);
  }, [state.active]);

  // La sélection d'attaquant n'a plus de sens si la carte a quitté le terrain.
  useEffect(() => {
    if (selected && state.cards[selected]?.zone !== 'board') setSelected(null);
  }, [selected, state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      else if (e.key === 'Escape') { setSelected(null); setMenu(null); setDiscardOf(null); setPaying(null); }
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
    // Le défenseur choisit de répliquer, s'il le peut.
    if (target.kind === 'card' && isAlly(state, target.uid) && canRiposte(state, target.uid)) {
      setRiposteAsk({ attacker: selected, defender: target.uid });
      return;
    }
    if (dispatch({ type: 'ATTACK', attacker: selected, target, riposte: false })) setSelected(null);
  };

  const answerRiposte = (riposte: boolean) => {
    if (!riposteAsk) return;
    dispatch({ type: 'ATTACK', attacker: riposteAsk.attacker, target: { kind: 'card', uid: riposteAsk.defender }, riposte });
    setRiposteAsk(null);
    setSelected(null);
  };

  /** Jouer une carte : si elle coûte des cartes de la main, on passe en mode paiement. */
  const startPlay = (uid: string) => {
    const reason = cannotPlayReason(state, uid);
    if (reason) return showToast(reason);
    if (cardsToPay(state, uid) === 0) dispatch({ type: 'PLAY_CARD', uid, payWith: [] });
    else setPaying({ uid, chosen: [] });
  };

  const togglePayment = (uid: string) => {
    if (!paying || uid === paying.uid) return;
    const chosen = paying.chosen.includes(uid) ? paying.chosen.filter(u => u !== uid) : [...paying.chosen, uid];
    if (chosen.length === cardsToPay(state, paying.uid)) {
      dispatch({ type: 'PLAY_CARD', uid: paying.uid, payWith: chosen });
      setPaying(null);
    } else setPaying({ ...paying, chosen });
  };

  const clickHandCard = (e: ReactMouseEvent, uid: string) => {
    if (paying) return togglePayment(uid);
    setSelected(null);
    const def = defOf(state, uid);
    if (categoryOf(def) !== 'drawing' || state.cards[uid].owner !== state.active) return startPlay(uid);
    // Un Dessin se lance, ou se pose en Zone Imagination pour faire bouger la spire.
    e.stopPropagation();
    const spire = state.players[state.active].spire;
    const playReason = cannotPlayReason(state, uid);
    const imagineReason = cannotImagineReason(state, uid);
    openMenu(e, [
      { label: def.name, header: true },
      { label: `Lancer (${def.spire} Volonté)`, action: () => startPlay(uid), disabled: !!playReason },
      { separator: true },
      { label: `Imagination : spire ${spire} → ${Math.min(RULES.spireMax, spire + 1)}`, action: () => dispatch({ type: 'IMAGINE', uid, direction: 1 }), disabled: !!imagineReason || spire >= RULES.spireMax },
      { label: `Imagination : spire ${spire} → ${Math.max(RULES.spireMin, spire - 1)}`, action: () => dispatch({ type: 'IMAGINE', uid, direction: -1 }), disabled: !!imagineReason || spire <= RULES.spireMin },
    ]);
  };

  const clickImaginationCard = (uid: string) => {
    if (paying) return showToast('Seules les cartes de ta main servent à payer.');
    setSelected(null);
    startPlay(uid);
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
      if (categoryOf(def) === 'ally') {
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
    if (card.zone !== 'imagination') items.push({ label: 'Poser en Imagination (sans bouger la spire)', action: () => dispatch({ type: 'MOVE', uid, to: 'imagination' }) });
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
      { label: 'Spire +1', action: () => dispatch({ type: 'ADJUST', target: t, stat: 'spire', delta: 1 }) },
      { label: 'Spire −1', action: () => dispatch({ type: 'ADJUST', target: t, stat: 'spire', delta: -1 }) },
      { label: 'Générer 1 Volonté', action: () => dispatch({ type: 'ADJUST', target: t, stat: 'will', delta: 1 }) },
      { label: 'Retirer 1 Volonté générée', action: () => dispatch({ type: 'ADJUST', target: t, stat: 'will', delta: -1 }), disabled: state.players[player].will === 0 },
      { label: 'Piocher une carte', action: () => dispatch({ type: 'DRAW', player }) },
      { separator: true },
      { label: 'Abandonner la partie', danger: true, action: () => dispatch({ type: 'CONCEDE', player }) },
    ]);
  };

  /* ---------- Affichage ---------- */

  const bottom = viewer;
  const top = other(viewer);
  const attackableTargets = useMemo(() => new Set(selected ? state.players[other(state.active)].board.filter(uid => isAlly(state, uid)) : []), [selected, state]);

  const renderImagination = (player: PlayerIndex) => (
    <div className="imagination" title={`Zone Imagination : ${RULES.imaginationLimit} cartes gardées en fin de tour`}>
      <span className="zone-label">Imagination</span>
      <div className="imagination-cards">
        {state.players[player].imagination.length === 0 && <span className="imagination-empty">Vide</span>}
        {state.players[player].imagination.map(uid => {
          const playable = player === state.active && !cannotPlayReason(state, uid);
          const waiting = state.cards[uid].enteredOnTurn === state.turn && player === state.active;
          return (
            <button key={uid} className={`imagination-card ${playable ? 'is-playable' : ''} ${waiting ? 'is-waiting' : ''}`}
              title={waiting ? 'Posée ce tour-ci : jouable au prochain tour' : undefined}
              onClick={() => player === state.active && clickImaginationCard(uid)} onContextMenu={e => cardMenu(e, uid)} onMouseEnter={() => inspect(uid)}>
              <CardView def={defOf(state, uid)} size={IMAGINATION_SIZE} />
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderBoard = (player: PlayerIndex) => (
    <div className={`board-row ${player === bottom ? 'is-mine' : 'is-theirs'}`}>
      {renderImagination(player)}
      <span className="board-count" title="Alliés sur le terrain">Alliés {state.players[player].board.filter(uid => isAlly(state, uid)).length}/{RULES.maxAllies}</span>
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
        <div className="spire" title={`Spire ${p.spire} — ultimate à la spire ${RULES.ultimateSpire}`}>
          <span className="spire-label">Spire</span>
          <span className="spire-track">
            {Array.from({ length: RULES.spireMax - RULES.spireMin + 1 }, (_, i) => RULES.spireMin + i).map(level => (
              <i key={level} className={`${level === p.spire ? 'is-current' : ''} ${level < p.spire ? 'is-passed' : ''} ${level === RULES.ultimateSpire ? 'is-ultimate' : ''}`}>{level}</i>
            ))}
          </span>
          {player === state.active && (
            <button className="btn btn-small btn-ultimate" disabled={!!cannotUltimateReason(state, player)} title={cannotUltimateReason(state, player) ?? 'Lancer l’ultimate du Héros'}
              onClick={() => dispatch({ type: 'ULTIMATE', player })}>
              {p.ultimateUsed && RULES.ultimateOncePerGame ? 'Ultimate utilisé' : 'Ultimate'}
            </button>
          )}
        </div>
        {p.will > 0 && <div className="will-pool" title="Volonté générée par des effets, utilisable ce tour en plus des cartes de la main">+{p.will}<small>Volonté</small></div>}
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
              {paying
                ? `Paiement de ${defOf(state, paying.uid).name} : choisis encore ${cardsToPay(state, paying.uid) - paying.chosen.length} carte(s) de ta main à défausser.`
                : selected ? 'Choisis une cible : un Allié adverse ou le Héros adverse.' : 'Clique une carte de ta main pour la jouer, puis un de tes Alliés pour attaquer. Clic droit : outils.'}
            </span>
            {paying && <button className="btn btn-small" onClick={() => setPaying(null)}>Annuler le paiement</button>}
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
                const playable = !paying && bottom === state.active && (!cannotPlayReason(state, uid) || !cannotImagineReason(state, uid));
                const classes = [
                  'hand-card',
                  playable ? 'is-playable' : '',
                  paying?.uid === uid ? 'is-paying' : '',
                  paying && paying.uid !== uid ? 'is-payable' : '',
                  paying?.chosen.includes(uid) ? 'is-chosen' : '',
                ].join(' ');
                return (
                  <button key={uid} className={classes} onClick={e => clickHandCard(e, uid)} onContextMenu={e => cardMenu(e, uid)} onMouseEnter={() => inspect(uid)}>
                    <CardView def={defOf(state, uid)} size={HAND_SIZE} />
                  </button>
                );
              })}
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

      {riposteAsk && (
        <div className="overlay">
          <div className="dialog">
            <h2>{state.players[state.cards[riposteAsk.defender].owner].name}, tu es attaqué !</h2>
            <p className="dialog-hint">
              {defOf(state, riposteAsk.attacker).name} ({attackOf(state, riposteAsk.attacker)} ATK) attaque {defOf(state, riposteAsk.defender).name} ({attackOf(state, riposteAsk.defender)} ATK, {healthOf(state, riposteAsk.defender)} PV).
            </p>
            <div className="dialog-cards">
              <CardView def={defOf(state, riposteAsk.attacker)} size={150} stats={statsOf(riposteAsk.attacker)} />
              <span className="versus">→</span>
              <CardView def={defOf(state, riposteAsk.defender)} size={150} stats={statsOf(riposteAsk.defender)} />
            </div>
            <div className="dialog-buttons">
              <button className="btn" onClick={() => setRiposteAsk(null)}>Annuler l’attaque</button>
              <button className="btn" onClick={() => answerRiposte(false)}>Ne pas répliquer</button>
              <button className="btn btn-primary" onClick={() => answerRiposte(true)}>Répliquer</button>
            </div>
          </div>
        </div>
      )}

      {trimImagination && (
        <div className="overlay">
          <div className="dialog">
            <h2>Zone Imagination</h2>
            <p className="dialog-hint">Choisis les {RULES.imaginationLimit} cartes à garder, les autres seront défaussées.</p>
            <div className="dialog-cards">
              {state.players[state.active].imagination.map(uid => (
                <button key={uid} className={`hand-card ${trimImagination.includes(uid) ? 'is-chosen' : 'is-payable'}`} onMouseEnter={() => inspect(uid)}
                  onClick={() => setTrimImagination(k => (k!.includes(uid) ? k!.filter(u => u !== uid) : k!.length < RULES.imaginationLimit ? [...k!, uid] : k))}>
                  <CardView def={defOf(state, uid)} size={130} />
                </button>
              ))}
            </div>
            <div className="dialog-buttons">
              <button className="btn" onClick={() => setTrimImagination(null)}>Retour</button>
              <button className="btn btn-primary" disabled={trimImagination.length !== RULES.imaginationLimit}
                onClick={() => { dispatch({ type: 'END_TURN', keepImagination: trimImagination }); setTrimImagination(null); }}>Garder et finir le tour</button>
            </div>
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
