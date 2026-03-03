import { JsonSchemaGroupCaseMap, JsonSchemaGroupIndexMap, SchemaSuiteTemplateMap } from '../../generated/suite-data'
import { buildTemplateKey, type TestSpecType } from '../suite-types'
import { type SchemaGroup, getApplicableSchemaGroups } from './schema-groups'
import { isKnownSchemaSuiteId } from './schema-suite-ids'
import { renderTemplate, type SchemaFragments } from './template-render'

export const SCHEMA_VARIANT_BEFORE = 'before' as const
export const SCHEMA_VARIANT_AFTER = 'after' as const
export type SchemaCaseVariant = typeof SCHEMA_VARIANT_BEFORE | typeof SCHEMA_VARIANT_AFTER

/**
 * Returns true when a suiteId is a schema suite backed by a template.
 */
export const isSchemaSuite = (specType: TestSpecType, suiteId: string): boolean => {
  if (!isKnownSchemaSuiteId(specType, suiteId)) {
    return false
  }
  return SchemaSuiteTemplateMap.has(buildTemplateKey(specType, suiteId))
}

/**
 * Returns the set of schema testIds applicable to a given suite type.
 * Computed from the union of caseIds across all applicable schema groups.
 */
export const getSchemaTestIdsForSuiteType = (suiteType: TestSpecType): ReadonlySet<string> => {
  const result = new Set<string>()
  for (const group of getApplicableSchemaGroups(suiteType)) {
    const ids = JsonSchemaGroupIndexMap.get(group)
    if (ids) {
      for (const id of ids) {
        result.add(id)
      }
    }
  }
  return result
}

/**
 * Returns true when a case is backed by a schema suite template + base store fragment
 * applicable for the given suite type.
 */
export const isKnownSchemaSuiteCase = (
  suiteType: TestSpecType,
  suiteId: string,
  testId: string,
): boolean =>
  isSchemaSuite(suiteType, suiteId) && getSchemaTestIdsForSuiteType(suiteType).has(testId)

/**
 * Resolves a schema fragment by walking the group chain in priority order.
 * The chain must be self-contained (include all applicable groups).
 */
const resolveSchemaFragment = (
  testId: string,
  variant: SchemaCaseVariant,
  groupChain: readonly SchemaGroup[],
): SchemaFragments => {
  for (const group of groupChain) {
    const schemaCase = JsonSchemaGroupCaseMap.get(`${group}/${testId}`)
    if (schemaCase) {
      return schemaCase[variant]
    }
  }

  throw new Error(
    `JSON schema case '${testId}' (${variant}) not found in chain [${groupChain.join(', ')}]`,
  )
}

/**
 * Composes a schema suite case by rendering a template with chain-resolved schema fragments.
 * Throws if the template or schema case is missing (data integrity error).
 */
export const composeSchemaCase = (
  specType: TestSpecType,
  suiteId: string,
  testId: string,
  variant: SchemaCaseVariant,
  groupChain: readonly SchemaGroup[],
): string => {
  const templateKey = buildTemplateKey(specType, suiteId)
  const template = SchemaSuiteTemplateMap.get(templateKey)
  if (!template) {
    throw new Error(`Schema suite template not found: ${templateKey}`)
  }

  const fragments = resolveSchemaFragment(testId, variant, groupChain)
  return renderTemplate(template, fragments)
}
