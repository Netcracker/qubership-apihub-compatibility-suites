import { JsonSchemaCaseMap, SchemaScopeTemplateMap } from '../generated/suite-data'
import { CASE_KEY_SEPARATOR, type TestSpecType } from './suite-shared'
import { renderTemplate, type SchemaFragments } from './template-render'

const SCHEMA_TEMPLATE_KEY_SEPARATOR = CASE_KEY_SEPARATOR

type SchemaCaseVariant = 'before' | 'after'

const buildSchemaTemplateKey = (specType: TestSpecType, suiteId: string): string =>
  [specType, suiteId].join(SCHEMA_TEMPLATE_KEY_SEPARATOR)

/**
 * Returns true when a suiteId is a schema scope backed by a template.
 */
export const isSchemaScope = (specType: TestSpecType, suiteId: string): boolean =>
  SchemaScopeTemplateMap.has(buildSchemaTemplateKey(specType, suiteId))

/**
 * Composes a schema-scope case by rendering a template with schema fragments.
 */
export const composeSchemaCase = (
  specType: TestSpecType,
  suiteId: string,
  caseId: string,
  variant: SchemaCaseVariant,
): string => {
  const templateKey = buildSchemaTemplateKey(specType, suiteId)
  const template = SchemaScopeTemplateMap.get(templateKey)
  if (!template) {
    return ''
  }

  const schemaCase = JsonSchemaCaseMap.get(caseId)
  if (!schemaCase) {
    return ''
  }

  const fragments: SchemaFragments = schemaCase[variant]
  return renderTemplate(template, fragments)
}
