import {
  TEST_SPEC_TYPE_ASYNC_API,
  TEST_SPEC_TYPE_GRAPH_QL,
  TEST_SPEC_TYPE_OPEN_API,
  type TestSpecType,
} from '../shared/suite-shared'

export const OPENAPI_SCHEMA_SCOPES = [
  'parameters-schema',
  'request-body-schema',
  'response-body-schema',
  'response-headers-schema',
] as const

export const ASYNCAPI_SCHEMA_SCOPES = [
  'operation-message-headers-receive',
  'operation-message-headers-send',
  'operation-message-payload-receive',
  'operation-message-payload-send',
  'operation-reply-object-message-headers-receive',
  'operation-reply-object-message-headers-send',
  'operation-reply-object-message-payload-receive',
  'operation-reply-object-message-payload-send',
] as const

export const SCHEMA_SCOPES_BY_SPEC_TYPE: Record<TestSpecType, readonly string[]> = {
  [TEST_SPEC_TYPE_OPEN_API]: OPENAPI_SCHEMA_SCOPES,
  [TEST_SPEC_TYPE_GRAPH_QL]: [],
  [TEST_SPEC_TYPE_ASYNC_API]: ASYNCAPI_SCHEMA_SCOPES,
}

export const isKnownSchemaScopeId = (specType: TestSpecType, suiteId: string): boolean =>
  SCHEMA_SCOPES_BY_SPEC_TYPE[specType].includes(suiteId)
