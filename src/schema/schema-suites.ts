import { JsonSchemaCaseMap, SchemaScopeTemplateMap } from '../../generated/suite-data'
import { buildTemplateKey, type TestSpecType } from '../shared/suite-shared'
import { isKnownSchemaScopeId } from './schema-scopes'
import { renderTemplate, type SchemaFragments } from './template-render'

type SchemaCaseVariant = 'before' | 'after'

/**
 * Returns true when a suiteId is a schema scope backed by a template.
 */
export const isSchemaScope = (specType: TestSpecType, suiteId: string): boolean => {
  if (!isKnownSchemaScopeId(specType, suiteId)) {
    return false
  }
  return SchemaScopeTemplateMap.has(buildTemplateKey(specType, suiteId))
}

/**
 * Composes a schema-scope case by rendering a template with schema fragments.
 * Throws if the template or schema case is missing (data integrity error).
 */
export const composeSchemaCase = (
  specType: TestSpecType,
  suiteId: string,
  caseId: string,
  variant: SchemaCaseVariant,
): string => {
  const templateKey = buildTemplateKey(specType, suiteId)
  const template = SchemaScopeTemplateMap.get(templateKey)
  if (!template) {
    throw new Error(`Schema-scope template not found: ${templateKey}`)
  }

  const schemaCase = JsonSchemaCaseMap.get(caseId)
  if (!schemaCase) {
    throw new Error(`JSON schema case not found: ${caseId}`)
  }

  const fragments: SchemaFragments = schemaCase[variant]
  return renderTemplate(template, fragments)
}
