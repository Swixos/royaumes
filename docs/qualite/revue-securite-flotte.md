# Revue de sécurité de la Flotte : raids, ports et intégrité des ressources

- Date : 2026-10-23
- Périmètre : API du module Flotte, gestionnaires de ses messages, saga du raid avec le Village, canal temps réel des ports, contributeur de données personnelles, projection du Classement pour l'or pillé.
- Références : OWASP Top 10 (A01 Broken Access Control, A03 Injection, A04 Insecure Design, A08 Software and Data Integrity Failures) ; ADR 0010 à 0013.

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| F1 | Toutes les routes de la Flotte sont réservées aux joueurs connectés | Test « refuse une requête anonyme sur chaque route (401) » ; lecture de `create-api.ts` | Le test envoie une requête anonyme sur chacune des sept routes et reçoit 401. `create-api.ts` protège `/fleet/*` par `requireUser`, avant le montage de `fleet.api`. | Conforme |
| F2 | Un joueur ne lance, ne rappelle un raid et ne choisit une posture qu'en son propre nom | Lecture de `api.ts` ; test « ne prend jamais le nom de la cible ni l'identité de l'attaquant dans la requête » | Les commandes utilisent `c.var.userId` et `c.var.userName`. `LaunchRaidInput` ne contient que la cible, le nombre de trirèmes et la tactique : une requête qui ajoute `attackerId`, `attackerName` ou un nom de cible voit ces champs ignorés, le raid est enregistré au nom d'Alice et la cible porte le nom de son village (« Port de bob »). `PUT /harbor/posture` ne reçoit que la posture. | Conforme |
| F3 | Seul l'attaquant peut rappeler sa flotte, et seulement avant l'arrivée | Test d'API « rend l'équipement à l'attaquant qui rappelle sa flotte... » ; test du domaine « règle 6 » | Le rappel par Bob, défenseur, répond 403 `NOT_ATTACKER` ; un second rappel répond 409. Le domaine refuse aussi le rappel après l'heure d'arrivée (`ALREADY_ARRIVED`) : un joueur ne peut pas récupérer son équipement une fois la bataille perdue. | Conforme |
| F4 | Toutes les entrées sont validées : nombre de trirèmes, tactique, nature de la cible | Test « valide le corps des commandes (400) » | Onze trirèmes, une tactique inconnue (`canon`), une cible de nature inconnue et une posture inconnue répondent 400 `INVALID_INPUT`. Le domaine refuse en outre un nombre non entier (`INVALID_FLEET`), contrôle redondant pour un appel qui ne passerait pas par l'API. | Conforme |
| F5 | Un raid ne crée ni ne détruit de ressources | Tests « livre la bataille à l'arrivée de la flotte... », « annule le raid lorsque le village de l'attaquant ne peut pas l'équiper », « exporte les raids du joueur, et retire son village des cibles à l'effacement » | Les stocks d'Alice et de Bob sont comparés à ceux de Carol, qui ne fait que produire : après un pillage, Alice a exactement `-45 + 30` bois et Bob `-30` ; après une annulation, le stock d'Alice est inchangé ; après l'abandon d'un raid dont la cible a été effacée, l'équipement est rendu en totalité. | Conforme |
| F6 | Un message remis plusieurs fois n'a d'effet qu'une fois | Tests du domaine « ignore une réponse en double ou inattendue » et « n'enregistre qu'une fois le même avis d'un raid » ; test du Village « n'a qu'un effet... lorsqu'un message est remis deux fois » | Les tests réussissent : la réponse d'équipement rejouée sur un raid en mer ne produit aucun événement ; un avis déjà reçu par un port n'est pas enregistré une seconde fois ; le Village ignore un identifiant de mouvement déjà traité, et ces identifiants sont propres à chaque étape d'un raid. | Conforme |
| F7 | Le défenseur ne connaît jamais la tactique de la flotte avant la bataille | Tests « montre le raid au défenseur sans sa tactique... » et « prélève l'équipement, met la flotte en mer et la signale au défenseur » | La vue du raid lue par Bob indique `tactic: null` et `cost: null` ; le journal de son port, transmis par son canal, ne contient pas le mot `ram`. Après la bataille, la tactique est révélée dans le rapport, comme dans le jeu. | Conforme |
| F8 | Un joueur ne lit que les raids qui le concernent, et que le canal de son propre port | Tests « montre le raid... à aucun autre joueur » et « n'ouvre le canal d'un port qu'à son propriétaire » | Carol reçoit 404 sur un raid d'Alice contre Bob, sans distinction avec un raid inexistant. Alice reçoit 403 sur `/api/stream/harbor-bob/events`, Bob reçoit ses propres événements. | Conforme |
| F9 | La boîte d'envoi, qui conserve les messages traités, ne contient aucun nom de joueur | Test « ne recopie aucun nom de joueur dans les avis conservés par la boîte d'envoi » ; lecture des messages de mouvement | Les avis `fleet.notice` ne portent que `playerId`, `raidId` et `notice` ; les noms sont relus dans le raid au moment de l'enregistrement de l'avis. Les messages de mouvement ne portent que des identifiants et des quantités, comme ceux du Marché. | Conforme |
| F10 | L'effacement d'un compte retire son nom des raids, des ports et du modèle de lecture, et son village des cibles | Tests « exporte les raids du joueur, et retire son village des cibles à l'effacement » et « efface le nom de l'attaquant des ports qui ont vu sa flotte » | Après l'effacement de Bob, son village disparaît des cibles et le raid qui le visait affiche « Village effacé » ; après l'effacement d'Alice, le port de Bob affiche « Joueur effacé » pour la flotte repérée. La projection ignore un village dont le nom est neutre, si bien qu'une reconstruction donne le même résultat. | Conforme |
| F11 | Un joueur ne peut pas faire partir plus de deux flottes à la fois | Test « refuse un raid contre son village... et un troisième raid en mer » ; lecture de `fleet-service.ts` | Le troisième raid séquentiel répond 409 `TOO_MANY_RAIDS`. La règle est toutefois vérifiée sur le modèle de lecture, hors de toute transaction : deux lancements simultanés peuvent la franchir (DT-014). L'enjeu est limité : chaque flotte est payée, et le nombre d'avis reçus par un port reste borné par la vitesse à laquelle un attaquant paie des flottes. | Risque accepté (DT-014) |
| F12 | Le Classement ne compte que l'or réellement pillé | Test de projection « ajoute à l'or du joueur celui que ses flottes ont pillé... » ; test d'API « pille le trésor de l'île, l'ajoute au classement... » | Seul `RaidPlundered` est lu, et seul son champ `gold` : un pillage sans or n'ajoute rien, et le meilleur butin des expéditions n'est pas modifié. L'or pillé dans l'île pirate (8) apparaît dans le classement d'Alice. | Conforme |

## Synthèse

- Conformes : 11 (F1 à F10, F12).
- Non conforme : aucune.
- Risque accepté : 1 (F11), le franchissement de la limite de deux flottes en mer par deux
  lancements simultanés, consigné dans la dette DT-014.

Actions décidées :

- sérialiser les lancements d'un même joueur, par un flux d'amirauté par attaquant, si la limite
  de flottes en mer devient une règle économique stricte (DT-014) ;
- fixer une durée de conservation des avis des ports avant l'ouverture du jeu à un large public
  (DT-016) ;
- garder, pour tout nouveau message de la Flotte, des identifiants seulement dans la charge utile,
  et le vérifier par un test, comme pour `fleet.notice`.
