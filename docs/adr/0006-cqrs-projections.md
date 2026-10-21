# ADR-0006 - Modèles de lecture séparés du modèle d'écriture, tenus à jour par des projections rattrapées à la lecture

- Statut : accepté
- Date : 2026-10-21

## Contexte

Certaines lectures traversent les flux du journal : le classement des joueurs porte sur
tous les villages et toutes les expéditions, et la liste des expéditions ouvertes sur
toutes les expéditions jamais créées. Calculées par rejeu à chaque consultation, leur coût
croît avec l'historique du jeu, et non avec ce qui est présenté (dette DT-005).

L'hébergement ne permet aucun processus permanent : aucune tâche de fond ne peut surveiller
le journal pour tenir des tables à jour, et les tâches planifiées de l'offre retenue ne
s'exécutent qu'une fois par jour (ADR 0004).

Le journal attribue à chaque événement une position globale, croissante mais non continue :
une insertion refusée consomme une position, et deux insertions simultanées ne sont pas
nécessairement validées dans l'ordre de leurs positions (ADR 0002).

## Décision

Les lectures transversales s'appuient sur des modèles de lecture, placés dans le schéma
PostgreSQL de leur module (`ranking`, `dungeon`). Les décisions s'appuient toujours sur le
modèle d'écriture, le journal d'événements, qui reste la seule source de vérité.

Chaque modèle de lecture est tenu à jour par une projection, dont le point de reprise est
enregistré dans la table `platform.projections`. Le moteur des projections est une brique
de la plateforme (`src/platform/projection/`) ; chaque module ne fournit que sa fonction
d'application.

Une projection est rattrapée au moment de sa consultation, dans une seule transaction : les
tables et le point de reprise sont mis à jour ensemble, et le point de reprise est verrouillé
(`FOR UPDATE`) pendant toute la transaction.

Le rattrapage s'arrête devant une position manquante tant que l'événement qui la suit a été
enregistré il y a moins de cinq secondes ; au-delà, la position manquante est franchie.

Chaque projection porte une version. Une version plus élevée que celle qui a construit les
tables provoque leur reconstruction à partir du journal ; une version moins élevée interdit
toute écriture.

Le classement est annoncé aux navigateurs par un canal global et discret, qui suit les
événements de certains types dans tout le journal. L'API renvoie la position jusqu'à
laquelle le classement est à jour, et l'interface relit le classement jusqu'à ce que la
projection ait atteint la position annoncée.

## Conséquences

### Positives

- Le coût d'une consultation ne dépend plus de l'historique : il dépend des événements
  enregistrés depuis le dernier rattrapage, et de la taille de ce qui est présenté.
- Les modules qui écrivent ne savent rien des projections qui les lisent : le Village et le
  Donjon n'ont pas été modifiés pour alimenter le classement.
- De nouvelles informations peuvent être calculées pour le passé, sans migration de données :
  le meilleur butin a été obtenu pour des expéditions jouées avant qu'il soit imaginé.
- Aucune tâche de fond ni aucune opération manuelle n'est nécessaire, y compris après un
  déploiement qui change la version d'une projection.
- Un modèle de lecture peut être vidé puis reconstruit à tout moment sans perte
  d'information, ce qui rend toute erreur de projection réparable par une correction du code.
- Le moteur, écrit une fois dans la plateforme, sert à tous les modules : la liste des
  expéditions ouvertes a demandé moins de code que le classement.

### Négatives

- La cohérence est à terme : un modèle de lecture peut avoir quelques secondes de retard sur
  le journal, notamment devant une position manquante récente.
- La reconstruction a lieu pendant une consultation, dont la durée est limitée sur Vercel :
  elle deviendra impossible au-delà d'une certaine taille du journal.
- Après un retour à une version précédente de l'application, une projection dont la version
  avait été augmentée cesse d'avancer jusqu'au déploiement suivant.
- Le classement dépend du langage publié des autres modules : un événement modifié ou ajouté
  sans réexamen de ses lecteurs passe inaperçu, comme l'a montré la liste des expéditions
  ouvertes, qui ignorait les compagnons. dependency-cruiser ne voit pas cette dépendance.
- Une consultation peut écrire dans la base, et la première consultation qui suit une longue
  inactivité paie le rattrapage de tous les événements intermédiaires.

## Alternatives écartées

- **Mise à jour des modèles de lecture dans la commande, par le module qui écrit** : le
  Village et le Donjon devraient connaître toutes les projections qui dépendent d'eux, et
  chaque nouveau modèle de lecture obligerait à modifier les modules qui écrivent.
- **Tâche planifiée** : les tâches planifiées de l'offre retenue ne s'exécutent qu'une fois
  par jour, ce qui laisserait le classement en retard d'une journée.
- **Processus de fond abonné au journal** : l'hébergement ne permet aucun processus
  permanent, et un tel processus exigerait une infrastructure supplémentaire.
- **Vue matérialisée de PostgreSQL** : son rafraîchissement recalcule entièrement la vue à
  partir de tout le journal, ce qui reproduit le coût du rejeu à chaque mise à jour.
- **Maintien du calcul par rejeu** : le coût de chaque consultation continuerait de croître
  avec l'historique du jeu, ce qui est précisément la dette DT-005.

## Réexamen

Cette décision devra être réexaminée si la reconstruction d'une projection approche la durée
maximale d'exécution d'une fonction, si le nombre de consultations simultanées fait du verrou
du point de reprise un goulet d'étranglement, ou si une lecture doit être strictement à jour
avec le journal.

## Usage de l'IA générative

Aucun.
