export const GRID_TO_DIVS = { '1/4': 8, '1/8': 4, '1/16': 2, '1/32': 1 } as const

export function applySwingOffset(divIndex: number, gridDivs: number, ratio: number): number {
  const pairIndex = Math.floor(divIndex / gridDivs)
  const isEven = pairIndex % 2 === 1
  if (!isEven) return 0
  return Math.round((ratio - 0.5) * (2 * gridDivs))
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}


