# ADR-0015 - Droit de rectification du nom, par la réécriture ciblée du journal

- Statut : accepté
- Date : 2026-10-23

## Contexte

Le nom d'un joueur est recopié en de nombreux endroits : dans les événements du Donjon
(`GameCreated`, `PlayerJoined`), du Marché (`OfferPublished`, `OfferAccepted`) et de la Flotte
(`RaidLaunched`, et les avis des ports), et dans les tables de lecture de ces modules, du
Classement et de la Taverne. Le registre des traitements et la revue de conformité relèvent que
le droit de rectification (RGPD, article 16) n'est pas mis en œuvre (dette DT-013) : un joueur ne
peut pas corriger son nom.

L'ADR 0008 a introduit le seul mécanisme du projet qui modifie un événement enregistré : la
réécriture ciblée du journal pour l'effacement, où chaque module réécrit les événements qu'il
reconnaît, puis met à jour ses tables.

## Décision

La rectification du nom réutilise la réécriture ciblée du journal de l'ADR 0008, généralisée :

- le contrat `PersonalDataContributor` gagne deux opérations facultatives : `rename(event,
  playerId, name)`, qui réécrit un événement avec le nouveau nom, et `rectify(playerId, name,
  rewritten)`, qui met à jour les tables du module ;
- dans chaque module, l'effacement devient une rectification particulière, vers le nom neutre
  « Joueur effacé » : une même fonction (`renameInGame`, `renameInOffer`, `renameInFleet`) sert les
  deux droits ;
- le service des droits enchaîne, comme pour l'effacement, la réécriture du journal dans une
  transaction, puis la mise à jour des tables de chaque module, l'identité en dernier ;
- la route `PUT /api/account/name` est réservée au joueur connecté, qui ne rectifie que son propre
  nom ; le nom est validé (2 à 40 caractères, sans le nom neutre réservé aux comptes effacés).

Une rectification n'est pas inscrite au registre des effacements, et peut être relancée avec le
même nom sans effet. Le nom du village, choisi pour le village et non pour le joueur, n'est pas
concerné.

## Conséquences

### Positives

- Le nom est corrigé partout, y compris dans le passé : les rapports de bataille, les offres et
  les expéditions montrent le nouveau nom, et une reconstruction des projections donne le même
  résultat (test « donne le même classement après une reconstruction de la projection »).
- Aucun mécanisme nouveau de modification du journal : l'unique fonction qui modifie un événement
  reste celle du service des droits, et sa transaction couvre les deux droits.
- Un nouveau module n'a qu'à fournir `rename` pour que le droit de rectification le couvre.

### Négatives

- Un événement enregistré est modifié à chaque rectification, alors que le journal est en principe
  en ajout seul : un lecteur qui aurait recopié l'ancien événement ailleurs garde l'ancien nom.
- Une rectification parcourt tout le journal à la recherche de l'identifiant du joueur, comme un
  effacement : son coût croît avec le journal.
- Les messages déjà affichés en temps réel ne sont pas corrigés chez les autres joueurs connectés
  avant leur prochaine lecture.

## Alternatives écartées

- **Ne conserver que l'identifiant dans les événements, et lire le nom à l'affichage** : c'est la
  solution la plus propre, mais elle change le format des événements de trois modules et toutes
  leurs projections, et l'effacement de l'ADR 0008 devrait être repensé.
- **Considérer les noms recopiés comme un historique figé** : un nom mal orthographié resterait
  inexact dans les rapports et le classement, ce que l'article 16 ne permet pas.
- **Un événement « joueur renommé » lu par chaque projection** : les flux existants garderaient
  l'ancien nom, et l'état rejoué d'une offre ou d'une expédition le montrerait encore.

## Usage de l'IA générative

