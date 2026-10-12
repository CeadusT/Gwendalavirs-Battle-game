import { useRef, useState } from 'react';
import type { DeckList } from '../engine/types';
import { deckSize, parseDeckFile } from '../engine/cards';
import { DEMO_DECKS } from '../data/demoDecks';
import { loadImportedDecks, saveImportedDecks } from '../data/deckStore';
import { CardView } from './CardView';

export interface MatchSetup {
  players: [{ name: string; deck: DeckList }, { name: string; deck: DeckList }];
  /** Écran de passage entre les tours (deux joueurs sur le même ordinateur). */
  hotseat: boolean;
}

interface Props {
  initial: MatchSetup | null;
  onStart: (setup: MatchSetup) => void;
}

export function Menu({ initial, onStart }: Props) {
  const [imported, setImported] = useState<DeckList[]>(loadImportedDecks);
  const decks = [...DEMO_DECKS, ...imported];
  const indexOf = (deck?: DeckList) => Math.max(0, deck ? decks.findIndex(d => d.name === deck.name) : 0);
  const [names, setNames] = useState<[string, string]>([initial?.players[0].name ?? 'Joueur 1', initial?.players[1].name ?? 'Joueur 2']);
  const [choice, setChoice] = useState<[number, number]>([indexOf(initial?.players[0].deck), initial ? indexOf(initial.players[1].deck) : Math.min(1, decks.length - 1)]);
  const [hotseat, setHotseat] = useState(initial?.hotseat ?? true);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const added: DeckList[] = [];
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      try {
        added.push(parseDeckFile(JSON.parse(await file.text())));
      } catch (e) {
        errors.push(`${file.name} : ${e instanceof Error ? e.message : 'fichier illisible.'}`);
      }
    }
    const next = [...imported.filter(d => !added.some(a => a.name === d.name)), ...added];
    setImported(next);
    const storageError = added.length ? saveImportedDecks(next) : null;
    setMessage([added.length ? `${added.length} deck${added.length > 1 ? 's' : ''} importé${added.length > 1 ? 's' : ''}.` : '', ...errors, storageError ?? ''].filter(Boolean).join(' '));
    if (fileInput.current) fileInput.current.value = '';
  };

  const removeDeck = (index: number) => {
    const name = decks[index].name;
    const next = imported.filter(d => d.name !== name);
    setImported(next);
    saveImportedDecks(next);
    setChoice(c => c.map(i => (i === index ? 0 : i > index ? i - 1 : i)) as [number, number]);
  };

  const start = () => onStart({
    players: [{ name: names[0].trim() || 'Joueur 1', deck: decks[choice[0]] }, { name: names[1].trim() || 'Joueur 2', deck: decks[choice[1]] }],
    hotseat,
  });

  return (
    <div className="menu">
      <header className="menu-title">
        <h1>Gwendalavir’s Battle</h1>
        <p>Partie locale — deux joueurs sur le même ordinateur</p>
      </header>

      <div className="menu-players">
        {([0, 1] as const).map(p => {
          const deck = decks[choice[p]];
          return (
            <section className="menu-player" key={p}>
              <label className="field">
                <span>Nom du joueur {p + 1}</span>
                <input value={names[p]} maxLength={24} onChange={e => setNames(n => (p === 0 ? [e.target.value, n[1]] : [n[0], e.target.value]))} />
              </label>
              <label className="field">
                <span>Deck</span>
                <select value={choice[p]} onChange={e => setChoice(c => (p === 0 ? [Number(e.target.value), c[1]] : [c[0], Number(e.target.value)]))}>
                  {decks.map((d, i) => <option key={i} value={i}>{d.name}</option>)}
                </select>
              </label>
              <div className="menu-deck">
                {deck.hero ? <CardView def={deck.hero} size={150} /> : <div className="menu-noHero">Pas de Héros<br />({20} PV par défaut)</div>}
                <div className="menu-deckInfo">
                  <strong>{deck.name}</strong>
                  <span>{deckSize(deck)} cartes</span>
                  <span>{deck.hero ? `Héros : ${deck.hero.name}` : 'Aucun Héros'}</span>
                  {choice[p] >= DEMO_DECKS.length && <button className="link" onClick={() => removeDeck(choice[p])}>Retirer ce deck</button>}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="menu-actions">
        <label className="check">
          <input type="checkbox" checked={hotseat} onChange={e => setHotseat(e.target.checked)} />
          Cacher la main entre les tours (écran « passe l’ordinateur »)
        </label>
        <div className="menu-buttons">
          <button className="btn" onClick={() => fileInput.current?.click()}>Importer un deck (.json)</button>
          <button className="btn btn-primary" onClick={start}>Lancer la partie</button>
        </div>
        <input ref={fileInput} type="file" accept=".json,application/json" multiple hidden onChange={e => importFiles(e.target.files)} />
        {message && <p className="menu-message">{message}</p>}
        <p className="menu-hint">Les decks s’exportent depuis le deckbuilder avec le bouton « Exporter pour le jeu ».</p>
      </div>
    </div>
  );
}
