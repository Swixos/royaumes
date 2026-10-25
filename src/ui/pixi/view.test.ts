import { describe, expect, it } from 'vitest'
import { clampView, scaleRange, viewOn, zoomAround } from './view'

const world = { width: 1600, height: 900 }
const desktop = { width: 1200, height: 900 }
const phone = { width: 390, height: 700 }

describe('caméra des scènes', () => {
  it("va du monde entier à l'écran jusqu'à trois fois l'échelle qui le remplit", () => {
    expect(scaleRange(desktop, world)).toEqual({ min: 0.75, cover: 1, max: 3 })
    const range = scaleRange(phone, world)
    expect(range.min).toBeCloseTo(390 / 1600)
    expect(range.cover).toBeCloseTo(700 / 900)
  })

  it("garde le monde sous l'écran, et le centre quand il est plus petit que l'écran", () => {
    expect(clampView({ scale: 1, x: 200, y: -500 }, desktop, world)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    })
    expect(clampView({ scale: 1, x: -900, y: 0 }, desktop, world)).toEqual({
      scale: 1,
      x: -400,
      y: 0,
    })
    expect(clampView({ scale: 0.1, x: 0, y: 0 }, desktop, world)).toEqual({
      scale: 0.75,
      x: 0,
      y: (900 - 675) / 2,
    })
    expect(clampView({ scale: 10, x: 0, y: 0 }, desktop, world).scale).toBe(3)
  })

  it('zoome autour du point visé, qui reste sous le curseur', () => {
    const view = zoomAround({ scale: 1, x: -100, y: -50 }, 2, { x: 300, y: 200 })
    expect(view.scale).toBe(2)
    expect((300 - view.x) / view.scale).toBe((300 + 100) / 1)
    expect((200 - view.y) / view.scale).toBe((200 + 50) / 1)
  })

  it('centre la vue sur un point du monde', () => {
    expect(viewOn({ x: 800, y: 440 }, 1, phone)).toEqual({ scale: 1, x: 195 - 800, y: 350 - 440 })
  })
})
