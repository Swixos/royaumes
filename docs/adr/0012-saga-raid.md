# ADR-0012 - Saga du raid, avec compensation, et arrivée des flottes en échéance sans tâche de fond

- Statut : accepté
- Date : 2026-10-23

## Contexte

Un raid fait sortir des ressources d'un village et en fait entrer dans un autre, à des moments
séparés de plusieurs minutes : l'équipement est payé au départ, le butin est pris à l'arrivée.
Entre les deux, l'attaquant peut rappeler sa flotte, et le village visé peut disparaître, par
l'effacement de son propriétaire. Aucune ressource ne doit être créée ni perdue, quelle que soit
l'étape où survient une panne (ADR 0007).

L'arrivée d'une flotte est une échéance : la bataille doit avoir lieu à l'heure prévue, alors que
l'hébergement n'offre aucun processus permanent (ADR 0004), et qu'aucune requête n'est
garantie à cet instant.

## Décision

**Le raid est une saga orchestrée par la Flotte**, dont les étapes sont décidées par le domaine
(`domain/saga.ts`) et transformées en messages par le service :

1. le lancement prélève l'équipement dans le village de l'attaquant : c'est l'**étape
   compensable** ; un refus annule le raid, sans rien à compenser ;
2. une fois l'équipement prélevé, la flotte part : le défenseur est prévenu, et un message différé
   est programmé pour l'heure d'arrivée ;
3. à l'arrivée, la bataille est le **pivot** : elle est décidée une seule fois, à partir de la
   défense lue à cet instant ;
4. une victoire contre un village prélève le butin chez le défenseur ; un refus le réduit une fois
   à ce que le village possède, puis le prélève de nouveau ; le butin obtenu est versé à
   l'attaquant, par un dépôt repris jusqu'au succès.

La **compensation** rend l'équipement à l'attaquant, par un dépôt d'identifiant `<raid>:refund`,
dans deux cas : le rappel de la flotte avant son arrivée (règle 6), et la disparition du village
visé pendant la traversée (`RaidAborted`). Une défaite ne se compense pas : la flotte est perdue,
c'est la règle du jeu.

**L'arrivée est une échéance sans tâche de fond**, résolue par le premier des deux événements :

- la distribution du message différé `fleet.arrive`, disponible à l'heure d'arrivée ; avant
  cette heure, le raid refuse l'arrivée (`NOT_ARRIVED`) et le message est retenté ;
- la première lecture de la Flotte par l'un des deux joueurs après cette heure : la liste des
  raids, les cibles et la vue d'un raid résolvent d'abord les arrivées dues (`dueRaids`), comme le
  Donjon résout ses manches (ADR 0004).

Une arrivée déjà résolue est sans effet : le second des deux événements ne livre pas une seconde
bataille.

## Conséquences

### Positives

- Aucune ressource n'est créée ni perdue : chaque mouvement a un identifiant propre, et les tests
  d'API comparent les stocks à ceux d'un joueur témoin, qui ne fait que produire.
- Le rappel est une vraie décision de jeu, rendue possible par la compensation : le joueur qui lit
  la posture adverse peut renoncer sans rien perdre.
- La bataille a lieu à l'heure, même si aucun joueur n'est connecté, dès que la boîte d'envoi est
  distribuée ; et un joueur qui revient la voit résolue avant tout affichage.

### Négatives

- Sans aucune activité, ni lecture ni distribution, une bataille n'a lieu qu'à la tâche
  quotidienne : le résultat est juste, mais son heure d'enregistrement est tardive.
- La défense est lue à la résolution, et non à l'heure théorique d'arrivée : une amélioration
  faite entre les deux compte pour le défenseur.
- Le butin d'un village est pris en au plus deux prélèvements : si le village dépense ses
  ressources entre les deux, la flotte rentre sans rien.

## Alternatives écartées

- **Prélever le butin et verser l'équipement dans une même transaction** : elle toucherait deux
  villages et la Flotte, contre l'ADR 0007.
- **Compenser une défaite en rendant une partie de l'équipement** : la perte de la flotte est le
  risque qui donne son sens à la lecture de la posture adverse.
- **Lire le stock du défenseur pour demander exactement ce qu'il possède** : le stock change en
  continu par la production, et le Village n'expose aucune lecture de stock aux autres modules ;
  la réduction après refus utilise l'information que le Village donne déjà, les quantités
  manquantes.
- **Une tâche planifiée fréquente pour résoudre les arrivées** : l'offre de Vercel limite les
  tâches à une par jour (ADR 0004).
- **Résoudre l'arrivée uniquement à la lecture** : une bataille entre deux joueurs absents
  n'aurait jamais lieu ; le message différé la déclenche dès la distribution suivante.

## Réexamen

À réexaminer si un raid doit pouvoir être annulé après la bataille (retour de la flotte avec son
butin, interceptée en chemin), ce qui ajouterait une seconde échéance et une étape compensable.

## Usage de l'IA générative

