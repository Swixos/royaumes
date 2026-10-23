# ADR-0011 - Communication de la Flotte : messages avec le Village, langage publié du Village et de la Flotte

- Statut : accepté
- Date : 2026-10-23

## Contexte

Un raid touche aux données de trois modules :

- le **Village** détient les ressources : l'équipement de la flotte est prélevé dans le village de
  l'attaquant, le butin est prélevé dans celui du défenseur puis versé à l'attaquant, et un raid
  rappelé rend son équipement ;
- le **Village** détient aussi ce qui fait la défense d'un village : son existence et ses
  améliorations de bâtiment (règle 8) ;
- le **Classement** additionne l'or rapporté par chaque joueur, et l'or pillé doit y figurer.

La règle d'encapsulation interdit à un module d'écrire dans les données d'un autre, ou d'importer
ses fichiers internes (TD2, fonction d'aptitude `module-encapsulation`). Le Village peut être
extrait dans un service distinct (ADR 0009) : la Flotte ne doit pas supposer qu'il partage sa
base de données.

Le défenseur doit être prévenu d'une flotte en approche, et les deux joueurs du résultat de la
bataille, alors que ces faits naissent dans le flux du raid et non dans leur port.

## Décision

**Avec le Village, en écriture : des messages de la boîte d'envoi.** La Flotte réutilise le
langage publié du Village, ses sujets `realm.withdraw` et `realm.deposit`, sans aucune
modification du Village. Chaque demande porte un identifiant de mouvement construit à partir du
raid et de l'étape (`<raid>:provision`, `<raid>:plunder-1`, `<raid>:loot`, `<raid>:refund`) :
c'est la clé d'idempotence du Village, qui ne traite jamais deux fois le même mouvement. Le
Village répond sur le sujet `fleet.transfer-result`, et la réponse fait avancer la saga
(ADR 0012).

**Avec le Village, en lecture : son langage publié.** La projection de la Flotte lit les
événements `VillageFounded` et `BuildingUpgraded` des flux `village-*`, comme le Classement, et en
tient la table `fleet.harbors`. Elle ne décrit que les champs qu'elle utilise.

**Vers le Classement : le langage publié de la Flotte.** L'événement `RaidPlundered` porte
l'identifiant de l'attaquant et le butin. La projection du Classement le lit et ajoute l'or pillé
à l'or du joueur. Sa version passe de 2 à 3, ce qui la reconstruit au déploiement (TD8). Le
Classement ne dépend que du fichier `contracts.ts` d'aucun module pour cela : il lit un type
d'événement, comme il lit ceux du Donjon.

**Vers les ports : des messages internes à la Flotte.** Le flux d'un raid ne peut pas écrire dans
le flux d'un port dans la même transaction. Chaque étape de la saga enregistre donc un message
`fleet.notice` (« repéré », « demi-tour », « rapport ») adressé au port concerné. Ce message ne
porte que des identifiants (joueur, raid, nature de l'avis) : le gestionnaire relit le raid et en
tire les noms au moment de l'enregistrement. Le port est idempotent : un avis déjà reçu pour un
raid n'est pas enregistré une seconde fois.

**Le canal temps réel du port.** Le flux `harbor-<joueur>` est un canal : sa règle d'accès
n'autorise que son propriétaire (`canSubscribe: channel === harborChannel(userId)`). Le canal
n'est pas discret, puisque ses données ne concernent que ce joueur ; la tactique de l'attaquant
n'y figure jamais avant la bataille.

## Garanties obtenues

- **Livraison au moins une fois** : tous les messages passent par la boîte d'envoi, enregistrée
  dans la transaction des événements qui les déclenchent (ADR 0007).
- **Idempotence** : le Village ignore un mouvement déjà traité, le raid ignore une réponse
  inattendue ou en double, le port ignore un avis déjà reçu. Les tests « ignore une réponse en
  double ou inattendue » et « n'enregistre qu'une fois le même avis d'un raid » le vérifient.
- **Cohérence différée** : les cibles, le classement et les avis du port sont à jour à la lecture
  suivante, ou dès la distribution de la boîte d'envoi, qui a lieu après chaque commande et
  chaque lecture de la Flotte.
- **Aucune donnée personnelle dans la boîte d'envoi** : les messages ne portent que des
  identifiants, ce que vérifie le test « ne recopie aucun nom de joueur dans les avis conservés
  par la boîte d'envoi ».

## Conséquences

### Positives

- Le Village n'a pas été modifié : la Flotte est un nouveau demandeur de ses mouvements, comme
  l'ADR 0007 l'avait prévu.
- La Flotte fonctionne de la même manière que le Village soit dans le processus ou extrait, ses
  messages passant par la boîte d'envoi et ses lectures par le journal relayé.
- Un effacement ne laisse aucun nom dans la boîte d'envoi, qui conserve les messages traités.

### Négatives

- Le Classement dépend désormais d'un événement de la Flotte : renommer `RaidPlundered` ou son
  champ `loot` casserait silencieusement le Classement, sans erreur de compilation.
- La défense d'un village est lue dans un modèle de lecture, cohérent à terme : une amélioration
  enregistrée à l'instant même de la bataille peut ne pas encore compter.
- Un avis de port arrive après le fait, au rythme de la distribution de la boîte d'envoi.

## Alternatives écartées

- **Appeler le service du Village directement** : impossible sans importer ses fichiers internes,
  et une panne entre l'enregistrement du raid et l'appel laisserait le raid incohérent (double
  écriture, ADR 0007).
- **Ajouter au Village des sujets propres à la Flotte (« équiper une flotte »)** : le Village
  connaîtrait les raids ; les mouvements génériques suffisent.
- **Interroger le Village à l'arrivée de la flotte pour connaître sa défense** : il faudrait un
  nouveau contrat de requête et réponse, et la bataille dépendrait de la disponibilité du Village
  extrait ; le langage publié, déjà lu par le Classement, donne l'information sans couplage.
- **Faire lire au Classement le modèle de lecture de la Flotte** : il importerait les tables d'un
  autre module.
- **Porter les noms dans les messages d'avis** : la boîte d'envoi conserve les messages traités,
  et l'effacement ne la réécrit pas ; les noms y survivraient à la suppression du compte.
- **Écrire dans le port depuis la transaction du raid** : une transaction ne modifie qu'un flux
  (ADR 0007), et le raid et le port peuvent changer en même temps.

## Usage de l'IA générative

