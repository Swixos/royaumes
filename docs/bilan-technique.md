# Bilan technique de Royaumes

- Date : 2026-10-23
- Version examinée : étiquette `td11-fin`
- Auteur : Swixos

Ce bilan dresse l'état technique du projet au terme de son développement, à partir de ses
décisions d'architecture, de ses indicateurs de qualité, de sa dette technique et de ses
revues. Il s'adresse à la personne qui reprendrait le projet.

## 1. Le système livré

| Élément | Valeur |
| --- | --- |
| Modules métier | 6 : `realm`, `dungeon`, `market`, `ranking`, `tavern`, `system` |
| Briques de la plateforme | 9 : `auth`, `cron`, `db`, `event-store`, `http`, `outbox`, `privacy`, `projection`, `realtime` ; plus le service Village extrait (`src/services/village`) |
| Lignes de code, hors tests | Environ 9 500 (`src` et `app`) |
| Fichiers de test, nombre de tests | 33 fichiers, 232 tests |
| Commits | 136 sur la branche `main` au moment du bilan, fusions comprises |
| Hébergement | Vercel (Francfort), base Neon (Francfort) |

| Module | Stockage | Lignes, hors tests |
| --- | --- | --- |
| `realm` | Event Sourcing | 1 218, dont 164 pour le module distant |
| `dungeon` | Event Sourcing, projection des expéditions ouvertes | 2 354 |
| `market` | Event Sourcing, projection des offres, saga | 1 506 |
| `ranking` | Projection du journal | 538 |
| `tavern` | Tables ordinaires | 838 |
| `system` | Aucun | 81 |

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
| 0009 | Extraction du Village, préparée mais non déployée | Démonstration à deux processus, tests de contrat (TD11) | Trop récente pour avoir été éprouvée en exploitation ; ses trois dettes (DT-010 à DT-012) conditionnent tout déploiement. |

## 3. La qualité

| Caractéristique | Indicateur | Valeur | Appréciation |
| --- | --- | --- | --- |
| Adéquation fonctionnelle | Tests réussis ; couverture des domaines | 232 tests réussis ; domaines presque entièrement couverts | Satisfaisante : chaque règle du jeu est vérifiée par des tests exacts, d'invariant ou statistiques. |
| Efficacité des performances | Débit et p99 des lectures ; respect du budget | De 109 à 165 requêtes par seconde ; p99 de 182 à 448 ms sous 20 connexions (`perf/apres.json`) | Satisfaisante en local : budget respecté après optimisation ; non mesurée en production, où s'ajoutent le réseau et le démarrage à froid. |
| Fiabilité | Tests de concurrence, de reprise et d'idempotence ; messages abandonnés | Concurrence optimiste, rattrapages simultanés, messages en double et panne du service testés ; aucun message abandonné | Satisfaisante : les chemins d'échec sont testés, et les lettres mortes peuvent être examinées et relancées. |
| Sécurité | Exigences des revues de sécurité | 40 exigences, dont 37 conformes et 3 en risque accepté | Satisfaisante : aucune non-conformité ouverte ; les risques acceptés sont consignés et justifiés. |
| Maintenabilité | Règles d'architecture ; fonctions d'aptitude ; couverture | 8 règles de dépendance, 2 fonctions d'aptitude par les tests ; 75 % des lignes couvertes | Bonne côté serveur. L'interface n'est vérifiée par aucun test automatique : une régression du temps réel ou d'un écran ne serait détectée qu'à la main. |
| Flexibilité | Extraction d'un module ; changement de base entre local et production | Village extrait sans modification ; PGlite en local et en test, Neon en production | Démontrée : le changement de stockage d'un module ou de son hébergement ne touche pas les autres. |

## 4. La dette technique

| Indicateur | Valeur |
| --- | --- |
| Entrées consignées | 13 |
| Entrées remboursées, dont à l'échéance prévue | 7, toutes à l'échéance prévue |
| Entrées ouvertes | 6 : DT-008 à DT-013 |

Analyse : les sept premières entrées ont toutes été consignées au moment du raccourci, avec
une échéance, et remboursées au TD prévu, ce qui est le signe d'un pilotage. Les entrées
ouvertes sont de deux natures. DT-008, DT-009 et DT-013 ont été découvertes par la revue de
conformité au RGPD, et non au moment où elles ont été créées : les sessions expirées et les
journaux d'erreurs n'avaient fait l'objet d'aucune décision consciente, ce qui montre l'intérêt
des revues. DT-010 à DT-012 concernent le seul service extrait, qui n'est pas en production :
elles ne pèsent sur rien tant que l'ADR 0009 n'est pas remis en cause.

## 5. Les revues

| Revue | Exigences | Conformes | Non conformes ou en risque accepté | Actions ouvertes |
| --- | --- | --- | --- | --- |
| Sécurité de l'authentification | 16 | 15 | 1 en risque accepté (S9) | Aucune : le partage des compteurs (DT-004) est remboursé |
| Sécurité du Donjon | 14 | 12 | 2 en risque accepté (D10, D14) | Aucune ; règles de conduite pour les futurs canaux discrets |
| Sécurité du Marché | 10 | 10 | Aucune | Aucune ; règles de conduite pour les futurs messages |
| Conformité au RGPD | 10 | 7 | 2 non conformes (R8, R9), 1 en risque accepté (R10) | DT-008, DT-009, DT-013 ; confirmation de l'accord de traitement de Vercel pour l'offre Hobby |

Chaque action ouverte qui touche au code figure au registre de la dette. La confirmation de
l'accord de traitement des données de Vercel est une action contractuelle : elle est suivie
dans le registre des traitements.

## 6. Risques et recommandations

| N° | Risque | Signe avant-coureur | Recommandation |
| --- | --- | --- | --- |
| 1 | Charge des flux temps réel : chaque flux ouvert relit le journal deux fois par seconde, et la charge de la base croît avec le nombre de joueurs connectés (ADR 0003) | Hausse de l'utilisation de calcul de Neon, ou p99 des lectures qui dépasse le budget lorsque de nombreux joueurs sont connectés | Mesurer la charge avec des flux ouverts dans le test de charge ; envisager une notification par `LISTEN/NOTIFY` de PostgreSQL ou un service de diffusion, consigné dans un nouvel ADR. |
| 2 | Croissance du journal : la reconstruction d'une projection et l'effacement d'un compte parcourent tout le journal, pendant une requête limitée en durée (ADR 0006 et 0008) | Durée d'un effacement ou d'une reconstruction qui approche la durée maximale d'une fonction Vercel | Mesurer ces deux opérations à chaque étiquette ; préparer un script de reconstruction hors requête, et préférer les références sans copie pour les nouveaux événements. |
| 3 | Interface sans test automatique : une régression du temps réel ou d'un écran n'est détectée qu'à la main | Correctifs successifs sur `use-channel.ts` ou les écrans, signalés par les joueurs plutôt que par `pnpm verify` | Ajouter des tests de bout en bout du navigateur, par exemple avec Playwright, sur les parcours essentiels : connexion, Village, échange au Marché, Taverne. |

## 7. Conclusion

Le projet peut être repris et évoluer sans régression côté serveur : ses frontières sont
vérifiées automatiquement, et démontrées par l'extraction du Village ; ses règles sont
couvertes par 232 tests, ses décisions consignées dans neuf ADR, et sa dette tenue à jour.
Deux conditions s'imposent toutefois : doter l'interface de tests automatiques avant toute
évolution importante des écrans, et traiter les non-conformités au RGPD (DT-008, DT-009)
avant d'ouvrir le jeu à un public plus large. Un déploiement du service Village, enfin, ne
devrait être envisagé qu'avec le remboursement préalable de DT-010 à DT-012.

## Usage de l'IA générative

Aucun.
