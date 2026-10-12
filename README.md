# Gwendalavir’s Battle — logiciel de jeu

Application à installer (Windows, macOS, Linux) pour jouer à **Gwendalavir’s Battle**, le TCG.
Les decks se construisent dans le [deckbuilder](https://ceadust.github.io/Gwendalavirs-Battle/), puis s’importent ici.

Version actuelle : **0.1**, la base du logiciel.
- Partie locale à deux joueurs sur le même ordinateur.
- Les règles sont génériques, en attendant les vraies.

## Ce qui marche déjà

- **Menu** :
  - nom des joueurs ;
  - choix d’un deck (2 decks de démonstration fournis) ;
  - import de decks exportés par le deckbuilder (*Exporter → Logiciel de jeu (.json)*). Ils restent enregistrés d’une partie à l’autre.
- **Plateau** :
  - Héros et PV, Volonté (cristaux), deck, défausse ;
  - main, terrain de chaque joueur ;
  - journal de la partie ;
  - grande carte au survol.
- **Jouer** :
  - clic sur une carte de la main pour la jouer (elle coûte sa Volonté) ;
  - clic sur une de ses cartes, puis sur une cible (carte adverse ou Héros adverse) pour attaquer.
- **Bac à sable (clic droit)** sert à appliquer à la main les effets pas encore programmés :
  - dégâts, soins, ATK / PV ;
  - Volonté ;
  - pioche ;
  - déplacer une carte (main, terrain, défausse, deck) ;
  - abandonner.
- **Annuler** la dernière action (bouton ou Ctrl+Z).
- **Écran « passe l’ordinateur »** entre les tours, pour ne pas voir la main de l’autre.

## Règles provisoires

Toutes les valeurs sont dans [`src/engine/rules.ts`](src/engine/rules.ts) : modifie-les, le jeu suit.

| Règle | Valeur actuelle |
|---|---|
| Main de départ | 5 cartes (+1 pour le second joueur) |
| Volonté | 1 au premier tour, +1 par tour, maximum 10 |
| Pioche | 1 carte par tour (pas au tout premier tour) |
| Main maximale | 10 cartes : une carte piochée au-delà est défaussée |
| Terrain | 7 cartes maximum par joueur |
| Héros | PV de la carte Héros, ou 20 par défaut |
| Combat | Le défenseur riposte, une carte attaque une fois par tour, pas le tour où elle arrive |
| Deck vide | Fatigue : 1, puis 2, puis 3… dégâts au Héros |
| Victoire | Héros adverse à 0 PV (ou abandon) |

Ce que fait chaque Type de carte se règle dans le même fichier (`TYPE_BEHAVIOUR`) :
- **Personnage / Jeton** vont sur le terrain et combattent ;
- **Objet** va sur le terrain sans combattre ;
- **Dessins** : effet immédiat, puis défausse.

## Lancer le projet (développeurs)

Il faut [Node.js](https://nodejs.org) 22 ou plus.

```bash
npm install        # une seule fois
npm run dev        # ouvre l'application avec rechargement automatique
npm test           # tests du moteur de règles
npm run package    # crée l'installateur pour ton système dans release/
```

`npm run dev:web` ouvre la même interface dans un navigateur (http://localhost:5173), sans Electron.

### Installateurs automatiques

Le workflow GitHub [`.github/workflows/build.yml`](.github/workflows/build.yml) compile les installateurs Windows (`.exe`), macOS (`.dmg`) et Linux (`.AppImage`).
- **À la main :** onglet *Actions* → *Installateurs* → *Run workflow*. Les fichiers apparaissent en bas de la page du lancement.
- **Automatiquement :** quand un tag `v0.2.0` (etc.) est poussé. Les fichiers sont joints à la release.

Les installateurs ne sont pas signés :
- Windows affiche « Windows a protégé votre ordinateur » : *Informations complémentaires* → *Exécuter quand même*.
- macOS : clic droit → *Ouvrir*.

## Organisation du code

```
electron/             fenêtre de l'application (Electron), sécurisée : pas d'accès Node depuis l'interface
src/engine/           moteur de règles, indépendant de l'affichage
  rules.ts            réglages des règles
  types.ts            état d'une partie, actions
  game.ts             createGame() et applyAction(état, action) → nouvel état
  cards.ts            lecture des cartes et des fichiers deck
  rng.ts              hasard reproductible (même graine = même partie)
  game.test.ts        tests
src/ui/               interface React (menu, plateau, carte, menu clic droit)
src/data/             decks de démonstration, decks importés
src/styles/           styles ; card.css est une copie de la charte des cartes du deckbuilder
src/assets/fonts/     polices des cartes (SIL OFL)
```

Le moteur ne connaît pas l’affichage :
- il reçoit un état et une action, et renvoie un nouvel état ;
- c’est ce qui permettra d’ajouter plus tard le jeu en ligne (le serveur fera tourner le même moteur), une IA ou un replay.

Pour programmer l’effet d’une carte, il faudra ajouter une action dans `types.ts` et la traiter dans `game.ts`. Le bac à sable reste disponible pour tout le reste.

## Format du fichier deck

```json
{
  "format": "gwendalavirs-battle-deck",
  "version": 1,
  "name": "Mon deck",
  "hero": { "id": "base-0", "name": "…", "type": "Héros", "health": 20, "…": "…" },
  "cards": [{ "card": { "id": "base-3", "name": "…", "spire": 2, "attack": 2, "health": 3, "…": "…" }, "quantity": 3 }]
}
```

Chaque carte est copiée en entier dans le fichier, illustration comprise. Le jeu n’a donc pas besoin de la bibliothèque du deckbuilder.
