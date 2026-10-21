# ADR-0007 - Sagas orchestrées et boîte d'envoi transactionnelle pour les opérations entre modules

- Statut : accepté
- Date : 2026-10-21

## Contexte

Un échange du Marché modifie les données de trois flux : l'offre, dans le module Marché, et
les villages du vendeur et de l'acheteur, dans le module Village. L'échange ne doit ni créer
ni perdre de ressources, quelle que soit l'étape à laquelle une panne survient : une fonction
interrompue par sa durée maximale, ou un enregistrement refusé sur un conflit de version.

La règle d'encapsulation des modules (TD2) interdit au Marché d'écrire dans les flux du
Village, et donc de connaître ses règles. Le TD11 envisage par ailleurs l'extraction d'un
module dans un service doté de sa propre base de données : une transaction englobant les
données de deux modules rendrait cette extraction impossible sans réécrire l'échange.

L'hébergement ne permet aucun processus permanent (ADR 0004) : aucun service ne peut
surveiller en continu les messages à transmettre entre modules.

## Décision

Une transaction ne modifie jamais les données que d'un seul module.

Une opération qui concerne plusieurs modules est une saga : une suite de transactions locales,
dont les étapes sont identifiées. Dans l'échange du Marché, la mise en séquestre des ressources
du vendeur est compensable (par une restitution), le paiement de l'acheteur est l'étape pivot,
et les livraisons aux deux joueurs sont reprises jusqu'au succès.

La saga est orchestrée par le module qui porte l'opération, ici le Marché. Les participants,
ici le Village, ne connaissent pas la saga : ils traitent des demandes de prélèvement et de
versement, et répondent à l'adresse de retour indiquée dans chaque demande.

Les messages sont enregistrés dans la boîte d'envoi de la plateforme (`platform.outbox`), dans
la même transaction que les événements qui les déclenchent.

La distribution est garantie au moins une fois : chaque message est réservé pour la durée d'un
bail, retenté après un échec avec un délai qui double à chaque tentative, et abandonné après
dix tentatives. Deux distributions simultanées ne réservent jamais le même message
(`FOR UPDATE SKIP LOCKED`).

Chaque gestionnaire est idempotent, grâce à une clé d'idempotence choisie par le demandeur :
l'identifiant du mouvement, construit à partir de l'offre et de l'étape de la saga. Un refus
est enregistré comme un fait, afin qu'un même mouvement ait toujours la même issue.

La distribution a lieu après chaque commande et chaque consultation du Marché, et chaque jour
par une tâche planifiée de Vercel, dont la route est protégée par un secret (`CRON_SECRET`).
Un message différé sert de minuterie pour l'échéance des offres.

## Conséquences

### Positives

- Aucun module n'écrit dans les données d'un autre : le Marché ne connaît du Village que ses
  contrats, qui décrivent les messages qu'il accepte.
- Une panne à n'importe quel moment ne perd ni ne duplique aucune ressource : un message n'est
  jamais perdu, et son effet n'a lieu qu'une fois.
- Le Village peut servir d'autres demandeurs sans modification : un impôt ou une récompense
  n'aurait qu'à envoyer les mêmes messages.
- La boîte d'envoi sert aussi de minuterie, grâce aux messages différés, sans aucune tâche de fond.
- Le déroulement de la saga se lit en un seul endroit, le domaine du Marché (`saga.ts`), et son
  état est visible dans l'état de l'offre.
- Dans le cas ordinaire, toutes les étapes se déroulent avant la réponse de la commande : la
  saga est asynchrone par conception, mais rapide en pratique.

### Négatives

- Des états intermédiaires sont visibles des joueurs, comme une offre en réservation ou en
  règlement, et l'interface doit les présenter.
- La latence dépend de l'activité : une saga interrompue ne reprend qu'à la consultation suivante
  du Marché, ou au plus tard lors de la tâche planifiée du lendemain.
- Chaque gestionnaire doit être idempotent, et ses doublons doivent être testés.
- Un message abandonné après dix tentatives est seulement compté : aucun outil ne permet encore
  de l'examiner ni de le relancer, et la saga correspondante reste bloquée (dette DT-007).
- La table de la boîte d'envoi grandit sans limite, les messages traités étant conservés.

## Alternatives écartées

- **Transaction unique englobant les données des deux modules** : le Marché devrait connaître les
  événements et les règles du Village, ce qui enfreint l'encapsulation, et l'extraction d'un
  module deviendrait impossible sans réécrire l'échange.
- **Transaction distribuée par validation en deux phases** : elle exige un coordinateur et des
  bases qui la prennent en charge, verrouille les données des participants pendant toute
  l'opération, et ne survit pas à la panne du coordinateur.
- **Appel direct du Village par le Marché, sans boîte d'envoi** : l'enregistrement de l'offre et
  la demande au Village forment deux écritures ; une panne entre les deux laisse le système
  incohérent (double écriture).
- **Saga chorégraphiée** : chaque module réagirait aux événements des autres ; le Village devrait
  alors connaître les offres, et le déroulement de l'échange serait dispersé entre les modules.
- **Journal d'événements utilisé comme boîte d'envoi** : un message est une commande adressée à
  un destinataire, et non un fait, et sa distribution a besoin d'un suivi par message
  (tentatives, bail, erreur) que le journal, en ajout seul, ne permet pas.

## Réexamen

Cette décision devra être réexaminée lors de l'extraction d'un module dans un service distinct,
qui demanderait une boîte d'envoi par base et un transport entre services ; si le volume des
messages justifie un courtier de messages dédié ; ou si une latence que la distribution
déclenchée par les requêtes ne satisfait plus devient nécessaire.

## Usage de l'IA générative

Aucun.
