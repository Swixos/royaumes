# ADR-0016 - Scène du village dessinée avec PixiJS, à côté des contrôles de la page

- Statut : accepté
- Date : 2026-10-23

## Contexte

L'écran du village se limitait à une liste de bâtiments et de boutons. Un jeu de stratégie
de ce genre montre la ville elle-même : les bâtiments à leur niveau, le relief qui les
nourrit, et la vie du village. Une telle scène compte plusieurs centaines d'éléments animés
(vagues, arbres, fumées, villageois), ce que le DOM et le SVG rendent mal à soixante images
par seconde. Le projet ne dispose d'aucune illustration dessinée à la main, et l'écran doit
rester utilisable au clavier et par un lecteur d'écran. Le rendu serveur de Next.js ne
connaît pas le canvas.

## Décision

La scène du village est rendue par PixiJS 8, en WebGL, dans le module Village
(`src/modules/realm/scene/`). Elle est découpée en trois parties :

- `layout.ts`, sans dépendance graphique, décide de ce que la scène montre : contour de l'île,
  place des bâtiments, routes, arbres placés par un générateur à graine, et palier de taille
  de chaque bâtiment selon son niveau. Ces règles sont testées par Vitest, sans navigateur ;
- `draw.ts` dessine chaque élément en formes vectorielles, dans la direction artistique du
  jeu : aplats, contour sombre, lumière venant de la gauche, aucun dégradé ni image ;
- `village-scene.ts` assemble la scène, l'anime et rappelle l'écran quand le joueur choisit
  un bâtiment. Elle ne connaît ni l'API ni les règles du jeu : elle montre l'état reçu.

PixiJS n'est chargé qu'au montage du composant, par un import dynamique, donc hors du rendu
serveur et du premier paquet envoyé. Le canvas est une image pour les technologies
d'assistance, décrite par son texte alternatif ; chaque action de la scène existe aussi en
contrôle de la page (sélection d'un bâtiment, construction, amélioration). Les animations
d'ambiance s'arrêtent quand le système demande moins de mouvements.

## Conséquences

### Positives

- Le joueur voit son village grandir : chaque bâtiment change d'allure tous les trois niveaux,
  l'hôtel de ville se dote de tours, puis d'une palissade et d'un rempart.
- Les règles de la scène sont testées sans navigateur, et la scène reste remplaçable sans
  toucher au domaine ni à l'API.
- Les dessins vectoriels suivent la direction artistique sans fichier d'image à produire ni à
  créditer.

### Négatives

- PixiJS ajoute une dépendance lourde, chargée seulement sur l'écran du village.
- Le rendu du canvas n'est pas couvert par les tests automatisés : il est vérifié à l'œil, par
  des captures d'écran.
- Les dessins vectoriels limitent la finesse du rendu par rapport à des illustrations
  peintes.

## Alternatives écartées

- **Scène en SVG rendue par React** : chaque élément animé deviendrait un nœud du DOM, et
  plusieurs centaines d'éléments mis à jour à chaque image saturent le navigateur.
- **Moteur de jeu complet (Phaser)** : il apporte physique, scènes et chargeur de ressources
  dont l'écran n'a pas besoin, pour un poids supérieur.
- **Canvas 2D écrit à la main** : il faudrait recoder la gestion des événements de pointeur,
  l'ordre d'affichage et la mise à l'échelle que PixiJS fournit.
- **Illustrations peintes en sprites** : aucune n'existe pour le projet, et un pack générique
  ne suivrait pas la direction artistique.

## Réexamen

Si des illustrations peintes sont produites, `draw.ts` peut être remplacé par des sprites sans
changer `layout.ts` ni l'écran.

## Usage de l'IA générative

