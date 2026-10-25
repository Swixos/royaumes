# ADR-0019 - Un seul écran de jeu : le village dans la mise en page, les pages en fenêtres

- Statut : accepté
- Date : 2026-10-25

## Contexte

Chaque module avait sa page : passer du village au marché remplaçait tout l'écran, et la
scène du village était reconstruite à chaque retour. Un jeu de stratégie comme Grepolis tient
sur un seul écran : la ville reste affichée, et chaque menu ouvre une fenêtre par-dessus. Les
adresses des pages servent pourtant au lien direct, à l'historique du navigateur et aux tests
de bout en bout.

## Décision

La mise en page du groupe `(jeu)` dessine le village une seule fois, sous toutes les pages.
Une mise en page de Next.js n'est pas reconstruite d'une page à l'autre du même groupe : le
village et sa scène PixiJS restent en place. Chaque page (`/fleet`, `/market`, `/tavern`,
`/dungeon`, `/ranking`, `/account`) affiche son contenu dans une fenêtre (`GameWindow`) posée
sur le village ; `/village` n'en ouvre aucune. Fermer une fenêtre, par son bouton, par
Échap ou en touchant le fond, ramène à `/village`.

Tant qu'une fenêtre est ouverte, le village est rendu inerte (`inert`) : le clavier et les
lecteurs d'écran restent dans la fenêtre, et la scène du village se met en pause pour
épargner l'appareil. Un bâtiment touché dans la scène ou dans la barre des bâtiments ouvre sa
fiche dans une fenêtre plus étroite ; la fiche du Sénat présente le plan de construction de
tout le village. Sur un téléphone, les fenêtres prennent tout l'écran entre la barre du haut
et le menu.

## Conséquences

### Positives

- Le joueur ne quitte jamais son village : il reste visible derrière chaque fenêtre.
- Chaque fenêtre garde son adresse : lien direct, historique et tests restent valables.
- La scène du village n'est créée qu'une fois par visite.

### Négatives

- Le village est chargé sur toutes les pages du jeu, même ouvertes en lien direct.
- Deux scènes PixiJS coexistent sur l'écran de la Flotte ; celle du village est en pause.

## Alternatives écartées

- **Fenêtres sans adresse, ouvertes par un état React** : le bouton retour du navigateur et
  le lien direct vers un module seraient perdus, et les tests de bout en bout devraient être
  réécrits.
- **Routes parallèles et interceptées de Next.js** : elles conviennent à une fenêtre au-dessus
  d'une liste, mais compliquent le cas où chaque page est une fenêtre et la page d'accueil
  n'en a aucune.

## Usage de l'IA générative

