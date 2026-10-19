import { look } from './theme'

/**
 * Renders a game entity (resource, building...) from the theme. The glyph is
 * hidden from screen readers, which read the label instead.
 *
 * @param props - Component props.
 * @param props.kind - Entity identifier in the theme.
 * @param props.showLabel - Whether to display the label next to the glyph.
 * @returns The entity glyph with its label.
 */
export function Entity({ kind, showLabel = false }: { kind: string; showLabel?: boolean }) {
  const { glyph, label } = look(kind)
  return (
    <span className="entity" title={label}>
      <span aria-hidden="true">{glyph}</span>
      {showLabel ? <span>{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  )
}
