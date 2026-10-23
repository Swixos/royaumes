# ADR-0014 - Jeton signé, à durée de vie courte, pour les échanges entre l'application et un service

- Statut : accepté
- Date : 2026-10-23
- Remplace : la section « authentification par secret partagé » de l'ADR 0009

## Contexte

L'ADR 0009 authentifie les échanges entre l'application et le service Village par un secret
partagé (`SERVICE_SECRET`), envoyé tel quel dans l'en-tête `Authorization` de chaque requête.
L'identité du joueur est transmise à part, dans des en-têtes `x-player-id` et `x-player-name`.
L'ADR 0009 en relève la faiblesse et demande son remplacement avant tout déploiement :

- le secret voyage dans chaque requête, et une seule requête interceptée, ou un seul journal qui
  la recopie, le livre pour toujours ;
- l'identité du joueur n'est liée à rien : quiconque connaît le secret peut agir au nom de
  n'importe quel joueur, et une requête capturée peut être rejouée sans limite de temps.

## Décision

Le secret partagé devient une **clé de signature**, qui ne voyage plus. Chaque requête porte un
**jeton signé** (`src/platform/http/service-auth.ts`) :

- de la forme `v1.<contenu>.<signature>`, en base64url ;
- dont le contenu indique sa date d'émission (`iat`), son expiration (`exp`), une minute plus tard,
  et, pour une requête faite au nom d'un joueur, son identifiant (`sub`) et son nom (`name`) ;
- signé par HMAC-SHA256 avec le secret partagé.

Le destinataire vérifie le format, puis la signature en temps constant (`timingSafeEqual`), puis
l'expiration. L'identité du joueur n'est lue que dans le jeton : les en-têtes `x-player-*` sont
supprimés. Un jeton est créé pour chaque requête et chaque message transmis à une boîte de
réception (`forwardTo`, `createInboxApi`).

Le secret de la tâche planifiée (`CRON_SECRET`) reste un secret porteur : il est imposé par le
fonctionnement des tâches planifiées de Vercel, qui l'envoient elles-mêmes.

## Conséquences

### Positives

- Le secret n'apparaît plus dans aucune requête : une requête interceptée ne donne qu'un jeton
  valable une minute.
- L'identité du joueur est couverte par la signature : la modifier invalide le jeton. Le test
  « refuse un jeton expiré, ou dont l'identité du joueur a été modifiée (401) » le vérifie.
- Le secret brut, présenté comme jeton, est refusé : le test de contrat du service le vérifie.
- Aucune dépendance ajoutée : HMAC-SHA256 est fourni par `node:crypto`.

### Négatives

- Un jeton capturé peut être rejoué pendant sa minute de validité : aucun identifiant unique n'est
  mémorisé par le destinataire.
- Le jeton ne précise pas son destinataire : un jeton émis pour le service pourrait être présenté,
  dans la minute, à la boîte de réception de l'application, qui partage la même clé.
- Les horloges des deux processus doivent être à peu près à l'heure : un écart de plus d'une
  minute fait refuser tous les jetons.
- La fuite de la clé reste aussi grave qu'avant : elle permet de signer des jetons au nom de
  n'importe quel joueur.

## Alternatives écartées

- **Conserver le secret porteur** : c'est la faiblesse relevée par l'ADR 0009.
- **Jeton JWT par une bibliothèque** : le format ici nécessaire est minimal, et une dépendance de
  plus serait à surveiller ; le format `v1` réserve une évolution vers un standard.
- **Signature asymétrique (clé privée côté application, publique côté service)** : elle
  protégerait le service d'une fuite côté service, mais les deux processus s'envoient des
  messages dans les deux sens ; il faudrait deux paires de clés pour un service non déployé.
- **TLS mutuel** : il dépend de l'hébergement, et Vercel ne le propose pas pour les fonctions.

## Réexamen

À réexaminer au déploiement réel du service : ajouter le destinataire (`aud`) et un identifiant
unique mémorisé pour interdire le rejeu, ou passer à une signature asymétrique.

## Usage de l'IA générative

