import { describe, expect, it } from 'vitest'
import { goalProgress, NO_PROGRESS, type Progress, QUESTS } from './quests'
import { currentQuest, decide, evolve, initialState, replay, viewOf } from './tutorial'

/** Progress of a player whose sawmill reaches level 2 at 5 000. */
const sawmillDone: Progress = {
  levels: {
    sawmill: [
      [1, 0],
      [2, 5_000],
    ],
  },
  deeds: [],
}

describe('quêtes du tutoriel', () => {
  it("compte un bâtiment une fois son chantier terminé, et l'annonce en cours avant", () => {
    const goal = { kind: 'building' as const, building: 'sawmill', level: 2 }
    expect(goalProgress(goal, sawmillDone, 4_000)).toEqual({
      current: 1,
      target: 2,
      done: false,
      pending: true,
    })
    expect(goalProgress(goal, sawmillDone, 5_000)).toMatchObject({ current: 2, done: true })
    expect(goalProgress(goal, NO_PROGRESS, 0)).toMatchObject({ current: 0, pending: false })
  })

  it('compte un fait accompli une seule fois', () => {
    const goal = { kind: 'deed' as const, deed: 'offer' as const }
    expect(goalProgress(goal, { levels: {}, deeds: ['offer'] }, 0)).toMatchObject({ done: true })
  })

  it('donne des quêtes uniques, avec une récompense chacune', () => {
    const ids = QUESTS.map((quest) => quest.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const quest of QUESTS) expect(Object.keys(quest.reward).length).toBeGreaterThan(0)
  })
})

describe('tutoriel', () => {
  const claim = (questId: string, progress: Progress) =>
    ({ type: 'ClaimReward', questId, transferId: 't1', progress }) as const

  it('démarre, se met en pause et reprend sans rien enregistrer deux fois', () => {
    const started = decide(initialState, { type: 'StartTutorial' }, 1)
    expect(started).toEqual({ ok: true, events: [{ type: 'TutorialStarted', data: { at: 1 } }] })
    const state = replay(started.ok ? started.events : [])
    expect(decide(state, { type: 'StartTutorial' }, 2)).toEqual({ ok: true, events: [] })
    const paused = evolve(state, { type: 'TutorialPaused', data: { at: 3 } })
    expect(paused.paused).toBe(true)
    expect(decide(paused, { type: 'PauseTutorial' }, 4)).toEqual({ ok: true, events: [] })
    expect(evolve(paused, { type: 'TutorialResumed', data: { at: 5 } }).paused).toBe(false)
  })

  it('paie la quête en cours une fois son but atteint, et une seule fois', () => {
    expect(decide(initialState, claim('sawmill-2', sawmillDone), 4_000)).toEqual({
      ok: false,
      error: { code: 'QUEST_NOT_DONE' },
    })
    const paid = decide(initialState, claim('sawmill-2', sawmillDone), 6_000)
    expect(paid).toEqual({
      ok: true,
      events: [
        {
          type: 'QuestRewarded',
          data: {
            questId: 'sawmill-2',
            reward: { wood: 80, stone: 40 },
            transferId: 't1',
            at: 6_000,
          },
        },
      ],
    })
    const state = replay(paid.ok ? paid.events : [])
    expect(decide(state, claim('sawmill-2', sawmillDone), 7_000)).toEqual({
      ok: false,
      error: { code: 'ALREADY_CLAIMED' },
    })
    expect(currentQuest(state)?.id).toBe('quarry-2')
  })

  it('refuse une quête inconnue, ou une quête qui vient plus tard', () => {
    expect(decide(initialState, claim('dragon', NO_PROGRESS), 0)).toEqual({
      ok: false,
      error: { code: 'UNKNOWN_QUEST' },
    })
    const done: Progress = { levels: { quarry: [[2, 0]] }, deeds: [] }
    expect(decide(initialState, claim('quarry-2', done), 0)).toEqual({
      ok: false,
      error: { code: 'QUEST_LOCKED' },
    })
  })

  it('montre la quête en cours, prête quand son but est atteint, et verrouille les suivantes', () => {
    const view = viewOf(initialState, sawmillDone, 6_000)
    expect(view.current).toBe('sawmill-2')
    expect(view.quests.map((quest) => quest.status).slice(0, 3)).toEqual([
      'ready',
      'locked',
      'locked',
    ])
    expect(view.quests[0].building).toBe('sawmill')
    expect(viewOf(initialState, sawmillDone, 1_000).quests[0].status).toBe('active')
  })
})
