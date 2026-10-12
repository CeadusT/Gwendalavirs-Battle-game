import { useState } from 'react';
import { createGame } from './engine/game';
import { randomSeed } from './engine/rng';
import type { DeckList, GameState } from './engine/types';
import { Menu, type MatchSetup } from './ui/Menu';
import { GameScreen } from './ui/GameScreen';

export function App() {
  const [setup, setSetup] = useState<MatchSetup | null>(null);
  const [game, setGame] = useState<GameState | null>(null);

  const start = (s: MatchSetup) => {
    setSetup(s);
    const decks: [DeckList, DeckList] = [s.players[0].deck, s.players[1].deck];
    setGame(createGame({ decks, names: [s.players[0].name, s.players[1].name], seed: randomSeed(), firstPlayer: Math.random() < 0.5 ? 0 : 1 }));
  };

  if (!setup || !game) return <Menu initial={setup} onStart={start} />;
  return <GameScreen key={game.rng + ':' + game.players[0].name} initial={game} hotseat={setup.hotseat} onRematch={() => start(setup)} onQuit={() => setGame(null)} />;
}
