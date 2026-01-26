import { JsonSchemaCaseMap, SchemaScopeTemplateMap } from '../generated/suite-data'
import {
  CASE_KEY_SEPARATOR,
  TEST_SPEC_TYPE_ASYNC_API,
  TEST_SPEC_TYPE_GRAPH_QL,
  TEST_SPEC_TYPE_OPEN_API,
  type TestSpecType,
} from './suite-shared'
import { renderTemplate, type SchemaFragments } from './template-render'

const SCHEMA_TEMPLATE_KEY_SEPARATOR = CASE_KEY_SEPARATOR

type SchemaCaseVariant = 'before' | 'after'

const OPENAPI_SCHEMA_SCOPES = [
  'parameters-schema',
  'request-body-schema',
  'response-body-schema',
  'response-headers-schema',
] as const

const ASYNCAPI_SCHEMA_SCOPES = [
  'operation-message-payload',
  'operation-message-headers',
  'operation-reply-object-message-payload',
  'operation-reply-object-message-headers',
] as const

const SCHEMA_SCOPES_BY_SPEC_TYPE: Record<TestSpecType, readonly string[]> = {
  [TEST_SPEC_TYPE_OPEN_API]: OPENAPI_SCHEMA_SCOPES,
  [TEST_SPEC_TYPE_GRAPH_QL]: [],
  [TEST_SPEC_TYPE_ASYNC_API]: ASYNCAPI_SCHEMA_SCOPES,
}

const buildSchemaTemplateKey = (specType: TestSpecType, suiteId: string): string =>
  [specType, suiteId].join(SCHEMA_TEMPLATE_KEY_SEPARATOR)

/**
 * Returns true when a suiteId is a schema scope backed by a template.
 */
export const isSchemaScope = (specType: TestSpecType, suiteId: string): boolean => {
  const schemaScopes = SCHEMA_SCOPES_BY_SPEC_TYPE[specType]
  if (!schemaScopes.includes(suiteId)) {
    return false
  }
  return SchemaScopeTemplateMap.has(buildSchemaTemplateKey(specType, suiteId))
}

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
