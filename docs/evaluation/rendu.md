# Rendu de l'évaluation

- Auteur : Swixos
- Module : `fleet` (La Flotte)
- Adresse du déploiement : https://royaumes-pi.vercel.app
- Fiche de cadrage : [fiche-cadrage.md](fiche-cadrage.md)

## Exigences minimales

| N° | Fichiers principaux | Tests qui la vérifient |
| --- | --- | --- |
| E1 | `src/modules/fleet/` : `domain/` (`naval.ts`, `pirates.ts`, `raid.ts`, `harbor.ts`, `saga.ts`, `view.ts`), `application/` (`fleet-service.ts`, ports `fleet-reader.ts` et `raid-repository.ts`), `infrastructure/` (`schema.ts`, `fleet-projection.ts`, `drizzle-fleet-reader.ts`, `event-store-repositories.ts`), `api.ts`, `messages.ts`, `personal-data.ts`, `index.ts`, `contracts.ts`, `ui.tsx` | Règles `module-encapsulation`, `pure-domain`, `application-ignores-infrastructure` et `client-without-server-code` de `pnpm lint:archi` (0 violation) |
| E2 | `src/bootstrap/create-api.ts` (module, gestionnaires, canal, contributeur, `requireUser`, route `/fleet`) ; `app/(jeu)/fleet/page.tsx` ; entrée « Flotte » de `src/ui/app-shell.tsx` | `src/bootstrap/fleet-api.test.ts` (toutes les routes répondent sous `/api/fleet`) ; `e2e/fleet.spec.ts` (ouverture de la Flotte depuis la navigation) |
| E3 | `src/modules/fleet/domain/` : fonctions pures `decide`, `evolve`, `requestsFor`, `noticeOf`, `fight`, `captainPosture`, `decideHarbor` ; l'heure et le contexte sont passés en paramètres | `domain/naval.test.ts` et `domain/raid.test.ts` (30 tests, un par règle au moins) ; fonction d'aptitude « garde le domaine de la Flotte déterministe : ni horloge, ni hasard » |
| E4 | Journal d'événements selon le modèle decider : flux `raid-<id>` et `harbor-<joueur>`, concurrence optimiste par `withOptimisticRetry` ; modèle de lecture dans le schéma `fleet`, migration `drizzle/0013_flotte.sql` ; ADR 0010 | « ignore une réponse en double ou inattendue », « n'enregistre qu'une fois le même avis d'un raid » ; fonction d'aptitude « range chaque table dans le schéma d'une brique de la plateforme ou d'un module » |
| E5 | `api.ts` : aucune route n'accepte l'identité de l'acteur ; `LaunchRaidInput`, `ChoosePostureInput`, `TargetsQuery` dans `contracts.ts` ; `requireUser` sur `/fleet/*` | « refuse une requête anonyme sur chaque route (401) », « valide le corps des commandes (400) », « ne prend jamais le nom de la cible ni l'identité de l'attaquant dans la requête », « rend l'équipement à l'attaquant qui rappelle sa flotte... » (rappel par le défenseur : 403), « montre le raid au défenseur sans sa tactique, et ne le montre à aucun autre joueur », « n'ouvre le canal d'un port qu'à son propriétaire » ; « refuse une requête anonyme sur toute route qui ne figure pas dans la liste des routes publiques » |
| E6 | Village : messages `realm.withdraw` et `realm.deposit`, réponses sur `fleet.transfer-result` (`messages.ts`, `fleet-service.ts`), lecture de `VillageFounded` et `BuildingUpgraded` (`fleet-projection.ts`) ; Classement : lecture de `RaidPlundered` (`ranking-projection.ts`, version 3) ; ADR 0011 | « prélève l'équipement, met la flotte en mer et la signale au défenseur », « livre la bataille à l'arrivée de la flotte, à la première lecture, et pille le village », « compte les améliorations du village dans sa défense, par le langage publié du Village », « pille le trésor de l'île, l'ajoute au classement... », test de projection « ajoute à l'or du joueur celui que ses flottes ont pillé... » |
| E7 | `src/modules/fleet/personal-data.ts` (export, `redact`, `erase`, `rename`, `rectify`), enregistré dans `createPrivacyService` ; traitement T8 du registre | « exporte les raids du joueur, et retire son village des cibles à l'effacement », « efface le nom de l'attaquant des ports qui ont vu sa flotte », « ne recopie aucun nom de joueur dans les avis conservés par la boîte d'envoi », fonction d'aptitude « déclare les données personnelles de chaque module qui conserve des données » |
| E8 | Correspondance règle par règle ci-dessous ; une route au moins par test d'API | `domain/naval.test.ts`, `domain/raid.test.ts`, `src/bootstrap/fleet-api.test.ts` (20 tests) |
| E9 | `.dependency-cruiser.cjs` et `src/bootstrap/architecture.test.ts` inchangés dans leurs règles existantes | `pnpm verify` : 0 violation, 3 fonctions d'aptitude réussies |
| E10 | Migration `0013_flotte` appliquée par `pnpm vercel-build` ; aucune variable d'environnement nouvelle | Parcours sur le déploiement de production, à réaliser après la fusion : deux comptes, un raid, l'alerte, le rappel, puis l'export et la suppression d'un compte de test |

Correspondance entre les règles de la fiche et les tests du domaine (E8) :

| Règle | Test |
| --- | --- |
| 1 | « règle 1 : un raid engage de 1 à 10 trirèmes » |
| 2 | « règle 2 : refuse un raid contre son propre village, ou contre un joueur sans village » |
| 3 | « règle 3 : refuse un troisième raid en mer » |
| 4 | « règle 4 : l'équipement coûte 15 bois et 5 pierre par trirème » ; « règle 4 : prélève l'équipement avant le départ, et annule le raid s'il n'est pas payé » |
| 5 | « règle 5 : la traversée dure de 2 à 6 minutes, la même dans les deux sens » ; « règle 5 : la traversée vers une île pirate est fixe » ; « règle 5 : la flotte part pour la durée de la traversée... » |
| 6 | « règle 6 : seul l'attaquant rappelle sa flotte avant l'arrivée, et récupère tout son équipement » |
| 7 | « règle 7 : l'abordage bat l'éperonnage, l'éperonnage bat le blocus, le blocus bat l'abordage » |
| 8 | « règle 8 : la défense vaut 20 plus 5 par amélioration... » ; « règle 8 : une flotte dont la force ne dépasse pas la défense est perdue... » |
| 9 | « règle 9 : les cales emportent au plus 10 bois, 5 pierre et 2 or par trirème » ; « règle 9 : une flotte victorieuse demande le butin de ses cales au village » ; « règle 9 : réduit le butin une seule fois... » ; « règle 9 : rentre sans butin lorsque le village ne possède rien » |
| 10 | « règle 10 : un village sans posture choisie défend en blocus » ; « règle 10 : enregistre la posture choisie... » |
| 11 | « règle 11 : joue l'abordage sans historique ou à égalité » ; « règle 11 : contre la tactique que l'attaquant a le plus employée » ; « règle 11 : donne toujours la même posture pour le même historique » ; « règle 11 : le capitaine contre la tactique favorite de l'attaquant » |
| 12 | « règle 12 : le trésor d'une île ne se pille qu'une fois par joueur et par jour » ; test d'API « pille le trésor de l'île... et refuse une seconde attaque le même jour » |

## Bonus revendiqués

| N° | Description | Fichiers | Tests | Documentation |
| --- | --- | --- | --- | --- |
| B1 | Canal temps réel `harbor-<joueur>`, réservé à son propriétaire : flottes en approche, demi-tours, rapports de bataille | `index.ts` (règle d'accès), `harbor.ts`, `ui.tsx` (`useChannel`, alerte, animation de bataille) | « n'ouvre le canal d'un port qu'à son propriétaire » ; parcours e2e « lance un raid, alerte le défenseur en temps réel, puis rappelle la flotte » | ADR 0011 ; README, section « Temps réel » |
| B2 | Arrivée des flottes en échéance sans tâche de fond : message différé `fleet.arrive`, ou première lecture après l'heure d'arrivée | `fleet-service.ts` (`settle`, `arrive`), `raid.ts` (`ResolveArrival`) | « refuse l'arrivée avant son heure, et l'ignore une fois la flotte rentrée » ; « livre la bataille à l'arrivée de la flotte, à la première lecture, et pille le village » | ADR 0012 ; README, section « La Flotte » |
| B3 | Capitaines pirates pilotés par une IA déterministe, qui pare la tactique favorite de l'attaquant | `domain/pirates.ts`, `raid.ts` (`arrive`) | Tests « règle 11 » du domaine ; « fait jouer au capitaine la parade de la tactique favorite de l'attaquant » | ADR 0013 |
| B4 | Modèle de lecture des cibles et des raids, projection `fleet` version 1 avec son point de reprise | `fleet-projection.ts`, `drizzle-fleet-reader.ts`, `schema.ts`, migration `0013_flotte` | « liste les villages des autres joueurs et les îles pirates », « cherche un port par une partie de son nom... », « compte les améliorations du village dans sa défense... » | ADR 0010 ; `docs/architecture.md` |
| B5 | Saga du raid avec étape compensable : équipement prélevé au lancement, rendu au rappel ou si la cible disparaît | `domain/saga.ts`, `raid.ts`, `fleet-service.ts` | « rend l'équipement à l'attaquant qui rappelle sa flotte... », « rend l'équipement lorsque le village visé a disparu pendant la traversée », « exporte les raids du joueur, et retire son village des cibles à l'effacement » (raid abandonné, équipement rendu) | ADR 0012 ; diagramme de séquence de `docs/architecture.md` |
| B6 | Communication avec deux modules existants : Village (messages et langage publié) et Classement (langage publié de la Flotte) | `messages.ts`, `fleet-projection.ts`, `src/modules/ranking/infrastructure/ranking-projection.ts` | « pille le trésor de l'île, l'ajoute au classement... » ; test de projection du Classement « ajoute à l'or du joueur celui que ses flottes ont pillé... » | ADR 0011 |
| B7 | Test de charge des trois lectures de la Flotte, dans le budget (p99 de 389, 433 et 140 ms pour 500 ms, 0 erreur) | `scripts/load-test.ts`, `perf/flotte.json` | Le test de charge lui-même, qui confronte les résultats au budget de `perf/budget.json` | README, section « Performance » ; bilan technique |
| B8 | Fonction d'aptitude : le domaine de la Flotte ne lit ni l'horloge ni le hasard | `src/bootstrap/architecture.test.ts` | « garde le domaine de la Flotte déterministe : ni horloge, ni hasard » | ADR 0013 ; `docs/architecture.md` |
| B10 | Tests de bout en bout Playwright, sur une construction de production : raid, alerte et rappel ; posture et prévision ; rectification | `e2e/fleet.spec.ts`, `playwright.config.ts` | Les trois parcours de `pnpm test:e2e` | README, section « Tests de bout en bout » |
| B11 | Droit de rectification du nom, partout où il est recopié | `src/platform/privacy/privacy.ts`, `privacy-api.ts`, contributeurs des modules, `src/ui/account-screen.tsx` | « remplace le nom du joueur dans son compte, le journal et les tables de tous les modules », « n'enregistre rien au registre des effacements... », « donne le même classement après une reconstruction de la projection » (rectification), parcours e2e « corrige le nom du joueur... » | ADR 0015 ; registre des traitements ; revue de conformité (R12) |
| B12 | Jeton signé HMAC-SHA256, valable une minute, à la place du secret partagé entre l'application et le service Village | `src/platform/http/service-auth.ts`, `inbox-api.ts`, `village-service.ts` | « refuse toute requête au service qui ne porte pas un jeton signé du secret partagé (401) », « refuse un jeton expiré, ou dont l'identité du joueur a été modifiée (401) » | ADR 0014 |
| B13 | Piste « Généraliser le contrôle d'accès » du TD4 : toute route non publique refuse une requête anonyme | `src/bootstrap/create-api.test.ts` | « refuse une requête anonyme sur toute route qui ne figure pas dans la liste des routes publiques » | `docs/architecture.md` ; revue de sécurité de la Flotte (F1) |

## Écarts avec la fiche de cadrage

Aucun écart de périmètre : les douze règles et les sept routes annoncées sont réalisées. Deux
précisions ont été apportées à la fiche pendant la réalisation :

- la règle 12 compte les attaques d'une île, et non ses pillages : un raid annulé ou rappelé
  ne compte pas, mais une défaite compte ;
- la route des cibles accepte une recherche par nom (`?search=`), pour atteindre un village
  qui ne figure pas parmi les douze plus proches.

## Indicateurs au rendu

| Indicateur | À l'étiquette `td11-fin` | Au rendu |
| --- | --- | --- |
| Nombre de tests | 232 | 290 tests Vitest, et 3 parcours de bout en bout |
| Couverture des lignes | 75 % | 72,2 % (79,7 % hors interface de la Flotte, couverte par les tests de bout en bout) |
| Violations des règles d'architecture | 0 | 0 |

## Usage de l'IA générative

