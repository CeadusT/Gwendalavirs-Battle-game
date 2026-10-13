# Gwendalavir’s Battle — logiciel de jeu

Application à installer (Windows, macOS, Linux) pour jouer à **Gwendalavir’s Battle**, le TCG.
Les decks se construisent dans le [deckbuilder](https://ceadust.github.io/Gwendalavirs-Battle/), puis s’importent ici.

Version actuelle : **0.2**.
- Partie locale à deux joueurs sur le même ordinateur.
- Règles de base du jeu ; les effets des cartes s’appliquent encore à la main (clic droit).

## Ce qui marche déjà

- **Menu** :
  - nom des joueurs ;
  - choix d’un deck (2 decks de démonstration fournis) ;
  - import de decks exportés par le deckbuilder (*Exporter → Logiciel de jeu (.json)*). Ils restent enregistrés d’une partie à l’autre.
- **Plateau** :
  - Héros et PV, échelle de spire (0 à 6), deck, défausse ;
  - Zone Imagination, main, terrain de chaque joueur ;
  - journal de la partie ;
  - grande carte au survol.
- **Jouer une carte** : la glisser sur son terrain (ou cliquer dessus). Si elle coûte de la Volonté, elle est posée face cachée, puis on clique les cartes de la main à défausser pour payer ; elle n’est révélée qu’une fois payée.
- **Dessin** : le glisser sur le terrain pour le lancer, ou dans la Zone Imagination pour faire monter ou descendre la spire d’un cran.
- **Attaquer** : glisser un de ses Alliés sur une cible (ou cliquer l’Allié puis la cible) (Allié adverse ou Héros adverse). Le défenseur choisit de répliquer ou non.
- **Ultimate** : bouton près de l’échelle de spire, actif à la spire 6 (la spire redescend ensuite à 0).
- **Bac à sable (clic droit)** sert à appliquer à la main les effets pas encore programmés :
  - dégâts, soins, ATK / PV ;
  - spire, Volonté générée ;
  - pioche ;
  - déplacer une carte ;
  - abandonner.
- **Annuler** la dernière action (bouton ou Ctrl+Z).
- **Écran « passe l’ordinateur »** entre les tours, pour ne pas voir la main de l’autre.

## Règles

Toutes les valeurs sont dans [`src/engine/rules.ts`](src/engine/rules.ts) : modifie-les, le jeu suit.

| Règle | Fonctionnement |
|---|---|
| Victoire | Faire tomber les PV du Héros adverse à 0 |
| Main | 5 cartes au départ. En fin de tour, on défausse toute sa main et on pioche 5 cartes |
| Début du tour | Toutes ses cartes se redressent |
| Volonté | Coût d’une carte : 1 Volonté = 1 autre carte de la main défaussée. La Volonté générée par des effets se dépense en premier |
| Spire | Échelle de 0 à 6 (Basses Spires 0-2, Hautes Spires 3-6). Poser un Dessin en Zone Imagination : +1 ou −1 au choix. « Spire X — » = bonus seulement exactement à la spire X |
| Zone Imagination | Visible. Une carte posée ne peut être jouée qu’à partir du tour suivant. En fin de tour, 2 cartes maximum (on choisit lesquelles garder) |
| Dessins | Lancés : effet, puis défausse. Le journal rappelle la spire au moment du lancement (bonus de spire parfaite) |
| Alliés | 3 maximum. Ne peuvent pas attaquer le tour où ils arrivent. Une attaque les incline. Un Allié incliné ne peut pas répliquer |
| Objets | 3 maximum. Ne combattent pas et ne peuvent pas être attaqués |
| Types de cartes | Allié / Personnage / Jeton = Allié ; Objet / Objet légendaire = Objet ; tous les Dessins = Dessin. Réglable dans `src/engine/rules.ts` (`TYPE_CATEGORY`) |
| Unique | Une carte « unique » (case du Card Studio, ou « Unique » dans le Sous-type) ne peut pas être deux fois sur le terrain du même joueur |
| Ultimate | Jouable à la spire 6, puis la spire redescend à 0 |
| Héros | Attaque dès qu’il a de l’ATK (armes « Equipement Héroïque » + bonus du tour). Une arme perd 1 durabilité (PV) par attaque et se brise à 0. Attaquer ou utiliser {T} engage le Héros |
| Boucliers | 1 bouclier absorbe 1 blessure faite au Héros ; ils restent d’un tour à l’autre |
| Dessins Éternels | Restent sur le terrain (= Monde réel). Avec des ATK/PV, ils comptent comme Alliés |
| Mots-clés | Fonceur, Provocation, Défenseur, Riposte, Vigueur, Robuste, Portée, Immunité au combat : lus sur la carte à la spire où elle est jouée, et appliqués automatiquement |
| Surchauffe | Pas de Dessin Feu (Rouge) à son prochain tour |
| Brûlure | L’adversaire ne peut pas se soigner à son prochain tour |
| Brûlure de Spire | Chaque carte jouée depuis l’Imagination inflige 1 blessure à son joueur |
| Dessins légendaires | Ne se lancent qu’à la spire 6, puis la spire redescend à 0 |

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
