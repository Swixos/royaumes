# ADR-0008 - Stockage classique pour la Taverne, et réécriture ciblée des champs personnels du journal pour l'effacement

- Statut : accepté
- Date : 2026-10-21

## Contexte

La Taverne ajoute au jeu une messagerie et une présence. Ses messages et la présence des
joueurs sont des données personnelles destinées à disparaître : un message n'a pas vocation
à être conservé au-delà d'une durée limitée, et la présence n'a de sens que pendant la visite.

Le RGPD accorde par ailleurs aux joueurs des droits d'accès, de portabilité et d'effacement
qui portent sur le jeu entier, et non sur un seul module : les données d'un joueur se trouvent
dans l'identité, dans les tables des modules et dans le journal d'événements.

Le nom des joueurs a été copié dans les événements du Donjon (`GameCreated`, `PlayerJoined`)
et du Marché (`OfferPublished`, `OfferAccepted`), et le nom du village dans l'événement
`VillageFounded` du Village. Certains de ces flux sont partagés avec d'autres joueurs : une
expédition contient les événements de tous ses membres.

Le journal est en ajout seul : aucun événement n'est jamais modifié ni supprimé (ADR 0002). Les
états des modules sont reconstruits à partir de lui, et les projections en dépendent (ADR 0006).

## Décision

La Taverne utilise des tables ordinaires (`tavern.messages`, `tavern.presence`), et non l'Event
Sourcing : leurs lignes sont supprimées à l'expiration de leur durée de conservation.

Son canal temps réel est alimenté par une source fournie par le module, la table des messages,
et non par le journal.

La présence repose sur un signal envoyé périodiquement par le navigateur : une ligne par joueur
présent, supprimée à son départ, ou deux minutes après son dernier signal. Aucun historique des
visites n'est conservé.

Les durées de conservation (trente jours pour les messages) sont appliquées à chaque lecture, et
chaque jour par la route des tâches quotidiennes (`/api/cron/daily`).

Chaque module déclare ses données personnelles par un contributeur (`personal-data.ts`) : il les
exporte, réécrit ses événements, et efface ses tables. La plateforme en tire l'export et
l'effacement, sans connaître aucun module.

L'effacement réécrit les seuls champs de nom des événements qui concernent le joueur, par une
valeur neutre (« Joueur effacé », « Village effacé »). La réécriture passe par une fonction
unique de la plateforme (`rewriteJournal`), dans une transaction qui ajoute une ligne au registre
des effacements (`platform.erasures`). Ce registre ne contient aucune donnée sur le joueur : la
date de l'effacement et le nombre d'événements réécrits.

L'identité est effacée en dernier, et chaque étape est idempotente : tant que le compte existe,
le joueur peut relancer un effacement interrompu.

## Conséquences

### Positives

- Le joueur exerce lui-même ses droits d'accès, de portabilité et d'effacement, depuis la page
  « Mes données », sans intervention de l'équipe.
- L'effacement n'altère ni les états reconstruits ni l'historique des autres joueurs : le type,
  la version, la position et les autres données de chaque événement sont inchangés.
- La durée de conservation est garantie même sans activité, grâce à la tâche quotidienne.
- La Taverne est plus simple que si elle avait suivi le modèle des autres modules : des
  insertions, des lectures et des suppressions, sans journal à combattre.
- Le registre des effacements démontre que les effacements ont eu lieu, sans conserver ce qu'ils
  ont effacé.

### Négatives

- La réécriture est une exception à la règle de l'ajout seul. Toute modification future du
  journal devra respecter strictement ses limites : seuls les champs personnels, par la seule
  fonction de la plateforme, avec une trace dans le registre.
- L'effacement et l'export parcourent tout le journal : leur coût croît avec sa taille.
- Chaque événement futur crée une obligation nouvelle : déclarer ses champs personnels dans le
  contributeur de son module, faute de quoi ils échapperont à l'effacement sans aucune erreur.
- L'identifiant du joueur est conservé dans le journal. Sa pseudonymisation dépend de la
  destruction effective de tout lien avec la personne, y compris dans les journaux de
  l'hébergeur.
- Les tables de lecture sont corrigées par chaque module au moment de l'effacement : une
  projection en retard peut présenter un intitulé neutre différent après son rattrapage.

## Alternatives écartées

- **Event Sourcing pour la Taverne** : des messages destinés à disparaître dans un journal en
  ajout seul obligeraient à lutter en permanence contre le principe même de ce journal, et les
  critères qui justifient l'Event Sourcing (historique, règles métier, reconstruction) ne
  s'appliquent pas à une messagerie.
- **Suppression des flux du joueur** : les flux d'une expédition ou d'une offre sont partagés
  avec d'autres joueurs, et leur suppression ferait disparaître l'historique de ces joueurs,
  ainsi que les états reconstruits et les projections qui en dépendent.
- **Effacement cryptographique** : chiffrer les champs personnels avec une clé propre à chaque
  joueur, détruite à l'effacement, aurait dû être décidé à la conception des événements ; il ne
  règle pas le cas des événements déjà enregistrés en clair.
- **Références sans copie** : n'enregistrer que l'identifiant du joueur, et retrouver son nom à
  l'affichage, aurait également dû être décidé à la conception ; les événements existants
  contiennent déjà des noms.
- **Service externe de présence, comme une base clé-valeur en mémoire** : il ajouterait un
  fournisseur, un sous-traitant et une configuration, pour une donnée que quelques lignes d'une
  table suffisent à tenir.

## Réexamen

Cette décision devra être réexaminée lors de la conception d'un nouveau module, pour lequel les
références sans copie devraient être préférées dès l'origine ; si la taille du journal rend
l'effacement trop long pour une requête ; ou si la doctrine sur l'anonymisation des
identifiants pseudonymes évolue.

## Usage de l'IA générative

Aucun.
