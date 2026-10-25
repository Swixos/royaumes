/**
 * Events exchanged between the screens of the interface, through the window.
 *
 * @packageDocumentation
 */

/** Announces that the player's village changed, so the resource bar reads it again. */
export const VILLAGE_CHANGED = 'royaumes:village-changed'

/** Announces that the tutorial changed, so every view of it reads it again. */
export const TUTORIAL_CHANGED = 'royaumes:tutorial-changed'

/** Asks the tutorial guide to show its introduction again. */
export const TUTORIAL_INTRO = 'royaumes:tutorial-intro'
