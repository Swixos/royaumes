# ADR-0003 - Server-Sent Events, alimentés par le journal, pour le temps réel

- Statut : accepté
- Date : 2026-10-20

## Contexte

Les joueurs doivent être informés des changements sans recharger la page : d'abord entre
les onglets ou les appareils d'un même joueur, puis entre les participants d'une partie du
Donjon (TD6). Les actions des joueurs passent déjà par l'API, au moyen de requêtes HTTP
authentifiées : seul le sens du serveur vers le navigateur reste à couvrir.

L'application est hébergée sur l'offre gratuite de Vercel. La durée d'exécution d'une
fonction y est plafonnée à 300 secondes, plusieurs instances peuvent traiter les requêtes
d'un même joueur sans partager de mémoire, et aucune infrastructure supplémentaire
(serveur permanent, service de messagerie) n'est disponible sans coût.

Le projet dispose d'un journal d'événements dont chaque flux porte des versions
croissantes à partir de 1 (ADR 0002).

## Décision

Les changements sont diffusés aux navigateurs par des Server-Sent Events, sur la route
`/api/stream/<canal>` (`src/platform/realtime/stream-api.ts`).

Un canal correspond exactement à un flux du journal. L'identifiant de chaque message est
la version de l'événement transmis : à la reconnexion, le navigateur renvoie la dernière
version reçue dans l'en-tête `Last-Event-ID`, et le flux reprend juste après.

Le flux relit le journal toutes les demi-secondes et transmet les nouveaux événements. Il
se ferme de lui-même au bout de 240 secondes, sous la limite de Vercel, et le navigateur
s'y reconnecte automatiquement.

L'accès aux flux est réservé aux joueurs connectés. Chaque module déclare la règle d'accès
à ses canaux (`channel-policy.ts`), transmise par la racine de composition ; un canal
qu'aucune règle ne couvre est refusé.

L'interface ne reconstruit pas son état à partir du contenu des événements : à chaque
notification, elle relit sa vue auprès de l'API, qui reste la seule à appliquer les
règles du jeu.

## Conséquences

### Positives

- Le flux est une réponse HTTP ordinaire : il fonctionne sur l'hébergement sans serveur,
  traverse les intermédiaires du réseau, et emporte le cookie de session sans code
  supplémentaire.
- Le flux ne conserve aucun état en mémoire : n'importe quelle instance peut servir
  n'importe quel joueur, et une reconnexion sur une autre instance ne perd rien.
- La reprise est assurée par le navigateur lui-même, grâce à `EventSource` et à
  `Last-Event-ID` : aucun événement n'est perdu ni reçu deux fois après une interruption.
- Le journal reste la source unique : aucune table ni file de messages supplémentaire
  n'est nécessaire, et tout événement enregistré est diffusé, quelle que soit l'instance
  qui l'a écrit.
- Le mécanisme est générique : les modules suivants n'auront qu'à déclarer leurs canaux et
  leurs règles d'accès.

### Négatives

- Chaque joueur connecté provoque deux lectures du journal par seconde, même lorsque rien
  ne change : la charge de la base croît avec le nombre de joueurs connectés.
- Un événement peut être reçu jusqu'à une demi-seconde après son enregistrement, auquel
  s'ajoute le temps de relecture de la vue.
- Chaque flux occupe une fonction Vercel pendant toute sa durée, et provoque une
  reconnexion toutes les quatre minutes.
- Le flux ne va que du serveur vers le navigateur : un besoin de communication inverse à
  très faible délai ne pourrait pas être couvert sans autre mécanisme.
- Chaque notification provoque une requête supplémentaire de l'interface pour relire sa vue.

## Alternatives écartées

- **WebSocket** : une connexion bidirectionnelle suppose un serveur qui la maintient
  ouverte. Sa prise en charge par les fonctions Vercel n'était pas stable lors de la
  conception, et la connexion serait de toute façon interrompue au terme de la durée
  maximale d'une fonction. Le sens du navigateur vers le serveur est déjà couvert par l'API.
- **Interrogation périodique par le navigateur** : simple, mais chaque interrogation est une
  requête complète, authentifiée et soumise au rendu de la vue ; pour un délai comparable,
  la charge serait plus élevée, et la reprise sans perte devrait être écrite à la main.
- **Notification partagée entre instances** (`LISTEN/NOTIFY` de PostgreSQL, ou un service de
  messagerie) : supprimerait la relecture périodique, mais exige une connexion permanente
  à la base ou un service supplémentaire, incompatibles avec des fonctions de courte durée
  et avec l'offre gratuite du projet.

## Réexamen

Cette décision devra être réexaminée si le nombre de joueurs connectés simultanément rend
les lectures du journal sensibles pour la base, si un besoin de communication du navigateur
vers le serveur à très faible délai apparaît, ou si l'hébergeur propose une prise en charge
stable des WebSocket ou d'un mécanisme de notification adapté aux fonctions sans serveur.

## Usage de l'IA générative

Aucun.
