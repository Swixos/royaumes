# Revue de conformité au RGPD

- Date : 2026-10-21
- Périmètre : données personnelles de l'ensemble du jeu, export et effacement, durées de conservation, journaux techniques.
- Références : RGPD, articles 5, 15, 17, 20, 25 et 30 ; registre des traitements ; ADR 0008.

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| R1 | Chaque emplacement de données personnelles figure au registre des traitements | Comparaison du registre et de l'inventaire de la sous-partie 1.2 du TD10 | Les neuf emplacements de l'inventaire (`identity.user`, `identity.account`, `identity.session`, `platform.events`, `platform.outbox`, les tables de lecture des schémas `ranking`, `dungeon` et `market`, `tavern.messages`, `tavern.presence`, journaux de Vercel) figurent dans les traitements T1 à T7. Le registre des effacements (T6), ajouté par ce TD, ne contient aucune donnée personnelle. | Conforme |
| R2 | L'export contient toutes les données du joueur, module par module | Test « exporte les données du joueur, module par module, en un fichier JSON » ; lecture d'un export réel | Le test réussit. Un export réel, téléchargé depuis la page « Mes données », contient les sections `realm`, `dungeon`, `market`, `ranking`, `tavern` et `identity` ; la section `identity` présente le compte et les sessions, avec l'adresse IP et le navigateur. | Conforme |
| R3 | L'export ne contient ni les données des autres joueurs, ni les secrets du jeu ou du compte | Test « ne contient ni les données des autres joueurs, ni les secrets du jeu » ; recherche de « password » et « token » dans un export | Le test réussit : ni les messages ni le village d'un autre joueur, ni la graine des expéditions. Un export réel ne contient ni « password », ni « token », ni le mot de passe saisi : le compte n'expose que `name`, `email` et `createdAt`, et les sessions ni leur jeton ni leur identifiant. | Conforme |
| R4 | Après la suppression d'un compte, son nom et celui de son village n'apparaissent plus dans aucune table | Suppression d'un compte de test, puis recherche de son nom dans toutes les tables | Un compte « Zéphyrine » a fondé le village « Brumeval », ouvert une expédition, écrit dans la Taverne et figuré au classement, puis a été supprimé. La recherche des deux noms dans toutes les tables des schémas `platform`, `identity`, `ranking`, `dungeon`, `market` et `tavern` ne renvoie aucune ligne. | Conforme |
| R5 | L'effacement est tracé, sans conserver de donnée sur le joueur, et peut être relancé | Tests « enregistre l'effacement dans le registre... » et « peut être relancé sans effet supplémentaire » | Les deux tests réussissent : la ligne du registre ne contient que `id`, `erased_at` et `events_rewritten`, et un second effacement ne réécrit aucun événement. | Conforme |
| R6 | Les messages de la Taverne ne sont pas conservés plus de trente jours, même sans visite | Tests de la durée de conservation ; compte rendu de la tâche quotidienne dans les journaux de Vercel | Les tests « ne présente plus, et supprime, les messages de plus de trente jours » et « applique la durée de conservation chaque jour, même sans visite de la Taverne » réussissent. Le compte rendu de la tâche quotidienne sera vérifié dans les journaux de Vercel après le déploiement de ce TD. | Conforme |
| R7 | La présence ne constitue aucun historique des visites | Test « considère comme parti un joueur sans signal depuis deux minutes, et supprime sa ligne » | Le test réussit : la ligne est supprimée, et non marquée comme inactive. La table ne contient qu'une ligne par joueur présent, sans date d'arrivée. | Conforme |
| R8 | Les sessions expirées ne sont pas conservées indéfiniment | Requête SQL sur `identity.session` : sessions dont `expires_at` est passé | La base de développement compte 19 sessions, dont aucune n'est encore expirée : elles ont toutes moins de sept jours, la durée par défaut d'une session. Mais aucun mécanisme du projet ne supprime une session expirée : Better Auth ne la supprime que si elle est de nouveau présentée, ce qui n'arrive pas pour un navigateur qui ne revient pas. Les adresses IP et navigateurs de ces sessions seraient donc conservés sans limite. | Non conforme (DT-008) |
| R9 | Les journaux techniques ne contiennent pas de données personnelles au-delà du nécessaire | Lecture de `app.onError` dans `create-api.ts` ; consultation des journaux de Vercel | `app.onError` écrit l'erreur complète dans les journaux (`console.error(error)`). Une erreur de la base contient la requête SQL et ses paramètres : l'échec de l'insertion d'un message écrirait son contenu, son auteur et son nom dans les journaux de Vercel. Ces journaux sont conservés une heure sur l'offre Hobby. | Non conforme (DT-009) |
| R10 | Après la suppression d'un compte, l'identifiant conservé ne peut plus être relié à une personne | Recherche de l'identifiant dans `identity`, `platform.outbox` et les journaux de Vercel | L'identifiant ne figure plus dans le schéma `identity`. Dans `platform.outbox`, il apparaît dans les messages de mouvement de ressources, sans nom ni adresse. Les journaux de Vercel associent en revanche les adresses des flux temps réel (`/api/stream/village-<identifiant>`) à l'adresse IP de la requête : cette correspondance subsiste après l'effacement, pendant la durée de conservation des journaux de l'hébergeur, une heure sur l'offre Hobby. | Risque accepté |

## Synthèse

- Conformes : 7 (R1 à R7).
- Non conformes : 2 (R8 et R9), consignées dans le registre de la dette technique.
- Risque accepté : 1 (R10), la correspondance entre l'identifiant d'un joueur effacé et une
  adresse IP dans les journaux de Vercel, limitée à leur durée de conservation.

Actions décidées :

- supprimer les sessions expirées par la tâche quotidienne (DT-008) ;
- n'écrire dans les journaux que le type et le code des erreurs, sans leurs paramètres (DT-009) ;
- réexaminer R10 si le projet passe à une offre de Vercel dont les journaux sont conservés plus
  longtemps, ou s'il ajoute un service de journalisation externe ;
- confirmer l'application de l'accord de traitement des données de Vercel à l'offre Hobby ;
- mettre en œuvre le droit de rectification, aujourd'hui absent (registre des traitements).

## Mise à jour du 2026-10-23 : module Flotte et droit de rectification

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| R11 | Les données de la Flotte figurent au registre, à l'export et à l'effacement | Traitement T8 ; tests « exporte les raids du joueur, et retire son village des cibles à l'effacement » et « efface le nom de l'attaquant des ports qui ont vu sa flotte » | Le traitement T8 est ajouté. L'export comprend une section `fleet` (raids lancés, raids subis, avis du port) ; l'effacement remplace les noms dans les flux `raid-*` et `harbor-*` et dans `fleet.raids`, et retire le village des cibles. La boîte d'envoi ne reçoit de la Flotte que des identifiants. | Conforme |
| R12 | Un joueur peut rectifier son nom, partout où il est recopié | Tests « remplace le nom du joueur dans son compte, le journal et les tables de tous les modules », « n'enregistre rien au registre des effacements, et peut être relancée sans effet » | Le nom est remplacé dans `identity.user`, dans les événements du Donjon, du Marché et de la Flotte, et dans les tables du Donjon, du Marché, de la Taverne, du Classement et de la Flotte ; le nom du village n'est pas modifié. | Conforme (DT-013 remboursée) |

Synthèse de la mise à jour : deux exigences conformes. L'action « mettre en œuvre le droit de
rectification » est réalisée.
