# Registre des traitements de données personnelles

Ce registre, prévu par l'article 30 du RGPD, recense les traitements de données personnelles
réalisés par Royaumes. Il est tenu à jour à chaque évolution du jeu qui ajoute, modifie ou
supprime une donnée personnelle, dans le même commit que cette évolution.

- Responsable du traitement : Swixos, joignable par son profil GitHub (https://github.com/Swixos).
- Date de dernière mise à jour : 2026-10-23.

## Sous-traitants

| Sous-traitant | Rôle | Localisation des données | Garanties à vérifier |
| --- | --- | --- | --- |
| Vercel | Hébergement de l'application, journaux techniques | Région de Francfort (fra1) pour les fonctions | Vercel publie un accord de traitement des données (DPA), qui s'appuie sur les clauses contractuelles types de la Commission européenne pour les transferts hors de l'Union européenne ; Vercel est une société américaine, et ses sous-traitants peuvent traiter des données hors de l'Union. Le DPA vise les offres payantes (Pro et Enterprise) : son application à l'offre gratuite Hobby, utilisée par le projet, reste à confirmer. Les journaux d'exécution sont conservés une heure sur l'offre Hobby (un jour sur Pro). |
| Neon | Hébergement de la base de données | Région de Francfort | Neon intègre un accord de traitement des données (DPA) à ses conditions d'utilisation, avec les clauses contractuelles types pour les transferts hors de l'Union européenne ; Neon est une société américaine, et la liste de ses sous-traitants est publiée. Les données de la base restent dans la région choisie à la création du projet. |

## Traitements

| N° | Traitement | Finalité | Données | Personnes concernées | Base légale | Durée de conservation | Emplacement |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Comptes des joueurs | Permettre l'accès au jeu | Nom, adresse électronique, empreinte du mot de passe, date d'inscription | Joueurs | Exécution du contrat (conditions d'utilisation du jeu) | Jusqu'à la suppression du compte | `identity.user`, `identity.account` |
| T2 | Sessions | Maintenir la connexion ; limiter les tentatives de connexion | Adresse IP, navigateur, dates de la session | Joueurs | Exécution du contrat ; intérêt légitime (sécurité) | Jusqu'à l'expiration de la session, ou la suppression du compte | `identity.session` |
| T3 | Activité de jeu | Faire fonctionner le Village, le Donjon, le Marché, le Classement et l'Historique | Identifiant, nom du joueur, nom du village, actions de jeu | Joueurs | Exécution du contrat | Jusqu'à la suppression du compte ; ensuite, identifiant pseudonymisé et noms remplacés (ADR 0008) | `platform.events`, `platform.outbox`, `ranking`, `chronicle`, `tutorial`, `dungeon`, `market` |
| T4 | Messagerie de la Taverne | Permettre aux joueurs de discuter | Contenu des messages, auteur, date | Joueurs | Exécution du contrat | Trente jours, ou jusqu'à la suppression du compte | `tavern.messages` |
| T5 | Présence dans la Taverne | Indiquer les joueurs présents | Identifiant, nom, date du dernier signal | Joueurs | Exécution du contrat | Deux minutes après le dernier signal | `tavern.presence` |
| T6 | Registre des effacements | Démontrer la réalisation des effacements | Date de l'effacement, nombre d'événements réécrits ; aucune donnée sur le joueur | Aucune personne identifiable | Obligation légale (responsabilité, article 5) | Illimitée | `platform.erasures` |
| T8 | Raids de la Flotte | Faire fonctionner les raids navals : rapports de bataille, alertes des ports, cibles, mémoire des capitaines pirates | Identifiants et noms de l'attaquant et du défenseur, nom du village visé, nombre de trirèmes, tactique, posture défensive, butin, dates | Joueurs | Exécution du contrat | Jusqu'à la suppression du compte ; ensuite, noms remplacés et village retiré des cibles (ADR 0011). Les avis d'un port sont conservés sans limite de durée (dette DT-016) | `platform.events` (flux `raid-*` et `harbor-*`), `fleet.raids`, `fleet.harbors` ; `platform.outbox` ne contient que des identifiants |
| T7 | Journaux techniques | Diagnostiquer les erreurs, assurer la sécurité | Adresse IP, adresses des requêtes, messages d'erreur | Joueurs, visiteurs | Intérêt légitime (sécurité, maintenance) | Une heure sur l'offre Hobby de Vercel (un jour sur l'offre Pro) | Vercel |

## Droits des personnes

| Droit | Mise en œuvre |
| --- | --- |
| Accès et portabilité (articles 15 et 20) | Page « Mes données » : export JSON de toutes les données du joueur |
| Effacement (article 17) | Page « Mes données » : suppression du compte, effective dans tous les modules |
| Rectification (article 16) | Page « Mes données » : correction du nom du joueur, remplacé dans son compte, dans le journal et dans les tables de tous les modules (ADR 0015) |
