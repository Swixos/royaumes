# ADR-0009 - Extraction du Village en service autonome, préparée mais non déployée

- Statut : accepté
- Date : 2026-10-23

## Contexte

L'ADR 0001 a retenu le monolithe modulaire en promettant des frontières entre modules assez
strictes pour qu'un module puisse, le jour venu, être extrait dans un service indépendant.
Cette promesse n'avait jamais été vérifiée.

Les raisons d'extraire un module sont connues : une équipe distincte chargée du module, une
charge qui demande de le dimensionner séparément, un rythme de déploiement propre, ou une
exigence de disponibilité différente. Aucune ne s'applique aujourd'hui à Royaumes, développé
par une seule personne et joué par quelques dizaines de joueurs.

Le Village est le meilleur candidat : son domaine ne dépend d'aucun autre module, il ne lit
les données d'aucun autre module, et sa relation avec le Marché passe déjà par des messages
(ADR 0007). L'inventaire de ses dépendances fait apparaître deux dépendances qui ne passent
par aucune importation : le Classement et le canal temps réel du village lisent ses
événements dans le journal commun.

## Décision

Le Village peut s'exécuter dans un service autonome (`src/services/village/`), doté de sa
propre base, de son propre journal et de sa propre boîte d'envoi. Le module Village lui-même
n'est pas modifié : le service l'assemble avec sa propre plateforme.

L'application devient alors une passerelle : la racine de composition reçoit une version
distante du module Village (`src/modules/realm/remote.ts`), de même forme que la version
exécutée dans le processus, et choisit l'une ou l'autre selon la configuration.

Les messages de la saga franchissent la frontière par une boîte de réception, de part et
d'autre : un message n'est marqué comme traité qu'une fois accepté par l'autre processus,
ce qui préserve la livraison au moins une fois et l'idempotence des gestionnaires.

Un relais recopie le flux d'événements publié par le service dans le journal de
l'application, en conservant le flux et la version de chaque événement. Le Classement et le
canal temps réel continuent de lire le journal local, sans modification.

Les échanges entre les deux processus sont authentifiés par un secret partagé
(`SERVICE_SECRET`), qui n'est jamais versionné. Le service ne croit l'identité du joueur
transmise par l'application qu'en présence de ce secret.

Le service n'est pas déployé : en production, le Village s'exécute dans l'application.

## Conséquences

### Positives

- Les frontières du Village sont démontrées, et non plus supposées : l'extraction n'a
  demandé aucune modification de son domaine, de ses règles ni des autres modules.
- Six tests de contrat, exécutés par `pnpm verify`, vérifient ces frontières à chaque
  construction, en faisant fonctionner les deux processus en mémoire.
- L'extraction est réversible sans migration de données : le relais ayant recopié tous les
  événements du service, l'application peut de nouveau exécuter le Village elle-même.
- La boîte de réception et l'authentification entre services sont des briques de la
  plateforme, réutilisables pour l'extraction de tout autre module.
- Le coût réel d'une extraction est mesuré : environ 165 lignes pour le module distant, 77
  pour la racine de composition du service, et une panne partielle désormais possible.

### Négatives

- Deux chemins d'exécution du Village sont à maintenir, l'un dans le processus, l'autre
  distant ; une évolution de l'un doit être répercutée sur l'autre.
- Les événements du Village sont copiés dans le journal de l'application, avec une cohérence
  différée : un événement du service n'apparaît au Classement qu'après son relais.
- Le service extrait porte des dettes à rembourser avant tout déploiement : ses migrations,
  la pagination de son flux publié et la distribution de sa boîte d'envoi (DT-010 à DT-012).
- L'authentification par secret partagé permettrait, en cas de fuite du secret, de se faire
  passer pour n'importe quel joueur auprès du service.
- Une panne du service rend le Village indisponible, alors que le monolithe ne pouvait pas
  connaître de panne partielle.

## Alternatives écartées

- **Déployer le service** : aucune des raisons d'extraire ne s'applique aujourd'hui, et le
  déploiement ajouterait un second hébergement, une seconde base, une latence réseau et un
  risque de panne partielle, sans aucun bénéfice pour les joueurs.
- **Ne pas extraire** : les frontières resteraient une hypothèse, que seule une extraction
  réelle, faite sous la contrainte d'un besoin, viendrait vérifier, au pire moment.
- **Lecture à distance du flux publié par le Classement et le canal temps réel** : ces deux
  consommateurs devraient être modifiés, et dépendraient de la disponibilité du service ; le
  relais les laisse inchangés.
- **Extraire un autre module, comme le Marché** : sa saga lie son sort à celui du Village, et
  il lit les contrats de ce dernier ; son extraction vérifierait moins bien la promesse de
  l'ADR 0001, pour un coût plus élevé.
- **Jeton signé ou TLS mutuel pour authentifier les échanges** : plus robustes, ils demandent
  une gestion de clés ou de certificats disproportionnée pour un service qui n'est pas
  déployé ; ils devraient être reconsidérés avant tout déploiement.

## Réexamen

Cette décision devra être réexaminée si le Village dépasse le budget de performance du test
de charge alors que les autres modules le respectent ; si une seconde équipe est chargée du
Village ; ou si le Village doit être déployé plus souvent, ou avec une disponibilité
différente, que le reste du jeu. Un déploiement du service demandera d'abord le
remboursement des dettes DT-010 à DT-012 et le remplacement du secret partagé par une
authentification plus robuste.

## Usage de l'IA générative

Aucun.
