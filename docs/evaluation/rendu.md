# Rendu de l'évaluation

- Auteur : Swixos
- Module : `fleet` (La Flotte)
- Adresse du déploiement : https://royaumes-pi.vercel.app
- Fiche de cadrage : [fiche-cadrage.md](fiche-cadrage.md)

## Exigences minimales

| N° | Fichiers principaux | Tests qui la vérifient |
| --- | --- | --- |
| E1 | `src/modules/fleet/` : `domain/` (`naval.ts`, `battle.ts`, `pirates.ts`, `raid.ts`, `harbor.ts`, `saga.ts`, `view.ts`), `application/` (`fleet-service.ts`, `army-rules.ts`, ports `fleet-reader.ts` et `raid-repository.ts`), `infrastructure/` (`schema.ts`, `fleet-projection.ts`, `drizzle-fleet-reader.ts`, `event-store-repositories.ts`), `api.ts`, `messages.ts`, `personal-data.ts`, `index.ts`, `contracts.ts`, `ui.tsx` | Règles `module-encapsulation`, `pure-domain`, `application-ignores-infrastructure` et `client-without-server-code` de `pnpm lint:archi` (0 violation) |
| E2 | `src/bootstrap/create-api.ts` (module, gestionnaires, canal, contributeur, `requireUser`, route `/fleet`) ; `app/(jeu)/fleet/page.tsx` ; entrée « Flotte » de la navigation | `src/bootstrap/fleet-api.test.ts` (toutes les routes répondent sous `/api/fleet`) ; `e2e/fleet.spec.ts` (ouverture de la Flotte depuis la navigation) |
| E3 | `src/modules/fleet/domain/` : fonctions pures `decide`, `evolve`, `requestsFor`, `noticeOf`, `fightArmies`, `captainReserve`, `crossingMinutes` ; l'heure, la garnison et les valeurs des unités sont passées en paramètres | `domain/raid.test.ts`, `domain/battle.test.ts` et `domain/naval.test.ts` (47 tests) ; fonction d'aptitude « garde le domaine de la Flotte déterministe : ni horloge, ni hasard » |
| E4 | Journal d'événements selon le modèle decider : flux `raid-<id>` et `harbor-<joueur>`, concurrence optimiste par `withOptimisticRetry` ; modèle de lecture dans le schéma `fleet`, migrations `drizzle/0013_flotte.sql` et `drizzle/0019_troupes.sql` ; ADR 0010 | « ignore une réponse en double ou inattendue », « n'enregistre qu'une fois le même avis d'un raid » ; fonction d'aptitude « range chaque table dans le schéma d'une brique de la plateforme ou d'un module » |
| E5 | `api.ts` : aucune route n'accepte l'identité de l'acteur ; `LaunchRaidInput` et `TargetsQuery` dans `contracts.ts` ; `requireUser` sur `/fleet/*` | « refuse une requête anonyme sur chaque route (401) », « valide le corps des commandes (400) », « ne prend jamais le nom de la cible ni l'identité de l'attaquant dans la requête », « ramène l'armée rappelée après le temps déjà passé en mer... » (rappel par le défenseur : 403), « montre le raid au défenseur sans l'armée, et ne le montre à aucun autre joueur », « n'ouvre le canal d'un port qu'à son propriétaire » ; « refuse une requête anonyme sur toute route qui ne figure pas dans la liste des routes publiques » |
| E6 | Village : messages `realm.withdraw` et `realm.deposit` pour les unités et les ressources, réponses sur `fleet.transfer-result` (`messages.ts`, `fleet-service.ts`), lecture de `VillageFounded`, `BuildingUpgraded` et des mouvements d'unités (`fleet-projection.ts`, version 3) ; Classement : lecture de `RaidPlundered` (`ranking-projection.ts`) ; ADR 0011 et 0023 | « fait partir l'armée du village, met la flotte en mer et la signale au défenseur », « livre la bataille contre la garnison, tue les défenseurs, pille le village et rentre avec le butin », « compte le rempart du village une fois achevé, par le langage publié du Village », « pille le trésor de l'île, l'ajoute au classement... », test de projection « ajoute à l'or du joueur celui que ses flottes ont pillé... » |
| E7 | `src/modules/fleet/personal-data.ts` (export, `redact`, `erase`, `rename`, `rectify`), enregistré dans `createPrivacyService` ; traitement T8 du registre | « exporte les raids du joueur, et retire son village des cibles à l'effacement », « efface le nom de l'attaquant des ports qui ont vu sa flotte », « ne recopie aucun nom de joueur dans les avis conservés par la boîte d'envoi », fonction d'aptitude « déclare les données personnelles de chaque module qui conserve des données » |
| E8 | Correspondance règle par règle ci-dessous ; une route au moins par test d'API | `domain/raid.test.ts`, `domain/battle.test.ts`, `domain/naval.test.ts`, `src/bootstrap/fleet-api.test.ts` (20 tests) |
| E9 | `.dependency-cruiser.cjs` et `src/bootstrap/architecture.test.ts` inchangés dans leurs règles existantes | `pnpm verify` : 0 violation, fonctions d'aptitude réussies |
| E10 | Migrations `0013_flotte` et `0019_troupes` appliquées au déploiement ; aucune variable d'environnement nouvelle | Parcours sur le déploiement de production : préparer un raid, lancer une armée contre une île pirate, lire le rapport, exporter puis supprimer un compte de test |

Correspondance entre les règles de la fiche et les tests (E8) :

| Règle | Tests |
| --- | --- |
| 1 | « règle 1 : une armée compte au moins un navire, et ses troupes tiennent dans les cales » ; « demande au moins un navire, et assez de cales pour les troupes » |
| 2 | « règle 2 : refuse un raid contre son propre village, ou contre un joueur sans village » ; test d'API « refuse un raid sans navire, contre son village, contre un joueur sans village, et un troisième raid en mer » |
| 3 | « règle 3 : refuse un troisième raid en mer, sauf avec un grand chantier naval » |
| 4 | « règle 4 : fait partir l'armée du village, et annule le raid si elle n'y est pas » ; test d'API « annule le raid lorsque l'attaquant n'a pas les troupes demandées » |
| 5 | « règle 5 : la traversée dure de 1 à 7 minutes, la même dans les deux sens » ; « règle 5 : plus la cible est loin sur la carte, plus la traversée est longue » ; « règle 5 : aucun village ne se pose sur une île pirate » ; « règle 5 : vogue au pas du navire le plus lent, plus vite avec le chantier naval » ; « règle 5 : la flotte part, se signale au défenseur et se rappelle à son arrivée » |
| 6 | « règle 6 : seul l'attaquant rappelle son armée, qui rentre après le temps déjà passé en mer » ; test d'API « ramène l'armée rappelée après le temps déjà passé en mer... » |
| 7 | « coule la flotte battue avec ses troupes, sans bataille sur terre » ; « détruit les birèmes du défenseur, puis débarque les troupes » ; « fait perdre au vainqueur une part qui croît avec la force du vaincu » |
| 8 | « pèse la défense de chaque unité selon les dégâts reçus, puis ajoute le rempart » ; « laisse la victoire au défenseur à égalité, et perd toute la troupe vaincue » ; « règle 8 : une armée battue meurt, le défenseur compte ses morts, et les deux reçoivent le rapport » |
| 9 | « demande au village le butin des cales, réparti entre les ressources » ; « règle 9 : une armée victorieuse demande au village le butin de ses survivants » ; « règle 9 : réduit le butin une seule fois à ce que possède le village » |
| 10 | Tests d'API « montre la garnison du village, qui le défend » et « perd ses troupes contre une garnison plus forte, qui compte ses propres morts » |
| 11 | « règle 11 : le capitaine appelle en renfort l'unité qui pare l'arme favorite de l'attaquant » ; « retient le type de dégâts qui porte la plus grande part de son attaque » ; test d'API « fait appeler au capitaine un renfort contre l'arme favorite de l'attaquant » |
| 12 | « règle 12 : le trésor d'une île ne se pille qu'une fois par joueur et par jour » ; test d'API « pille le trésor de l'île... et refuse une seconde attaque le même jour » |

Les tests préfixés « trirèmes (avant l'ADR 0023) » vérifient les règles des raids de trirèmes
enregistrés avant le passage aux armées : ces raids se rejouent toujours avec leurs règles.

## Bonus revendiqués

| N° | Description | Fichiers | Tests | Documentation |
| --- | --- | --- | --- | --- |
| B1 | Canal temps réel `harbor-<joueur>`, réservé à son propriétaire : flottes en approche, demi-tours, rapports de bataille | `index.ts` (règle d'accès), `harbor.ts`, `ui.tsx` (`useChannel`, alerte, rapport animé) | « n'ouvre le canal d'un port qu'à son propriétaire » | ADR 0011 ; README, section « Temps réel » |
| B2 | Arrivée des flottes en échéance sans tâche de fond : message différé `fleet.arrive`, ou première lecture après l'heure d'arrivée | `fleet-service.ts` (`settle`, `arrive`), `raid.ts` (`ResolveArrival`) | « refuse l'arrivée avant son heure, et l'ignore une fois la flotte rentrée » ; « livre la bataille contre la garnison, tue les défenseurs, pille le village et rentre avec le butin » | ADR 0012 ; README, section « La Flotte » |
| B3 | Capitaines pirates pilotés par une IA déterministe, qui appellent en renfort l'unité parant l'arme favorite de l'attaquant | `domain/pirates.ts` (`captainReserve`), `raid.ts` (`arrive`) | « règle 11 : le capitaine appelle en renfort l'unité qui pare l'arme favorite de l'attaquant » ; « fait appeler au capitaine un renfort contre l'arme favorite de l'attaquant » | ADR 0013 et 0023 |
| B4 | Modèle de lecture des cibles, des garnisons et des raids, projection `fleet` version 3 avec son point de reprise | `fleet-projection.ts`, `drizzle-fleet-reader.ts`, `schema.ts`, migrations `0013_flotte` et `0019_troupes` | « liste les villages des autres joueurs, les îles pirates et les troupes prêtes à partir », « cherche un port par une partie de son nom... », « compte le rempart du village une fois achevé... » | ADR 0010 ; `docs/architecture.md` |
| B5 | Saga du raid avec étape compensable : armée retirée du village au lancement, rendue au rappel ou si la cible disparaît | `domain/saga.ts`, `raid.ts`, `fleet-service.ts` | « ramène l'armée rappelée après le temps déjà passé en mer... », « ramène l’armée lorsque le village visé a disparu pendant la traversée », « exporte les raids du joueur, et retire son village des cibles à l'effacement » (raid abandonné, armée rendue) | ADR 0012 et 0023 ; diagramme de séquence de `docs/architecture.md` |
| B6 | Communication avec deux modules existants : Village (messages et langage publié) et Classement (langage publié de la Flotte) | `messages.ts`, `fleet-projection.ts`, `src/modules/ranking/infrastructure/ranking-projection.ts` | « pille le trésor de l'île, l'ajoute au classement... » ; test de projection « ajoute à l'or du joueur celui que ses flottes ont pillé... » | ADR 0011 |
| B7 | Test de charge des trois lectures de la Flotte, dans le budget (p99 de 389, 433 et 140 ms pour 500 ms, 0 erreur) | `scripts/load-test.ts`, `perf/flotte.json` | Le test de charge lui-même, qui confronte les résultats au budget de `perf/budget.json` | README, section « Performance » ; bilan technique |
| B8 | Fonction d'aptitude : le domaine de la Flotte ne lit ni l'horloge ni le hasard | `src/bootstrap/architecture.test.ts` | « garde le domaine de la Flotte déterministe : ni horloge, ni hasard » | ADR 0013 ; `docs/architecture.md` |
| B9 | Interface graphique « WHOUAAAA » : écran de jeu unique, village isométrique animé, carte des mers avec flottes en mouvement, rapports de bataille animés, arène animée des Profondeurs | `src/modules/realm/scene/`, `src/modules/fleet/scene/`, `src/modules/fleet/ui.tsx`, `src/modules/dungeon/ui.tsx`, `src/modules/dungeon/scene/art.tsx` | Parcours e2e de `e2e/fleet.spec.ts`, `e2e/dungeon.spec.ts` et `e2e/tutorial.spec.ts` | ADR 0016, 0017, 0019, 0020 et 0024 ; README |
| B10 | Tests de bout en bout Playwright, sur une construction de production : préparation d'un raid contre une île pirate et contre un port, garnison, rectification du nom, expédition au Donjon, tutoriel | `e2e/fleet.spec.ts`, `e2e/dungeon.spec.ts`, `e2e/tutorial.spec.ts`, `playwright.config.ts` | Les six parcours de `pnpm test:e2e` | README, section « Tests de bout en bout » |
| B11 | Droit de rectification du nom, partout où il est recopié | `src/platform/privacy/privacy.ts`, `privacy-api.ts`, contributeurs des modules, `src/ui/account-screen.tsx` | « remplace le nom du joueur dans son compte, le journal et les tables de tous les modules », « n'enregistre rien au registre des effacements... », « donne le même classement après une reconstruction de la projection » (rectification), parcours e2e « corrige le nom du joueur, repris par la navigation » | ADR 0015 ; registre des traitements ; revue de conformité (R12) |
| B12 | Jeton signé HMAC-SHA256, valable une minute, à la place du secret partagé entre l'application et le service Village | `src/platform/http/service-auth.ts`, `inbox-api.ts`, `village-service.ts` | « refuse toute requête au service qui ne porte pas un jeton signé du secret partagé (401) », « refuse un jeton expiré, ou dont l'identité du joueur a été modifiée (401) » | ADR 0014 |
| B13 | Piste « Généraliser le contrôle d'accès » du TD4 : toute route non publique refuse une requête anonyme | `src/bootstrap/create-api.test.ts` | « refuse une requête anonyme sur toute route qui ne figure pas dans la liste des routes publiques » | `docs/architecture.md` ; revue de sécurité de la Flotte (F1) |

## Écarts avec la fiche de cadrage

Le périmètre a évolué pendant la réalisation : les raids de trirèmes armées au départ, avec
leur triangle de tactiques et la posture des ports, ont été remplacés par des armées formées au
village, et des batailles navale puis terrestre inspirées de Grepolis (ADR 0023). La fiche a
été mise à jour en conséquence : les règles 1, 4 et 6 à 11 décrivent désormais les armées, et
la route `PUT /api/fleet/harbor/posture` a disparu. Les raids de trirèmes déjà enregistrés se
rejouent toujours avec leurs anciennes règles, que vérifient les tests préfixés
« trirèmes (avant l'ADR 0023) ».

Deux précisions ont aussi été apportées :

- la règle 12 compte les attaques d'une île, et non ses pillages : un raid annulé ou rappelé
  ne compte pas, mais une défaite compte ;
- la route des cibles accepte une recherche par nom (`?search=`), pour atteindre un village
  qui ne figure pas parmi les douze plus proches.

## Indicateurs au rendu

| Indicateur | À l'étiquette `td11-fin` | Au rendu |
| --- | --- | --- |
| Nombre de tests | 232 | 385 tests Vitest, et 6 parcours de bout en bout |
| Couverture des lignes | 75 % | 47,6 % ; 93,7 % hors interfaces (`ui.tsx`, scènes et `src/ui`), couvertes par les tests de bout en bout |
| Violations des règles d'architecture | 0 | 0 |

## Usage de l'IA générative

Outil utilisé : un assistant de code à base d'IA générative, utilisé en ligne de commande dans
le dépôt.

- **Idées et cadrage** : le choix du module, l'inspiration de Grepolis, les fonctionnalités
  (raids, troupes, caserne et ferme, tutoriel, historique, refonte du Donjon) et les priorités
  viennent de moi. L'assistant a parfois proposé des idées ou des variantes, que j'ai retenues
  ou écartées.
- **Code** : une part importante du code a été écrite par l'assistant à partir de mes
  consignes, puis reprise à ma demande quand le résultat ne me convenait pas (affichage,
  alignements, défilement sur téléphone, temps de trajet, lisibilité des coûts).
- **Tests** : les tests du domaine, de l'API et de bout en bout ont été rédigés en grande
  partie par l'assistant, sur les règles de la fiche de cadrage.
- **Documents** : les ADR, le README, la documentation d'architecture et les documents de
  qualité ont été rédigés en partie avec l'assistant, puis relus et corrigés.

Vérification : `pnpm verify` (lint, typage, règles d'architecture et tests) et les tests de
bout en bout avant chaque envoi ; essais du jeu sur le déploiement, sur ordinateur et sur
téléphone, avec les défauts relevés puis corrigés ; relecture des documents et de leur
cohérence avec le code.
