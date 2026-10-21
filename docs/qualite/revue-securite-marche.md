# Revue de sécurité du Marché : intégrité des échanges

- Date : 2026-10-21
- Périmètre : API du module Marché, gestionnaires de messages du Village et du Marché, boîte d'envoi et sa route de distribution, canal temps réel du Marché.
- Références : OWASP Top 10 (A01 Broken Access Control, A04 Insecure Design, A08 Software and Data Integrity Failures).

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| M1 | Un joueur ne publie, n'accepte et ne retire une offre qu'en son propre nom | Lecture de `api.ts` : aucune route n'accepte d'identifiant de joueur | Dans `src/modules/market/api.ts`, les trois commandes utilisent `c.var.userId` et `c.var.userName`, renseignés par `requireUser`. Le schéma `PublishOfferInput` ne contient que `give` et `want`, et les routes d'acceptation et de retrait ne reçoivent que l'identifiant de l'offre. | Conforme |
| M2 | Seul le vendeur peut retirer son offre et récupérer les ressources en séquestre | Test « restitue les ressources au vendeur qui retire son offre » | Le test réussit. Le test du domaine « ne laisse retirer une offre que par son vendeur, et lui restitue ses ressources » vérifie en outre qu'un autre joueur reçoit `NOT_SELLER` (403). La restitution est toujours versée au vendeur enregistré dans l'offre (`sellerId`), jamais au joueur qui fait la demande. | Conforme |
| M3 | Un joueur ne peut pas accepter sa propre offre | Tests « refuse l'acceptation de sa propre offre... » et « restitue les ressources au vendeur... » | Les tests réussissent : l'acceptation par le vendeur est refusée avec `OWN_OFFER` (409), sans aucun prélèvement. | Conforme |
| M4 | Aucun échange ne crée ni ne détruit de ressources, y compris lors d'acceptations simultanées | Test « ne conclut l'échange qu'avec un seul acheteur, lors de deux acceptations simultanées » | Le test réussit : des deux acceptations simultanées de Bob et Carol, l'une aboutit (200) et l'autre est refusée (409 `NOT_OPEN`), grâce à la concurrence optimiste sur le flux de l'offre ; la somme des stocks des trois joueurs reste de 300 bois et 150 pierre. Le test « réalise l'échange complet, sans créer ni perdre de ressource » vérifie les stocks exacts du vendeur et de l'acheteur après l'échange. | Conforme |
| M5 | Un message remis plusieurs fois n'a d'effet qu'une fois | Test « n'a qu'un effet, et ne répond qu'une fois, lorsqu'un message est remis deux fois » ; test « ignore une réponse en double... » | Les deux tests réussissent. Côté Village, un identifiant de mouvement déjà traité ne produit ni événement ni réponse ; côté Marché, seule la réponse attendue dans l'état courant de l'offre fait progresser la saga. | Conforme |
| M6 | Les quantités échangées sont des entiers strictement positifs, à l'entrée de l'API comme à la réception d'un message | Publication d'une offre de -50 bois ; schéma `ResourceAmounts` | La publication d'une offre de -50 bois répond 400 `INVALID_INPUT`, et le stock de bois du village reste à 100. Le même schéma `ResourceAmounts` (entiers strictement positifs, au moins une ressource, aucune autre clé) valide les offres à l'entrée de l'API et le contenu des messages reçus par le Village (`TransferRequest`). | Conforme |
| M7 | Aucun joueur ne peut provoquer un mouvement de ressources dans un village autrement que par une offre | Lecture des routes de l'API : aucune n'enregistre de message dans la boîte d'envoi | Les routes du Village ne transmettent au service que les commandes `FoundVillage` et `UpgradeBuilding` ; la fonction `transfer` n'est appelée que par les gestionnaires de messages (`messages.ts`). Les seuls messages de mouvement sont produits par le service du Marché, à partir des décisions de son domaine. La route de distribution remet des messages existants, sans en créer. | Conforme |
| M8 | La route de distribution planifiée n'est accessible qu'avec le secret, absent du dépôt | Test « refuse une requête sans le secret attendu, et reste fermée sans secret configuré (401) » ; `git grep -n CRON_SECRET` | Le test réussit, et la route des tâches quotidiennes `/api/cron/daily` répond 401 en développement, où aucun secret n'est défini. `git grep -n CRON_SECRET` ne renvoie que des mentions sans valeur : `.env.example`, la lecture de la variable dans `server.ts`, la documentation et l'ADR 0007 ; le secret des tests est une valeur propre aux tests. | Conforme |
| M9 | Le canal du Marché ne transmet aucune donnée d'événement | Route de repli `/api/stream/market/events?after=0` | Les 13 événements renvoyés ont tous un champ `data` vide : seuls la position, le flux, la version et le type sont transmis. Le nom du flux contient l'identifiant de l'offre, déjà présent dans la liste du Marché. | Conforme |
| M10 | Les ressources manquantes lors d'un paiement refusé ne sont connues que de l'acheteur concerné | Consultation de l'offre par le vendeur après un paiement refusé | Après le refus du paiement de Bob, sa vue indique `missing: { stone: 450 }` ; la vue de l'offre consultée par Alice, la vendeuse, indique `missing: null`. | Conforme |

## Synthèse

- Conformes : 10 (M1 à M10).
- Non conforme : aucune.
- Risque accepté : aucun.

Actions décidées :

- consigner la dette DT-007 : un message abandonné après dix tentatives est seulement compté,
  et la saga correspondante reste bloquée, par exemple une offre en règlement avec des
  ressources en séquestre ;
- valider le contenu de tout nouveau message à sa réception, comme celui d'une requête ;
- accompagner tout nouveau gestionnaire de messages d'un test qui vérifie l'effet unique d'un
  message remis deux fois.
