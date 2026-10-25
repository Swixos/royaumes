# ADR-0017 - Carte des mers dessinée avec PixiJS, et briques communes aux scènes du jeu

- Statut : accepté
- Date : 2026-10-25

## Contexte

La carte des mers de la Flotte était un dessin SVG rendu par React : îles en aplats,
routes et navires recalculés à chaque image tant qu'une flotte naviguait. Chaque image
provoquait un nouveau rendu du composant, et les îles se distinguaient seulement par leur
couleur. Le village est désormais une scène PixiJS (ADR 0016) : la carte des mers en
reprend le rendu, ce qui pose la question du code partagé entre les deux scènes. Les règles
de dépendance interdisent à un module d'importer le code interne d'un autre.

## Décision

La carte des mers est rendue par PixiJS dans le module Flotte (`src/modules/fleet/scene/`),
découpée comme la scène du village :

- `sea-layout.ts`, sans dépendance graphique : écartement des îles, contour de chaque île
  tiré de son identifiant, routes maritimes, avancée d'une flotte et temps restant. Ces
  règles sont testées par Vitest ;
- `sea-scene.ts` dessine les îles selon leur type (port du joueur avec son donjon, ports des
  autres joueurs, repaires pirates avec leurs rochers, palmiers et pavillon), anime les
  flottes sur leur route avec leur sillage et leur heure d'arrivée, et l'ambiance de la mer.
  La scène calcule l'avancée des flottes à chaque image : React ne rend plus la carte que
  lorsque les données changent.

Les îles restent des boutons de la page, posés sur le canvas : ils portent la sélection, le
clavier et les lecteurs d'écran, comme avant.

Les briques communes aux scènes vivent dans `src/ui/pixi/`, la couche d'interface partagée
qui ne dépend d'aucun module :

- `drawing.ts` : palette, maisons, arbres, drapeaux, navires, nuages, oiseaux et plaques ;
- `stage.ts` : création de l'application, mise à l'échelle du monde, réglage de réduction des
  animations, vagues ;
- `scene-host.tsx` : composant qui charge une scène au montage, la met à jour quand son état
  change et la détruit au démontage.

## Conséquences

### Positives

- Les deux scènes partagent la même direction artistique et le même code de mise en place.
- La carte des mers ne provoque plus de rendu React à chaque image.
- Les règles de la carte sont testées sans navigateur, comme celles du village.

### Négatives

- PixiJS est aussi chargé sur l'écran de la Flotte.
- Le rendu du canvas reste vérifié à l'œil, par des captures d'écran.

## Alternatives écartées

- **Garder la carte en SVG** : chaque image en mer reste un rendu React complet, et les îles
  ne peuvent pas recevoir de décor détaillé sans multiplier les nœuds du DOM.
- **Copier les dessins dans chaque module** : deux versions des mêmes dessins divergeraient à
  la première retouche.
- **Placer les dessins communs dans un module** : un module ne peut pas importer le code
  interne d'un autre ; la couche `src/ui` existe pour ce partage.

## Usage de l'IA générative

