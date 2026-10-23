# Bilan technique de Royaumes

- Date : 2026-10-23
- Version examinée : rendu de l'évaluation (étiquette `eval-fin`), comparée à l'étiquette `td11-fin`
- Auteur : Swixos

Ce bilan dresse l'état technique du projet au terme de son développement, à partir de ses
décisions d'architecture, de ses indicateurs de qualité, de sa dette technique et de ses
revues. Il s'adresse à la personne qui reprendrait le projet.

## 1. Le système livré

| Élément | Valeur |
| --- | --- |
| Modules métier | 7 : `realm`, `dungeon`, `market`, `ranking`, `tavern`, `fleet`, `system` |
| Briques de la plateforme | 9 : `auth`, `cron`, `db`, `event-store`, `http`, `outbox`, `privacy`, `projection`, `realtime` ; plus le service Village extrait (`src/services/village`) |
| Lignes de code, hors tests | Environ 13 700 (`src` et `app`, commentaires TSDoc compris), contre environ 9 500 à `td11-fin` |
| Fichiers de test, nombre de tests | 36 fichiers, 290 tests Vitest, et 3 parcours de bout en bout (Playwright) ; 33 fichiers et 232 tests à `td11-fin` |
| Commits | 159 sur la branche de l'évaluation au moment du bilan, fusions comprises ; 136 à `td11-fin` |
| Hébergement | Vercel (Francfort), base Neon (Francfort) |

| Module | Stockage | Lignes, hors tests |
| --- | --- | --- |
| `realm` | Event Sourcing | 1 218, dont 164 pour le module distant |
| `dungeon` | Event Sourcing, projection des expéditions ouvertes | 2 354 |
| `market` | Event Sourcing, projection des offres, saga | 1 506 |
| `ranking` | Projection du journal | 538 |
| `tavern` | Tables ordinaires | 838 |
| `system` | Aucun | 81 |
| `fleet` | Event Sourcing (raids et ports), projection des cibles et des raids, saga | 3 935, dont 1 244 pour l'interface |

Le service Village extrait compte 77 lignes : il assemble le module Village, inchangé, avec
sa propre plateforme. La plateforme compte environ 1 870 lignes, dont 363 pour la boîte
d'envoi et 304 pour le temps réel.

## 2. Les décisions d'architecture

| ADR | Décision | Mise à l'épreuve | Bilan |
| --- | --- | --- | --- |
| 0001 | Monolithe modulaire | Extraction du Village (TD11) | A tenu : l'extraction n'a modifié ni le domaine du Village ni les autres modules ; dependency-cruiser n'a signalé aucune violation sur l'ensemble du projet. |
| 0002 | Event Sourcing pour le Village | Ajout des projections (TD8), effacement des données (TD10), extraction (TD11) | A tenu : le journal a permis de calculer après coup le classement et le meilleur butin, et d'extraire le Village par un simple relais ; il a fallu une exception encadrée à l'ajout seul pour l'effacement (ADR 0008). |
| 0003 | Server-Sent Events alimentés par le journal | Canaux discrets (TD6), globaux (TD8), à source propre (TD10) | A tenu, au prix d'une relecture du journal deux fois par seconde par flux ouvert, dont la charge croît avec le nombre de joueurs connectés. |
| 0004 | Manches simultanées et échéances paresseuses | Compagnons et échéance d'exploration (TD7), simulation d'expéditions | A tenu : l'échéance d'exploration a réutilisé le mécanisme sans le modifier, et a remboursé DT-006. |
| 0005 | Intelligence artificielle déterministe | Simulation de milliers d'expéditions et rééquilibrage (TD7) | A tenu : la simulation a révélé une intuition fausse sur la difficulté, corrigée et protégée par des tests statistiques. |
| 0006 | CQRS et projections rattrapées à la lecture | Test de charge (TD11) | A tenu après correction : la mesure a montré que chaque lecture payait une transaction verrouillée ; le chemin rapide a augmenté le débit de 20 à 40 % sans affaiblir les garanties. |
| 0007 | Saga orchestrée et boîte d'envoi | Panne partielle du service Village (TD11), acceptations simultanées (TD9) | A tenu : les messages ont franchi la frontière entre processus sans changement de garanties ; les lettres mortes ont demandé un outil d'exploitation (DT-007, remboursée). |
| 0008 | Taverne sans Event Sourcing, réécriture ciblée du journal | Revue de conformité au RGPD (TD10), suppression d'un compte de test | A tenu : aucun nom effacé ne subsiste dans les tables ; la revue a révélé deux lacunes hors de cette décision (DT-008, DT-009). |
| 0009 | Extraction du Village, préparée mais non déployée | Démonstration à deux processus, tests de contrat (TD11) | Trop récente pour avoir été éprouvée en exploitation ; ses trois dettes (DT-010 à DT-012) conditionnent tout déploiement. Son authentification est remplacée par l'ADR 0014. |
| 0010 | Flotte : journal pour les raids et les ports, projection pour les listes | Rapports de bataille, mémoire des pirates, effacement et rectification | A tenu : les rapports et la mémoire des pirates sont lus dans le journal et sa projection ; les règles transverses vérifiées sur la projection laissent une fenêtre de concurrence (DT-014). |
| 0011 | Communication de la Flotte : messages avec le Village, langages publiés | Saga du raid, Classement de l'or pillé, revue RGPD | A tenu sans modifier le Village ; la revue a montré que les avis devaient ne porter que des identifiants, la boîte d'envoi conservant les messages traités, ce qui a été corrigé avant le rendu. |
| 0012 | Saga du raid avec compensation, arrivée en échéance | Rappel, cible effacée en mer, pillage réduit, test de charge | A tenu : aucune ressource créée ni perdue dans les tests comparés à un joueur témoin ; la résolution à la lecture alourdit les lectures de la Flotte, qui restent dans le budget. |
| 0013 | Batailles déterministes, capitaines pirates sans hasard | Tests de l'IA, fonction d'aptitude | A tenu : la fonction d'aptitude échoue dès qu'un appel au hasard est ajouté au domaine. |
| 0014 | Jeton signé entre l'application et un service | Tests de contrat du service extrait | A tenu sur les tests ; le rejeu dans la minute et l'absence de destinataire restent à traiter avant un déploiement. |
| 0015 | Droit de rectification par la réécriture ciblée du journal | Tests de rectification sur cinq modules, reconstruction de la projection | A tenu : l'effacement est devenu une rectification vers le nom neutre, dans chaque module, sans nouveau mécanisme. |

## 3. La qualité

| Caractéristique | Indicateur | Valeur | Appréciation |
| --- | --- | --- | --- |
| Adéquation fonctionnelle | Tests réussis ; couverture des domaines | 290 tests réussis (232 à `td11-fin`), et 3 parcours de bout en bout ; domaines presque entièrement couverts, celui de la Flotte à 100 % des lignes sauf le port (95 %) | Satisfaisante : chaque règle du jeu, et chacune des douze règles de la Flotte, est vérifiée par des tests exacts, d'invariant ou statistiques. |
| Efficacité des performances | Débit et p99 des lectures ; respect du budget | De 96 à 217 requêtes par seconde ; p99 de 137 à 433 ms sous 20 connexions, dont 389 et 433 ms pour les cibles et les raids de la Flotte (`perf/flotte.json`) | Satisfaisante en local : budget respecté ; les lectures de la Flotte sont les plus lentes, car elles résolvent les arrivées dues, distribuent la boîte d'envoi et lisent tous les villages (DT-015). Non mesurée en production. |
| Fiabilité | Tests de concurrence, de reprise et d'idempotence ; messages abandonnés | Concurrence optimiste, rattrapages simultanés, messages en double et panne du service testés ; aucun message abandonné | Satisfaisante : les chemins d'échec sont testés, et les lettres mortes peuvent être examinées et relancées. |
| Sécurité | Exigences des revues de sécurité | 52 exigences, dont 48 conformes et 4 en risque accepté (40, 37 et 3 à `td11-fin`) ; jeton signé entre services ; toutes les routes non publiques vérifiées anonymement par un test | Satisfaisante : aucune non-conformité ouverte ; les risques acceptés sont consignés et justifiés. |
| Maintenabilité | Règles d'architecture ; fonctions d'aptitude ; couverture | 8 règles de dépendance, 0 violation (inchangé) ; 3 fonctions d'aptitude par les tests (2 à `td11-fin`) ; 72,2 % des lignes couvertes par Vitest (75 % à `td11-fin`), 79,7 % hors interface de la Flotte | Bonne. La baisse de la couverture vient de l'interface de la Flotte (`ui.tsx`, 214 lignes mesurées), couverte par les tests de bout en bout et non par Vitest ; hors cette interface, la couverture progresse. |
| Flexibilité | Extraction d'un module ; changement de base entre local et production | Village extrait sans modification ; PGlite en local et en test, Neon en production | Démontrée : le changement de stockage d'un module ou de son hébergement ne touche pas les autres. |

## 4. La dette technique

| Indicateur | Valeur |
| --- | --- |
| Entrées consignées | 16 (13 à `td11-fin`) |
| Entrées remboursées, dont à l'échéance prévue | 8, toutes à l'échéance prévue ou avant (DT-013 remboursée à l'évaluation) |
| Entrées ouvertes | 8 : DT-008 à DT-012, DT-014 à DT-016 |

Analyse : les sept premières entrées ont toutes été consignées au moment du raccourci, avec
une échéance, et remboursées au TD prévu, ce qui est le signe d'un pilotage. Les entrées
ouvertes sont de deux natures. DT-008, DT-009 et DT-013 ont été découvertes par la revue de
conformité au RGPD, et non au moment où elles ont été créées : les sessions expirées et les
journaux d'erreurs n'avaient fait l'objet d'aucune décision consciente, ce qui montre l'intérêt
des revues. DT-010 à DT-012 concernent le seul service extrait, qui n'est pas en production :
elles ne pèsent sur rien tant que l'ADR 0009 n'est pas remis en cause.

Les trois entrées de la Flotte (DT-014 à DT-016) ont été consignées au moment du raccourci,
avec un marqueur dans le code : la vérification sur le modèle de lecture de règles qui portent
sur plusieurs raids, la lecture de tous les villages pour choisir les cibles, et la conservation
sans limite des avis des ports. Aucune n'est bloquante pour le nombre de joueurs du projet.

## 5. Les revues

| Revue | Exigences | Conformes | Non conformes ou en risque accepté | Actions ouvertes |
| --- | --- | --- | --- | --- |
| Sécurité de l'authentification | 16 | 15 | 1 en risque accepté (S9) | Aucune : le partage des compteurs (DT-004) est remboursé |
| Sécurité du Donjon | 14 | 12 | 2 en risque accepté (D10, D14) | Aucune ; règles de conduite pour les futurs canaux discrets |
| Sécurité du Marché | 10 | 10 | Aucune | Aucune ; règles de conduite pour les futurs messages |
| Sécurité de la Flotte | 12 | 11 | 1 en risque accepté (F11) | DT-014 et DT-016 ; identifiants seuls dans les messages |
| Conformité au RGPD | 12 | 9 | 2 non conformes (R8, R9), 1 en risque accepté (R10) | DT-008, DT-009 ; confirmation de l'accord de traitement de Vercel pour l'offre Hobby |

Chaque action ouverte qui touche au code figure au registre de la dette. La confirmation de
l'accord de traitement des données de Vercel est une action contractuelle : elle est suivie
dans le registre des traitements.

## 6. Risques et recommandations

| N° | Risque | Signe avant-coureur | Recommandation |
| --- | --- | --- | --- |
| 1 | Charge des flux temps réel : chaque flux ouvert relit le journal deux fois par seconde, et la charge de la base croît avec le nombre de joueurs connectés (ADR 0003) | Hausse de l'utilisation de calcul de Neon, ou p99 des lectures qui dépasse le budget lorsque de nombreux joueurs sont connectés | Mesurer la charge avec des flux ouverts dans le test de charge ; envisager une notification par `LISTEN/NOTIFY` de PostgreSQL ou un service de diffusion, consigné dans un nouvel ADR. |
| 2 | Croissance du journal : la reconstruction d'une projection et l'effacement d'un compte parcourent tout le journal, pendant une requête limitée en durée (ADR 0006 et 0008) | Durée d'un effacement ou d'une reconstruction qui approche la durée maximale d'une fonction Vercel | Mesurer ces deux opérations à chaque étiquette ; préparer un script de reconstruction hors requête, et préférer les références sans copie pour les nouveaux événements. |
| 3 | Interface partiellement testée : seuls les parcours de la Flotte et de la rectification sont couverts par Playwright, hors de `pnpm verify` | Correctifs successifs sur `use-channel.ts` ou les écrans, signalés par les joueurs plutôt que par les tests | Étendre les tests de bout en bout aux parcours du Village, du Marché et de la Taverne, et les exécuter avant chaque envoi sur `main`. |
| 4 | Règles transverses de la Flotte hors transaction, et avis des ports sans durée de conservation (DT-014, DT-016) | Joueur avec trois flottes en mer, ou flux de port de plusieurs milliers d'événements | Sérialiser les lancements par un flux d'amirauté par joueur ; fixer une durée de conservation des avis, appliquée par la tâche quotidienne. |

## 7. Conclusion

Le projet peut être repris et évoluer sans régression côté serveur : ses frontières sont
vérifiées automatiquement, et démontrées par l'extraction du Village ; ses règles sont
couvertes par 290 tests, ses décisions consignées dans quinze ADR, et sa dette tenue à jour.
La Flotte, ajoutée à l'évaluation, s'est intégrée sans modifier le Village, et en ne touchant
au Classement que par son langage publié. Deux conditions s'imposent toutefois : étendre les
tests de bout en bout aux autres écrans avant toute évolution importante de l'interface, et
traiter les non-conformités au RGPD (DT-008, DT-009) avant d'ouvrir le jeu à un public plus
large. Un déploiement du service Village, enfin, ne
devrait être envisagé qu'avec le remboursement préalable de DT-010 à DT-012.

## Usage de l'IA générative

Aucun.
