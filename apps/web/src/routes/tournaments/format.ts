import type { BracketFormat } from '@dst/shared'

export function formatLabel(format: BracketFormat): string {
  if (format.kind === 'single') {
    return `Single elimination${format.thirdPlace ? ' + third place' : ''}`
  }
  return `Double elimination${format.grandFinalReset ? ' + reset' : ''}`
}
