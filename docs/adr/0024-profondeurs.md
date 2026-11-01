# ADR-0024 - Les Profondeurs : classes de héros, intentions des monstres et arène animée

- Statut : accepté
- Date : 2026-11-01

## Contexte

Le Donjon reprenait le travail pratique tel quel : des héros identiques, trois actions
(attaquer, se défendre, soigner), deux monstres et un troll, et une interface en listes de
texte. Les choix d'une manche se résumaient à frapper le monstre le plus faible, et rien
ne montrait ce que les monstres allaient faire ni ce qu'une manche avait produit.

## Décision

**Des classes de héros.** Le joueur choisit sa classe en ouvrant ou en rejoignant une
expédition : le guerrier (40 PV, attaque 5), la rôdeuse (26 PV, attaque 8, 30 % de coups
critiques) ou la prêtresse (30 PV, soin de 10). Chaque classe a une compétence, utilisable
une manche sur trois :

- le **Rempart** du guerrier attire sur lui toutes les attaques de la manche, et en
  encaisse la moitié ;
- la **Pluie de flèches** de la rôdeuse frappe chaque monstre debout ;
- la **Prière** de la prêtresse soigne tous les héros debout.

Un coup critique double les dégâts. Un compagnon prend le rôle qui manque au groupe, et
utilise sa compétence quand elle sert : prier si deux héros sont blessés, lever le rempart
si un monstre vise un allié blessé, tirer sa volée face à deux monstres.

**Des intentions de monstres.** Au début de chaque manche, chaque monstre annonce le héros
qu'il frappera et ses dégâts possibles. L'intention est tirée d'une graine dérivée propre
(`mix(seed, 2, manche)`) avec la stratégie du niveau de difficulté : tous les joueurs lisent
la même, et la résolution la suit, sauf si un guerrier lève le rempart. Les joueurs peuvent
donc se défendre, soigner ou protéger celui qui est visé.

**Plus de contenu.** L'araignée et le cultiste rejoignent les salles ordinaires, la liche
garde la dernière salle en difficile, et un sanctuaire rend 12 PV à chaque héros debout.

**Une interface « Les Profondeurs ».** Murs de pierre, torches et braises ; choix illustré
de la classe et du péril ; groupe en quatre places ; carte des salles découvertes jusqu'au
gardien ; porte à deux battants qui s'ouvre sur la salle suivante ; arène où les monstres
affichent leur intention ; barre d'actions avec raccourcis clavier de 1 à 4 ; rejeu de la
manche coup par coup, avec dégâts flottants, coups critiques et compétences annoncées ;
écran de victoire ou de défaite avec le butin compté.

Les événements gardent leur forme : la classe s'ajoute aux statistiques du héros, la
compétence aux actions et les coups critiques aux effets. Un héros enregistré sans classe
garde ses anciennes valeurs, sans coup critique ni compétence, et les expéditions déjà
enregistrées se rejouent à l'identique.

## Conséquences

### Positives

- Chaque manche demande un vrai choix : qui est visé, qui protéger, quand garder sa
  compétence.
- Les rôles donnent un intérêt à jouer à plusieurs, et les compagnons comblent les manques.
- Le rejeu rend lisible ce qui s'est passé, sans changer la résolution simultanée (ADR 0004).

### Négatives

- La cible des monstres est connue à l'avance : la stratégie du niveau difficile ne lit plus
  les défenses de la manche pour choisir sa victime.
- L'interface du Donjon est plus longue, et ses animations demandent un navigateur récent.

## Alternatives écartées

- **Une scène PixiJS pour l'arène** : les combats tiennent en quelques cartes, que le DOM et
  les animations de l'interface rendent accessibles au clavier et aux lecteurs d'écran.
- **Des compétences sur une jauge d'énergie** : plus fin, mais une recharge en manches se lit
  d'un coup d'œil et se teste simplement.

## Usage de l'IA générative
