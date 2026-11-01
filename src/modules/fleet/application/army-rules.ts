import { LAND_STATS, NAVAL_STATS } from '@/modules/realm/contracts'
import type { ArmyRules } from '../domain/battle'

/**
 * Values of the units the battles of the fleet read: the published catalog of the village
 * module, where the troops are trained. The fleet domain receives them as rules, so it
 * stays free of any other module.
 */
export const ARMY_RULES: ArmyRules = { land: LAND_STATS, naval: NAVAL_STATS }
