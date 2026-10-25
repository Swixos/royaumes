# ADR-0022 - Tutoriel en quêtes récompensées, guidé par une conseillère et une lumière sur l'interface

- Statut : accepté
- Date : 2026-10-25

## Contexte

Un nouveau joueur découvrait seul sept bâtiments, quatre modules et des règles de combat.
Grepolis accueille ses joueurs par un tutoriel : une conseillère présente le jeu, puis
confie une suite de quêtes, chacune payée en ressources, en montrant à l'écran où toucher.

## Décision

Un module `tutorial` porte le tutoriel :

- **Les quêtes** (`domain/quests.ts`) forment une chaîne de quinze quêtes en quatre
  chapitres : les fondations (scierie, carrière, entrepôt, Sénat, mine), le royaume (marché,
  donjon), la mer (posture, raid pirate, victoire navale) et la défense (Sénat 3, rempart,
  scierie 3, chantier naval). Chaque quête a un but, un conseil et une récompense.
- **La progression** est lue dans le langage publié du Village, de la Flotte, du Marché et
  du Donjon par une projection. Un bâtiment compte une fois son chantier terminé ; commandé
  mais inachevé, il est « en cours ».
- **Le tutoriel** du joueur est un agrégat de son propre flux (`tutorial-<joueur>`) :
  démarrage, mise en pause du guide, et récompenses réclamées. Seule la quête en cours peut
  être réclamée, une seule fois, et seulement si son but est atteint. La récompense est
  versée par un message `realm.deposit` enregistré avec l'événement `QuestRewarded`, dans la
  même transaction : elle ne peut être ni perdue ni payée deux fois.
- **L'interface** ajoute une introduction en cinq pages par la conseillère Ysolde, une carte
  de la quête en cours sur le village, et une fenêtre « Quêtes » qui liste les chapitres.
  Les éléments utiles de l'interface portent un attribut `data-guide` ; pour chaque quête,
  le guide connaît les étapes à suivre (ouvrir un menu, toucher un bâtiment, lancer le
  chantier) et éclaire la plus avancée qui est visible et non recouverte. Une étape plus bas
  dans une fenêtre y est amenée par défilement ; une île hors de la carte est annoncée par un
  conseil au centre de l'écran.

Le guide peut être mis en pause et repris depuis la fenêtre « Quêtes », et l'introduction
revue à tout moment.

## Conséquences

### Positives

- Le joueur apprend le jeu en jouant, et les récompenses accélèrent son début de partie.
- Les quêtes reconnaissent aussi ce que le joueur a fait avant d'ouvrir le tutoriel.
- Le guide ne bloque jamais l'interface : la lumière laisse passer chaque toucher.

### Négatives

- Les attributs `data-guide` lient l'interface des modules aux étapes du tutoriel : un
  bouton renommé ou déplacé doit garder son attribut.
- Le guide observe l'écran à intervalle régulier pour suivre l'élément éclairé.

## Alternatives écartées

- **Un tutoriel sans serveur, mémorisé dans le navigateur** : ni récompense sûre, ni suivi
  d'un appareil à l'autre.
- **Des étapes qui bloquent l'écran** : plus directives, mais pénibles pour un joueur qui
  connaît déjà le jeu.

## Usage de l'IA générative

