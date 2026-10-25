# ADR-0020 - Village en perspective isométrique, sur une grille, avec une ville qui grandit

- Statut : accepté
- Date : 2026-10-25

## Contexte

La première scène du village (ADR 0016) posait sept bâtiments comme des icônes sur une grande
île vide. Chaque dessin avait sa propre perspective : bâtiments de trois quarts sous des
angles différents, montagne et arbres de face. Les routes partaient toutes du centre en
étoile, les arbres étaient semés au hasard, et les emplacements vides affichaient un panneau.
Le rendu manquait de cohérence et ne ressemblait pas à un vrai village.

## Décision

Toute la scène repose sur une grille au sol vue sous l'angle isométrique classique (une case
deux fois plus large que haute). Le plan (`layout.ts`) place chaque élément sur cette grille :

- une ville carrée entourée de son rempart, percée de quatre portes, avec une place, un puits,
  des étals et deux rues pavées en croix ;
- le Sénat et l'Entrepôt dans les murs, la porte principale (le bâtiment Rempart) face au port ;
- les producteurs sur leur ressource : la scierie à la lisière de la forêt, la carrière au pied
  de la falaise, la mine dans la montagne ; le chantier naval sur la plage ;
- des routes qui sortent des portes et suivent le terrain jusqu'aux bâtiments et au port ;
- des champs alignés sur la grille, et des bosquets plutôt que des arbres isolés.

Les dessins (`draw.ts`) sont construits à partir de volumes posés sur la grille : murs, toits à
deux pans, tours, rochers en gradins. La lumière vient d'en haut à gauche : la face gauche de
chaque volume est éclairée, la face droite est dans l'ombre, et l'ombre portée tombe en bas à
droite. Les contours sont fins et estompés.

Des lots de maisons sont calculés dans les murs, puis le long des routes. Le village compte
une maison de départ par bâtiment, plus une par niveau gagné : la ville se remplit depuis la
place, puis déborde en faubourgs. Les lots encore libres dans les murs sont des potagers. Un
bâtiment au niveau 0 montre ses fondations ; le rempart passe du talus à la palissade, puis à
la muraille de pierre.

Les étiquettes des bâtiments n'apparaissent qu'au survol, à la sélection, pendant un chantier
ou une fois le zoom avancé. Elles gardent la même taille à l'écran quel que soit le zoom. La
barre des bâtiments reste le moyen d'accès principal, au clavier comme au toucher.

## Conséquences

### Positives

- La scène est cohérente : une seule projection, une seule lumière, des proportions communes.
- La croissance du village se voit : maisons, faubourgs, rempart.
- Le plan reste sans dépendance au rendu : il est testé sans navigateur.

### Négatives

- Le tri en profondeur se fait sur l'ancre de chaque élément : un très grand volume peut, à un
  angle précis, passer devant un voisin qu'il devrait cacher.
- Les dessins vectoriels restent stylisés : un rendu peint demanderait des illustrations.

## Alternatives écartées

- **Planches de sprites isométriques libres de droits** : le rendu aurait été réaliste plus
  vite, mais au style d'un pack connu, et sans dessin propre à chaque niveau.
- **Grille de tuiles complète (sol en tuiles)** : plus lourde à rendre et à tester, pour un
  gain visuel faible sur une île vue de loin.

## Usage de l'IA générative

