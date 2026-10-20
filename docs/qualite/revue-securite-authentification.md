# Revue de sécurité du parcours d'authentification

- Date : 2026-10-20 (mise à jour au TD5)
- Périmètre : inscription, connexion, déconnexion, sessions, accès à l'API et aux pages du jeu.
- Références : OWASP Top 10, OWASP ASVS.

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| S1 | Les mots de passe ne sont conservés que sous forme d'empreinte, par une fonction dédiée | Test « ne conserve qu'une empreinte du mot de passe » ; documentation de Better Auth | Le test lit `identity.account` après une inscription : la colonne `password` est renseignée et ne contient pas le mot de passe saisi. Better Auth le hache par scrypt. | Conforme |
| S2 | Les mots de passe comportent au moins 8 caractères | Test « refuse un mot de passe trop court » | Une inscription avec un mot de passe de 5 caractères est refusée avec le code 400 (`minPasswordLength: 8`). Le formulaire impose aussi `minLength={8}`, à titre de confort. | Conforme |
| S3 | Les tentatives répétées d'inscription et de connexion sont limitées | Sous-partie 2.3 ; configuration de `better-auth.ts` | En local, 62 connexions avec un mauvais mot de passe en moins d'une minute : les 60 premières reçoivent 401, les suivantes 429. Les compteurs sont conservés dans la mémoire de chaque instance (DT-004). | Conforme |
| S4 | Le cookie de session est inaccessible au JavaScript de la page | Test sur l'attribut `HttpOnly` | Le cookie `better-auth.session_token` déposé à l'inscription porte l'attribut `HttpOnly`. | Conforme |
| S5 | Le cookie de session n'est pas envoyé par les requêtes émises depuis un autre site | Test sur l'attribut `SameSite` | Le cookie porte l'attribut `SameSite=Lax` : il n'accompagne pas les requêtes `POST` émises depuis un autre site. | Conforme |
| S6 | Le cookie de session ne circule que sur des connexions chiffrées | Inspection du cookie dans le navigateur ; comportement en local et en production | En production, le cookie se nomme `__Secure-better-auth.session_token` et porte l'attribut `Secure` : le navigateur ne le transmet que sur HTTPS. En local, sur `http://localhost`, l'attribut est absent, ce qui est sans conséquence puisque la connexion ne quitte pas le poste. | Conforme |
| S7 | Le secret de signature n'est pas versionné, et son absence en production empêche le démarrage | `git grep BETTER_AUTH_SECRET` ; fonction `resolveSecret` | La commande ne trouve que le nom de la variable, dans `.env.example` (sans valeur) et dans `better-auth.ts`. `resolveSecret` lève une erreur en production sur Vercel si la variable est absente. | Conforme |
| S8 | La connexion ne révèle pas si une adresse est inscrite | Test « répond de la même manière que l'adresse existe ou non » | Une adresse inscrite avec un mauvais mot de passe et une adresse inconnue reçoivent le même code (401) et le même corps (`INVALID_EMAIL_OR_PASSWORD`). | Conforme |
| S9 | L'inscription ne révèle pas si une adresse est inscrite | Création d'un compte avec une adresse déjà utilisée | Une inscription avec une adresse déjà utilisée reçoit 422 `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`, et la page affiche « Cette adresse est déjà utilisée. ». L'existence d'un compte est donc révélée. Risque accepté : le jeu ne conserve aucune donnée sensible et n'envoie aucun courrier, qui serait la seule manière de l'éviter sans gêner l'utilisateur. | Risque accepté |
| S10 | Toute route de l'API réservée aux joueurs refuse une requête anonyme | Tests « Contrôle d'accès à l'API du Village » ; racine de composition | Les requêtes anonymes de lecture et de commande sur `/api/realm` reçoivent 401 `UNAUTHENTICATED`, sans rien enregistrer. La protection est déclarée module par module dans `create-api.ts` : un nouveau module oublié resterait ouvert. Ce risque est maîtrisé en accompagnant chaque module protégé d'un test de contrôle d'accès. | Conforme |
| S11 | Un joueur ne peut accéder qu'à ses propres données | Test « isole les villages des joueurs » ; origine de `userId` dans les routes | Deux joueurs fondent chacun un village et ne lisent que le leur. Les routes ne lisent l'identifiant du joueur que dans `c.var.userId`, renseigné par `requireUser`, jamais dans l'adresse ou le corps de la requête. | Conforme |
| S12 | Les pages du jeu sont protégées sur le serveur, avant tout rendu | Mise en page `app/(jeu)/layout.tsx` ; accès à `/village` sans session | Sans session, `/village` répond 307 vers `/login` : la redirection est faite par le serveur avant le rendu de la page. | Conforme |
| S13 | Les erreurs imprévues ne révèlent aucun détail technique au client | Gestionnaire `onError` de la racine de composition | Par lecture du code : `onError` consigne l'erreur dans les journaux du serveur et renvoie 500 avec `{ code: 'INTERNAL', message: 'Erreur interne' }`, sans message ni pile d'appels. | Conforme |
| S14 | La déconnexion invalide la session sur le serveur | Réutilisation d'un cookie après déconnexion | Après une déconnexion réussie (200), le même cookie présenté à `/api/realm/village` reçoit 401 : la session n'existe plus en base. | Conforme |
| S15 | Une requête d'authentification accompagnée d'un cookie et émise depuis une autre origine est refusée | Appel de la déconnexion avec un en-tête `origin` étranger | Avec `origin: http://site-malveillant.example`, la déconnexion est refusée (403 `INVALID_ORIGIN`) ; sans en-tête `origin`, elle est refusée (403 `MISSING_OR_NULL_ORIGIN`). La session reste valide après ces deux refus. | Conforme |
| S16 | Un flux temps réel n'est accessible qu'aux joueurs connectés, et seulement pour les canaux auxquels ils ont droit | Tests « réserve le temps réel aux joueurs connectés (401) », « refuse l'écoute du village d'un autre joueur (403) » et « refuse un canal qu'aucune règle ne couvre (403) » ; principe de l'accès fermé par défaut dans `channel-policy.ts` | Un visiteur anonyme reçoit une erreur 401, un joueur qui tente d'écouter le village d'un autre joueur une erreur 403. Un canal sans règle est refusé : l'oubli d'une règle par un module futur rend ses canaux inaccessibles, et non publics. | Conforme |

## Synthèse

- Conformes : 15 (S1 à S8, S10 à S16).
- Non conforme : aucune.
- Risque accepté : 1 (S9).

Aucune exigence n'est plus en attente de vérification : S6 a été vérifiée sur le
déploiement en HTTPS (TD5), et S16 couvre l'accès aux flux temps réel ajoutés au TD5.

Actions décidées :

- suivre dans le registre de la dette technique le partage des compteurs de tentatives
  entre instances (DT-004) ;
- accompagner chaque nouveau module protégé d'un test de contrôle d'accès (S10) ;
- accompagner chaque nouveau canal temps réel d'une règle d'accès et d'un test de refus (S16).
