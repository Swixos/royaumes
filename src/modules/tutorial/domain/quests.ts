/**
 * Quests of the tutorial, as in a strategy game: a chain of goals that teaches the game
 * step by step, each told by the advisor of the player and paid with a reward. This file
 * holds no database: the rules telling whether a goal is reached are tested on their own.
 *
 * @packageDocumentation
 */

/** Amounts of resources of a reward. */
export type Amounts = Partial<Record<'wood' | 'stone' | 'gold', number>>

/** Levels reached by a building, each with the time its construction completes. */
export type LevelSteps = Array<[level: number, at: number]>

/** Facts of the game that a quest may ask for, beyond the levels of the buildings. */
export const DEEDS = [
  'troops',
  'warship',
  'offer',
  'pirateRaid',
  'navalVictory',
  'expedition',
  'expeditionWon',
  'purchase',
  'dungeonSkill',
  'slinger',
  'archer',
  'hoplite',
  'bireme',
  'lightShip',
  'villageRaid',
  'villageVictory',
  'coveVictory',
  'atollVictory',
  'defended',
] as const

/** Fact of the game that a quest may ask for. */
export type Deed = (typeof DEEDS)[number]

/** What the player achieved so far, read from the events of the game. */
export interface Progress {
  /** Levels reached by each building, with their completion time. */
  levels: Record<string, LevelSteps>
  /** Facts achieved at least once. */
  deeds: Deed[]
}

/** Progress of a player who did nothing yet. */
export const NO_PROGRESS: Progress = { levels: {}, deeds: [] }

/** Goal of a quest: a building to raise, or a fact to achieve. */
export type Goal =
  | { kind: 'building'; building: string; level: number }
  | { kind: 'deed'; deed: Deed }

/** Chapter of the tutorial, grouping quests around one part of the game. */
export interface Chapter {
  id: string
  /** Title of the chapter. */
  title: string
  /** Icon of the chapter. */
  icon: string
}

/** Quest of the tutorial. */
export interface Quest {
  id: string
  /** Chapter of the quest. */
  chapter: string
  /** Title of the quest. */
  title: string
  /** Words of the advisor, telling why the quest matters. */
  advice: string
  /** Short statement of the goal. */
  task: string
  /** Goal checked to complete the quest. */
  goal: Goal
  /** Resources given when the reward is claimed. */
  reward: Amounts
}

/** Chapters of the tutorial, in order. */
export const CHAPTERS: readonly Chapter[] = [
  { id: 'foundations', title: 'Les fondations', icon: 'village' },
  { id: 'kingdom', title: 'Le royaume', icon: 'market' },
  { id: 'army', title: "L'armée", icon: 'troops' },
  { id: 'sea', title: 'La mer', icon: 'fleet' },
  { id: 'defense', title: 'La défense', icon: 'wall' },
  { id: 'growth', title: "L'essor", icon: 'sawmill' },
  { id: 'alliances', title: 'Les alliances', icon: 'market' },
  { id: 'war', title: "L'art de la guerre", icon: 'swords' },
  { id: 'navy', title: 'La maîtrise des mers', icon: 'fleet' },
  { id: 'fortress', title: 'La forteresse', icon: 'wall' },
  { id: 'glory', title: 'La gloire', icon: 'ranking' },
]

/** Quests of the tutorial, in the order they are given. */
export const QUESTS: readonly Quest[] = [
  {
    id: 'sawmill-2',
    chapter: 'foundations',
    title: 'Les premières planches',
    advice:
      'Tout royaume commence par le bois. Agrandissez la scierie : elle produira davantage, et chaque bâtiment en réclame.',
    task: 'Monter la Scierie au niveau 2',
    goal: { kind: 'building', building: 'sawmill', level: 2 },
    reward: { wood: 80, stone: 40 },
  },
  {
    id: 'quarry-2',
    chapter: 'foundations',
    title: 'Tailler la pierre',
    advice:
      'La pierre est plus rare que le bois. Une carrière plus grande fournira les murs de vos futurs bâtiments.',
    task: 'Monter la Carrière au niveau 2',
    goal: { kind: 'building', building: 'quarry', level: 2 },
    reward: { wood: 60, stone: 80 },
  },
  {
    id: 'warehouse-2',
    chapter: 'foundations',
    title: 'Des greniers pleins',
    advice:
      "L'entrepôt fixe le plafond de vos réserves et cache une part de vos biens aux pillards. Agrandissez-le avant qu'il ne déborde.",
    task: "Monter l'Entrepôt au niveau 2",
    goal: { kind: 'building', building: 'warehouse', level: 2 },
    reward: { wood: 100, stone: 100 },
  },
  {
    id: 'senate-2',
    chapter: 'foundations',
    title: 'Le cœur de la cité',
    advice:
      'Le Sénat accélère tous vos chantiers et ouvre de nouveaux bâtiments. Au niveau 2, il autorise la mine.',
    task: 'Monter le Sénat au niveau 2',
    goal: { kind: 'building', building: 'senate', level: 2 },
    reward: { wood: 120, stone: 120, gold: 20 },
  },
  {
    id: 'mine-1',
    chapter: 'foundations',
    title: "L'or de la montagne",
    advice:
      "Sans or, pas de flotte ni de commerce. Creusez la mine au pied de la montagne : elle extraira de l'or chaque minute.",
    task: 'Construire la Mine',
    goal: { kind: 'building', building: 'mine', level: 1 },
    reward: { gold: 40 },
  },
  {
    id: 'offer',
    chapter: 'kingdom',
    title: 'Le premier marché',
    advice:
      "Il vous manque toujours quelque chose. Au Marché, proposez ce que vous avez en trop contre ce qu'il vous faut : un autre seigneur acceptera.",
    task: 'Publier une offre au Marché',
    goal: { kind: 'deed', deed: 'offer' },
    reward: { wood: 60, stone: 60 },
  },
  {
    id: 'expedition',
    chapter: 'kingdom',
    title: 'Les profondeurs du donjon',
    advice:
      "Sous le royaume dort un donjon plein d'or. Ouvrez une expédition, seul ou avec d'autres héros, et descendez salle après salle.",
    task: 'Ouvrir ou rejoindre une expédition au Donjon',
    goal: { kind: 'deed', deed: 'expedition' },
    reward: { wood: 50, gold: 20 },
  },
  {
    id: 'expedition-won',
    chapter: 'kingdom',
    title: 'Le trésor du donjon',
    advice:
      "Choisissez bien vos actions à chaque manche : attaquer, se défendre ou soigner. Une expédition gagnée rapporte l'or des monstres.",
    task: 'Gagner une expédition au Donjon',
    goal: { kind: 'deed', deed: 'expeditionWon' },
    reward: { gold: 50 },
  },
  {
    id: 'farm-2',
    chapter: 'army',
    title: 'Nourrir les soldats',
    advice:
      'Chaque soldat et chaque navire occupe une place à la ferme. Agrandissez-la avant de lever une armée : sans population libre, aucune unité ne sort des rangs.',
    task: 'Monter la Ferme au niveau 2',
    goal: { kind: 'building', building: 'farm', level: 2 },
    reward: { wood: 60, stone: 60 },
  },
  {
    id: 'barracks-1',
    chapter: 'army',
    title: 'La caserne',
    advice:
      "Une cité sans soldats n'attend que d'être pillée. Bâtissez la caserne : elle forme les épéistes d'abord, puis les frondeurs, les archers et les hoplites à mesure qu'elle grandit.",
    task: 'Construire la Caserne',
    goal: { kind: 'building', building: 'barracks', level: 1 },
    reward: { wood: 80, stone: 40, gold: 10 },
  },
  {
    id: 'troops',
    chapter: 'army',
    title: 'Lever les premiers soldats',
    advice:
      "À la caserne, choisissez une unité et son nombre, puis formez-les : ils sortent l'un après l'autre. L'épéiste défend bien contre les flèches, le frondeur frappe fort à distance.",
    task: 'Former des troupes à la Caserne',
    goal: { kind: 'deed', deed: 'troops' },
    reward: { wood: 60, stone: 30, gold: 20 },
  },
  {
    id: 'sawmill-3',
    chapter: 'sea',
    title: 'Le bois des navires',
    advice: 'Un chantier naval réclame une scierie de niveau 3 pour fournir ses coques.',
    task: 'Monter la Scierie au niveau 3',
    goal: { kind: 'building', building: 'sawmill', level: 3 },
    reward: { wood: 120, stone: 60 },
  },
  {
    id: 'shipyard-1',
    chapter: 'sea',
    title: 'Le chantier naval',
    advice:
      'Vos soldats ne marchent pas sur l’eau. Le chantier naval construit les bateaux de transport qui les portent, puis les birèmes et les navires légers qui se battent en mer.',
    task: 'Construire le Chantier naval',
    goal: { kind: 'building', building: 'shipyard', level: 1 },
    reward: { wood: 150, stone: 100, gold: 40 },
  },
  {
    id: 'warship',
    chapter: 'sea',
    title: 'Mettre une coque à l’eau',
    advice:
      'Un bateau de transport porte dix soldats. Construisez-en au moins un au chantier naval : sans navire, aucune armée ne quitte le port.',
    task: 'Construire un navire au Chantier naval',
    goal: { kind: 'deed', deed: 'warship' },
    reward: { wood: 80, stone: 40 },
  },
  {
    id: 'pirate-raid',
    chapter: 'sea',
    title: 'Cap sur les pirates',
    advice:
      'Les îles pirates gardent des trésors. Au Conseil de guerre, embarquez vos troupes dans vos transports, lisez la prévision de bataille, puis hissez les voiles.',
    task: 'Lancer un raid contre une île pirate',
    goal: { kind: 'deed', deed: 'pirateRaid' },
    reward: { wood: 60, stone: 30 },
  },
  {
    id: 'naval-victory',
    chapter: 'sea',
    title: 'Première victoire',
    advice:
      "Les navires de la cible se battent d'abord en mer, puis vos troupes affrontent sa garnison, renforcée par le rempart. Mêlez les dégâts contondants, tranchants et à distance : chaque défenseur résiste à sa manière.",
    task: 'Remporter une bataille',
    goal: { kind: 'deed', deed: 'navalVictory' },
    reward: { gold: 60 },
  },
  {
    id: 'senate-3',
    chapter: 'defense',
    title: 'Un Sénat plus fort',
    advice: 'Un Sénat de niveau 3 autorise le rempart, et vos chantiers iront encore plus vite.',
    task: 'Monter le Sénat au niveau 3',
    goal: { kind: 'building', building: 'senate', level: 3 },
    reward: { wood: 150, stone: 150 },
  },
  {
    id: 'wall-1',
    chapter: 'defense',
    title: 'Des murs autour de la ville',
    advice:
      'Chaque niveau du rempart renforce de 8 % la défense de vos troupes restées au village. Commencez par une palissade : la pierre viendra ensuite.',
    task: 'Construire le Rempart',
    goal: { kind: 'building', building: 'wall', level: 1 },
    reward: { wood: 200, stone: 150, gold: 80 },
  },
  {
    id: 'mine-2',
    chapter: 'growth',
    title: 'Des filons plus profonds',
    advice:
      "L'or paie les troupes d'élite et les navires de guerre. Creusez plus loin dans la montagne : la mine en tirera davantage chaque minute.",
    task: 'Monter la Mine au niveau 2',
    goal: { kind: 'building', building: 'mine', level: 2 },
    reward: { wood: 120, stone: 100 },
  },
  {
    id: 'quarry-3',
    chapter: 'growth',
    title: 'Des blocs pour les remparts',
    advice:
      "Chaque niveau de rempart et de caserne dévore de la pierre. Une carrière plus grande vous évitera d'attendre.",
    task: 'Monter la Carrière au niveau 3',
    goal: { kind: 'building', building: 'quarry', level: 3 },
    reward: { wood: 150, stone: 80 },
  },
  {
    id: 'sawmill-4',
    chapter: 'growth',
    title: 'La forêt au service du royaume',
    advice:
      'Les coques, les palissades et les arcs viennent tous du bois. La scierie au niveau 4 nourrit une cité qui grandit.',
    task: 'Monter la Scierie au niveau 4',
    goal: { kind: 'building', building: 'sawmill', level: 4 },
    reward: { stone: 180, gold: 30 },
  },
  {
    id: 'warehouse-3',
    chapter: 'growth',
    title: 'Des réserves pour les grands chantiers',
    advice:
      'Les grands bâtiments coûtent plus que ce que votre entrepôt peut garder. Agrandissez-le, et une plus grande part restera cachée aux pillards.',
    task: 'Monter l’Entrepôt au niveau 3',
    goal: { kind: 'building', building: 'warehouse', level: 3 },
    reward: { wood: 160, stone: 160 },
  },
  {
    id: 'farm-3',
    chapter: 'growth',
    title: 'Plus de bouches à nourrir',
    advice:
      'Une armée nombreuse mange beaucoup. Chaque niveau de ferme ajoute des places pour vos soldats et vos marins.',
    task: 'Monter la Ferme au niveau 3',
    goal: { kind: 'building', building: 'farm', level: 3 },
    reward: { wood: 140, stone: 120 },
  },
  {
    id: 'senate-4',
    chapter: 'growth',
    title: 'Un conseil plus sage',
    advice:
      'Le Sénat raccourcit tous vos chantiers. Au niveau 4, la cité bâtit nettement plus vite.',
    task: 'Monter le Sénat au niveau 4',
    goal: { kind: 'building', building: 'senate', level: 4 },
    reward: { wood: 220, stone: 220, gold: 40 },
  },
  {
    id: 'purchase',
    chapter: 'alliances',
    title: 'Une affaire conclue',
    advice:
      "Le marché ne sert pas qu'à vendre : d'autres seigneurs proposent ce qui vous manque. Acceptez une de leurs offres, l'échange se fait de port à port.",
    task: 'Accepter une offre au Marché',
    goal: { kind: 'deed', deed: 'purchase' },
    reward: { wood: 80, stone: 80, gold: 20 },
  },
  {
    id: 'dungeon-skill',
    chapter: 'alliances',
    title: 'Le talent du héros',
    advice:
      'Chaque héros des Profondeurs a une compétence : le Rempart du guerrier, la Pluie de flèches de la rôdeuse, la Prière de la prêtresse. Gardez-la pour le bon moment, elle met trois manches à revenir.',
    task: 'Utiliser la compétence de votre héros au Donjon',
    goal: { kind: 'deed', deed: 'dungeonSkill' },
    reward: { gold: 60 },
  },
  {
    id: 'barracks-2',
    chapter: 'war',
    title: 'Une caserne agrandie',
    advice:
      'Au niveau 2, la caserne forme les frondeurs, redoutables à distance, et chaque formation va plus vite.',
    task: 'Monter la Caserne au niveau 2',
    goal: { kind: 'building', building: 'barracks', level: 2 },
    reward: { wood: 120, stone: 100, gold: 20 },
  },
  {
    id: 'slinger',
    chapter: 'war',
    title: 'Les frondeurs',
    advice:
      'Le frondeur frappe fort, mais se défend mal. Mêlez-les à vos épéistes, qui tiennent bon contre les flèches et les pierres.',
    task: 'Former des frondeurs',
    goal: { kind: 'deed', deed: 'slinger' },
    reward: { wood: 100, stone: 60, gold: 20 },
  },
  {
    id: 'barracks-3',
    chapter: 'war',
    title: 'Les archers',
    advice:
      'La caserne au niveau 3 ouvre les archers : les meilleurs défenseurs contre les lances des hoplites ennemis.',
    task: 'Monter la Caserne au niveau 3',
    goal: { kind: 'building', building: 'barracks', level: 3 },
    reward: { wood: 180, stone: 150, gold: 30 },
  },
  {
    id: 'archer',
    chapter: 'war',
    title: 'Une garnison d’archers',
    advice:
      'Une garnison variée résiste à toutes les attaques : chaque unité se défend différemment contre les coups contondants, tranchants et à distance.',
    task: 'Former des archers',
    goal: { kind: 'deed', deed: 'archer' },
    reward: { wood: 120, stone: 80, gold: 30 },
  },
  {
    id: 'village-raid',
    chapter: 'war',
    title: 'Un voisin trop tranquille',
    advice:
      "Les autres seigneurs aussi ont des greniers pleins. Lancez un raid contre le village d'un autre joueur : le Conseil de guerre montre son rempart, mais pas ses troupes.",
    task: 'Lancer un raid contre un autre village',
    goal: { kind: 'deed', deed: 'villageRaid' },
    reward: { wood: 120, stone: 120 },
  },
  {
    id: 'village-victory',
    chapter: 'war',
    title: 'Le butin d’un seigneur',
    advice:
      'Une victoire contre un village pille ce que vos survivants peuvent porter, et affaiblit sa garnison. Lisez le rapport : il montre les pertes de chaque camp.',
    task: 'Remporter une bataille contre un autre village',
    goal: { kind: 'deed', deed: 'villageVictory' },
    reward: { gold: 100 },
  },
  {
    id: 'shipyard-2',
    chapter: 'navy',
    title: 'Des coques de guerre',
    advice:
      'Au niveau 2, le chantier naval construit les birèmes : peu offensives, mais des remparts flottants contre les flottes ennemies.',
    task: 'Monter le Chantier naval au niveau 2',
    goal: { kind: 'building', building: 'shipyard', level: 2 },
    reward: { wood: 200, stone: 120, gold: 30 },
  },
  {
    id: 'bireme',
    chapter: 'navy',
    title: 'La première birème',
    advice:
      "Une flotte ennemie doit d'abord vaincre vos navires avant de débarquer. Les birèmes restées au port défendent votre île.",
    task: 'Construire une birème',
    goal: { kind: 'deed', deed: 'bireme' },
    reward: { wood: 150, stone: 100, gold: 40 },
  },
  {
    id: 'cove-victory',
    chapter: 'navy',
    title: 'La Crique du Corbeau',
    advice:
      "La crique garde une birème et des hoplites. Sans navire de combat, vos transports couleront avant d'accoster : escortez-les.",
    task: 'Vaincre les pirates de la Crique du Corbeau',
    goal: { kind: 'deed', deed: 'coveVictory' },
    reward: { stone: 150, gold: 80 },
  },
  {
    id: 'shipyard-4',
    chapter: 'navy',
    title: 'Les navires légers',
    advice:
      'Le chantier naval au niveau 4 lance les navires légers, rapides et mortels en mer : ce sont eux qui ouvrent la voie à vos troupes.',
    task: 'Monter le Chantier naval au niveau 4',
    goal: { kind: 'building', building: 'shipyard', level: 4 },
    reward: { wood: 300, stone: 200, gold: 60 },
  },
  {
    id: 'light-ship',
    chapter: 'navy',
    title: 'Maître des flots',
    advice:
      "Un navire léger écrase les birèmes ennemies. Avec eux, plus aucune île n'est hors d'atteinte.",
    task: 'Construire un navire léger',
    goal: { kind: 'deed', deed: 'lightShip' },
    reward: { wood: 200, stone: 150, gold: 60 },
  },
  {
    id: 'wall-2',
    chapter: 'fortress',
    title: 'Des murs plus épais',
    advice:
      'Chaque niveau de rempart renforce de 8 % la défense de vos troupes au village. Ils ne protègent que ceux qui restent : gardez une garnison.',
    task: 'Monter le Rempart au niveau 2',
    goal: { kind: 'building', building: 'wall', level: 2 },
    reward: { wood: 120, stone: 200 },
  },
  {
    id: 'warehouse-4',
    chapter: 'fortress',
    title: 'Des caves secrètes',
    advice:
      'Un grand entrepôt cache une part plus grande de vos biens : même vaincu, vous ne perdez pas tout.',
    task: 'Monter l’Entrepôt au niveau 4',
    goal: { kind: 'building', building: 'warehouse', level: 4 },
    reward: { wood: 200, stone: 200, gold: 40 },
  },
  {
    id: 'farm-5',
    chapter: 'fortress',
    title: 'Une population nombreuse',
    advice:
      'Pour tenir un siège et attaquer à la fois, il faut des centaines de bras. Agrandissez la ferme.',
    task: 'Monter la Ferme au niveau 5',
    goal: { kind: 'building', building: 'farm', level: 5 },
    reward: { wood: 220, stone: 200, gold: 40 },
  },
  {
    id: 'wall-3',
    chapter: 'fortress',
    title: 'La muraille',
    advice:
      'La palissade devient muraille. Avec une bonne garnison, votre île décourage la plupart des pillards.',
    task: 'Monter le Rempart au niveau 3',
    goal: { kind: 'building', building: 'wall', level: 3 },
    reward: { wood: 180, stone: 280, gold: 40 },
  },
  {
    id: 'defended',
    chapter: 'fortress',
    title: 'Ils ne passeront pas',
    advice:
      "Quand une flotte ennemie approche, l'alarme sonne dans le port. Une garnison et un rempart solides suffisent à la renvoyer à la mer.",
    task: 'Repousser une attaque contre votre village',
    goal: { kind: 'deed', deed: 'defended' },
    reward: { wood: 200, stone: 200, gold: 80 },
  },
  {
    id: 'senate-5',
    chapter: 'glory',
    title: 'Le Sénat des sages',
    advice:
      'Un Sénat de niveau 5 fait de votre cité un chantier permanent : chaque construction y va un quart plus vite.',
    task: 'Monter le Sénat au niveau 5',
    goal: { kind: 'building', building: 'senate', level: 5 },
    reward: { wood: 300, stone: 300, gold: 60 },
  },
  {
    id: 'barracks-5',
    chapter: 'glory',
    title: 'La caserne des hoplites',
    advice:
      'Au niveau 5, la caserne forme les hoplites : lances et boucliers, ils percent les lignes ennemies.',
    task: 'Monter la Caserne au niveau 5',
    goal: { kind: 'building', building: 'barracks', level: 5 },
    reward: { wood: 300, stone: 260, gold: 60 },
  },
  {
    id: 'hoplite',
    chapter: 'glory',
    title: 'La phalange',
    advice:
      'Les hoplites frappent tranchant : les épéistes résistent mal à leurs lances. Une phalange bien escortée fait tomber les garnisons les plus fières.',
    task: 'Former des hoplites',
    goal: { kind: 'deed', deed: 'hoplite' },
    reward: { wood: 200, stone: 200, gold: 80 },
  },
  {
    id: 'mine-3',
    chapter: 'glory',
    title: 'Le trésor de la montagne',
    advice:
      "Les hoplites, les navires légers et les grands bâtiments réclament de l'or. Une mine de niveau 3 remplit les coffres.",
    task: 'Monter la Mine au niveau 3',
    goal: { kind: 'building', building: 'mine', level: 3 },
    reward: { wood: 260, stone: 220 },
  },
  {
    id: 'quarry-5',
    chapter: 'glory',
    title: 'La pierre à profusion',
    advice:
      'Les derniers niveaux du rempart et du Sénat coûtent des montagnes de pierre. Préparez-les.',
    task: 'Monter la Carrière au niveau 5',
    goal: { kind: 'building', building: 'quarry', level: 5 },
    reward: { wood: 300, gold: 60 },
  },
  {
    id: 'sawmill-6',
    chapter: 'glory',
    title: 'Les forêts du royaume',
    advice: 'Une scierie de niveau 6 fournit de quoi armer flotte et caserne sans répit.',
    task: 'Monter la Scierie au niveau 6',
    goal: { kind: 'building', building: 'sawmill', level: 6 },
    reward: { stone: 320, gold: 60 },
  },
  {
    id: 'wall-5',
    chapter: 'glory',
    title: 'Une forteresse imprenable',
    advice:
      'Un rempart de niveau 5 ajoute 40 % à la défense de vos troupes : seuls les plus grands seigneurs oseront vous attaquer.',
    task: 'Monter le Rempart au niveau 5',
    goal: { kind: 'building', building: 'wall', level: 5 },
    reward: { wood: 300, stone: 400, gold: 80 },
  },
  {
    id: 'atoll-victory',
    chapter: 'glory',
    title: 'L’Atoll Écarlate',
    advice:
      'Le repaire le plus redouté des pirates : trois birèmes, une garnison immense et un capitaine qui apprend de vos attaques. Variez vos dégâts, et emmenez vos navires légers.',
    task: 'Vaincre les pirates de l’Atoll Écarlate',
    goal: { kind: 'deed', deed: 'atollVictory' },
    reward: { wood: 400, stone: 400, gold: 200 },
  },
  {
    id: 'senate-8',
    chapter: 'glory',
    title: 'Le seigneur des îles',
    advice:
      "Ysolde n'a plus rien à vous apprendre. Un Sénat de niveau 8 fait de votre cité l'une des plus grandes de la mer : le royaume est à vous.",
    task: 'Monter le Sénat au niveau 8',
    goal: { kind: 'building', building: 'senate', level: 8 },
    reward: { wood: 600, stone: 600, gold: 300 },
  },
]

/**
 * Finds a quest.
 *
 * @param questId - Quest identifier.
 * @returns The quest, or undefined if it does not exist.
 */
export const questOf = (questId: string) => QUESTS.find((quest) => quest.id === questId)

/**
 * Level of a building at a given time: its constructions completed by then.
 *
 * @param steps - Levels reached by the building, with their completion time.
 * @param now - Time in milliseconds.
 * @returns The level at `now`.
 */
export const levelAt = (steps: LevelSteps, now: number) =>
  steps.reduce((level, [reached, at]) => (at <= now ? Math.max(level, reached) : level), 0)

/** Where a player stands on the goal of a quest. */
export interface GoalProgress {
  /** Value reached: the level of the building, or 1 once the fact is achieved. */
  current: number
  /** Value to reach. */
  target: number
  /** True once the goal is reached. */
  done: boolean
  /** True while the construction that reaches the goal is under way. */
  pending: boolean
}

/**
 * Tells where a player stands on the goal of a quest. A building counts once its
 * construction completes; ordered but unfinished, it is pending.
 *
 * @param goal - Goal of the quest.
 * @param progress - What the player achieved.
 * @param now - Current time in milliseconds.
 * @returns The progress on the goal.
 */
export function goalProgress(goal: Goal, progress: Progress, now: number): GoalProgress {
  if (goal.kind === 'deed') {
    const done = progress.deeds.includes(goal.deed)
    return { current: done ? 1 : 0, target: 1, done, pending: false }
  }
  const steps = progress.levels[goal.building] ?? []
  const current = Math.min(goal.level, levelAt(steps, now))
  const ordered = steps.some(([level]) => level >= goal.level)
  const done = current >= goal.level
  return { current, target: goal.level, done, pending: ordered && !done }
}
