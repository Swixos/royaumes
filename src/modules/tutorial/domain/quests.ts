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
      'Chaque niveau du rempart renforce de 8 % la défense de vos troupes restées au village. Avec une garnison et un rempart, le royaume est à vous !',
    task: 'Construire le Rempart',
    goal: { kind: 'building', building: 'wall', level: 1 },
    reward: { wood: 200, stone: 150, gold: 80 },
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
