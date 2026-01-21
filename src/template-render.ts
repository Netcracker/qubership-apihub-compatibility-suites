const normalizeNewlines = (value: string): string => value.replace(/\r\n/g, '\n')

/**
 * Schema fragments used by schema-scope templates.
 */
export type SchemaFragments = { schema: string }

/**
 * Adds an indent prefix to each non-empty line in a fragment.
 */
const indentFragment = (fragment: string, indent: string): string => {
  const normalized = normalizeNewlines(fragment).trimEnd()
  if (!normalized) {
    return ''
  }
  return normalized
    .split('\n')
    .map((line) => (line.length ? `${indent}${line}` : line))
    .join('\n')
}

/**
 * Replaces a line-only placeholder token with an indented fragment.
 */
const replaceLinePlaceholder = (template: string, token: string, fragment: string): string => {
  const normalizedTemplate = normalizeNewlines(template)
  const lines = normalizedTemplate.split('\n')
  const lineIndex = lines.findIndex((line) => line.trim() === token)
  if (lineIndex === -1) {
    return normalizedTemplate
  }

  const indent = lines[lineIndex].match(/^\s*/)?.[0] ?? ''
  const indentedFragment = indentFragment(fragment, indent)

  if (!indentedFragment) {
    lines.splice(lineIndex, 1)
    return lines.join('\n')
  }

  lines.splice(lineIndex, 1, ...indentedFragment.split('\n'))
  return lines.join('\n')
}

/**
 * Renders a schema-scope template with the provided fragments.
 */
export const renderTemplate = (template: string, fragments: SchemaFragments): string => {
  const rendered = replaceLinePlaceholder(template, '__SCHEMA__', fragments.schema)
  return `${normalizeNewlines(rendered).trimEnd()}\n`
}
