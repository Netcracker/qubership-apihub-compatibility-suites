import {
  TEST_SPEC_TYPE_ASYNC_API,
  TEST_SPEC_TYPE_GRAPH_QL,
  TEST_SPEC_TYPE_OPEN_API,
  type TestSpecType,
} from '../suite-types'

const OPENAPI_SCHEMA_SUITE_IDS = [
  'parameters-schema',
  'request-body-schema',
  'response-body-schema',
  'response-headers-schema',
] as const

const ASYNCAPI_SCHEMA_SUITE_IDS = [
  'operation-receive-message-headers',
  'operation-send-message-headers',
  'operation-receive-message-payload',
  'operation-send-message-payload',
  'operation-reply-receive-message-headers',
  'operation-reply-send-message-headers',
  'operation-reply-receive-message-payload',
  'operation-reply-send-message-payload',
] as const

const SCHEMA_SUITE_IDS_BY_SPEC_TYPE: Record<TestSpecType, readonly string[]> = {
  [TEST_SPEC_TYPE_OPEN_API]: OPENAPI_SCHEMA_SUITE_IDS,
  [TEST_SPEC_TYPE_GRAPH_QL]: [],
  [TEST_SPEC_TYPE_ASYNC_API]: ASYNCAPI_SCHEMA_SUITE_IDS,
}

// Schema test IDs that use OpenAPI-specific vocabulary/dialect features
// and are not valid under AsyncAPI (draft-07) or other non-OpenAPI specs.
const OPENAPI_ONLY_SCHEMA_TEST_IDS: ReadonlySet<string> = new Set([
  // xml
  'add-attribute-with-default-value-for-xml',
  'add-xml-name-replacement-for-property',
  'add-xml-name-replacement-for-schema',
  'add-xml-prefix-and-namespace-for-schema',
  'add-xml-wrapped-for-array-property',
  'add-xml-wrapped-with-default-value-for-array-property',
  'mark-property-as-xml-attribute',
  'mark-property-as-xml-element',
  'remove-attribute-with-default-value-for-xml',
  'remove-xml-name-replacement-for-property',
  'remove-xml-name-replacement-for-schema',
  'remove-xml-prefix-and-namespace-for-schema',
  'remove-xml-wrapped-for-array-property',
  'remove-xml-wrapped-with-default-value-for-array-property',
  'update-xml-name-replacement-for-property',
  'update-xml-name-replacement-for-schema',
  'update-xml-prefix-for-schema',
  // Discriminator Object
  'add-discriminator-for-any-of',
  'add-discriminator-for-one-of',
  'remove-discriminator-for-any-of',
  'remove-discriminator-for-one-of',
  'update-discriminator-for-any-of',
  'update-discriminator-for-one-of',
  // nullable (OpenAPI 3.0 keyword, not JSON Schema)
  'mark-schema-value-as-non-nullable',
  'mark-schema-value-as-nullable',
  'nullable-equivalent-to-null',
  // OpenAPI 3.0 boolean exclusiveMaximum/exclusiveMinimum
  'mark-maximum-value-as-exclusive-for-number-property',
  'mark-maximum-value-as-inclusive-for-number-property',
  'mark-minimum-value-as-exclusive-for-number-property',
  'mark-minimum-value-as-inclusive-for-number-property',
  'update-specific-type-to-number-with-exclusive-value',
])

export const isKnownSchemaSuiteId = (specType: TestSpecType, suiteId: string): boolean =>
  SCHEMA_SUITE_IDS_BY_SPEC_TYPE[specType].includes(suiteId)

export const omitOpenApiOnlyTestIdsForNonOpenApi = (specType: TestSpecType, testIds: string[]): string[] => {
  if (specType === TEST_SPEC_TYPE_OPEN_API) {
    return testIds
  }
  return testIds.filter((id) => !OPENAPI_ONLY_SCHEMA_TEST_IDS.has(id))
}
