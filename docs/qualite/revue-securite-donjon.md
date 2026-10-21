# Revue de sécurité du Donjon : dissimulation d'informations et intégrité du jeu

- Date : 2026-10-20
- Périmètre : API du module Donjon, canal temps réel des expéditions, tirages au sort, compagnons et intelligence artificielle.
- Références : OWASP Top 10 (A01 Broken Access Control, A04 Insecure Design).

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| D1 | La vue d'une expédition ne contient ni la graine ni le contenu des salles non explorées | Test « ne transmet ni la graine ni le contenu des salles suivantes » | Le test réussit. La vue lue par un joueur non membre ne contient aucune clé `seed` ni `rooms` : seule la salle courante (`currentRoom`) est transmise. | Conforme |
| D2 | L'action choisie par un héros n'est connue que de son joueur jusqu'à la résolution de la manche | Tests « cache l'action choisie par les autres héros » et « ne révèle pas l'action d'un héros aux autres joueurs » ; outils de développement | Les deux tests réussissent. Après l'attaque d'Alice, l'écran de Bob affiche "prêt" sans l'action, et la vue renvoyée à Bob par l'API ne contient pas l'action d'Alice. Trois protections se complètent : la vue filtrée du domaine, l'API qui ne renvoie que cette vue, et le canal temps réel réservé aux membres et sans données. | Conforme |
| D3 | Le canal d'une expédition n'est accessible qu'à ses membres | Test « réserve le canal d'une expédition à ses membres (403) » | Le test réussit. Un joueur non membre reçoit aussi 403 sur la route de repli `/api/stream/dungeon-<id>/events`. | Conforme |
| D4 | Le canal d'une expédition ne transmet aucune donnée d'événement, ni par le flux, ni par la route de repli | Tests du bloc « Canal discret » et « signale l'action d'un héros sans la révéler » | Les tests réussissent. Pour un membre, la route de repli renvoie `ActionSubmitted` avec `"data":{}` : seuls le flux, la version et le type sont transmis. | Conforme |
| D5 | Un joueur ne peut agir qu'en son propre nom | Lecture de `api.ts` : aucune route n'accepte d'identifiant de joueur | Dans `api.ts`, toutes les commandes utilisent `c.var.userId` et `c.var.userName`, renseignés par `requireUser`. Aucun schéma de validation ni paramètre d'adresse ne contient d'identifiant de joueur. | Conforme |
| D6 | Seul l'hôte lance l'expédition, et seul le héros dont c'est le tour ouvre une porte | Tests « ne laisse que l'hôte lancer l'expédition » et « fait ouvrir les portes à tour de rôle » | Les tests réussissent : un autre joueur reçoit `NOT_HOST` (403), et un héros dont ce n'est pas le tour reçoit `NOT_YOUR_TURN` (409). | Conforme |
| D7 | Un joueur ne peut ni choisir ni prévoir le résultat d'un tirage au sort | Lecture de `dungeon-service.ts` : graine tirée par le serveur ; exigence D1 | Dans `dungeon-service.ts`, la graine est tirée par `crypto.getRandomValues` et l'identifiant par `crypto.randomUUID`, jamais lus dans la requête. La graine n'apparaît pas dans `view.ts` (D1) : elle ne peut pas être connue des joueurs. | Conforme |
| D8 | L'échéance d'une manche est appréciée par l'horloge du serveur | Commande d'échéance envoyée avant l'échéance | Pendant la manche 1, une commande d'échéance envoyée avant la fin du compte à rebours répond 200 avec la manche 1 inchangée et aucune manche résolue : le serveur n'a rien enregistré. | Conforme |
| D9 | Une action destinée à une manche déjà résolue est refusée | Test « refuse un choix pour une manche déjà résolue » | Le test réussit : l'action reçoit `ROUND_OVER`. | Conforme |
| D10 | Connaître l'adresse d'une expédition ne permet pas d'y agir sans en être membre | Action envoyée par un joueur qui n'est pas membre | Une action envoyée par un joueur non membre reçoit 403 `NOT_A_MEMBER`. Ce joueur peut en revanche consulter la vue de l'expédition : ce choix est volontaire, puisqu'il permet de rejoindre une expédition à partir de son adresse. La vue consultée ne contient que des informations publiques (ni graine, ni actions, ni salles suivantes), et l'identifiant, un UUID tiré au hasard, ne peut pas être deviné. | Risque accepté |
| D11 | Aucun joueur ne peut agir au nom d'un compagnon ni écouter le canal en son nom | Test « présente le compagnon comme prêt, et ne le compte pas parmi les membres » ; fonction `isMember` de `rules.ts` | Le test réussit : la vue lue sous l'identifiant d'un compagnon n'en fait pas un membre. Dans `rules.ts`, `isMember` exclut les compagnons, et `SubmitAction` refuse toute action destinée à un compagnon (`NOT_A_MEMBER`). La règle du canal repose sur `isMember` de la vue, qui exclut aussi les compagnons. L'identifiant du joueur provient toujours de la session (D5) : aucune requête ne peut se présenter comme un compagnon. | Conforme |
| D12 | L'intelligence artificielle ne transmet aux joueurs aucune information qu'ils n'auraient pas autrement | Lecture de `companion.ts` et `monster-strategies.ts` ; vue filtrée inchangée | Le compagnon décide sur la situation du début de la manche (héros et monstres debout), sans connaître les actions des joueurs. Les monstres, qui connaissent ces actions, s'exécutent sur le serveur, dans `resolveRound` : leurs décisions ne sont transmises qu'une fois la manche résolue, dans l'événement `RoundResolved`. La vue filtrée n'a reçu que l'indicateur `companion`, public, et ne contient toujours ni graine, ni actions, ni salles suivantes. | Conforme |

## Synthèse

- Conformes : 11 (D1 à D9, D11 et D12).
- Non conforme : aucune.
- Risque accepté : 1 (D10), la consultation d'une expédition par un joueur qui en connaît
  l'adresse.

Actions décidées :

- conserver, pour chaque nouvelle information dissimulée, une protection à chacun des
  trois niveaux : vue filtrée du domaine, réponse de l'API, canal temps réel ;
- accompagner chaque nouveau canal discret d'un test qui vérifie l'absence de données,
  par le flux comme par la route de repli.
