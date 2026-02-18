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
  'operation-receive-message-headers',
  'operation-send-message-headers',
  'operation-receive-message-payload',
  'operation-send-message-payload',
  'operation-reply-receive-message-headers',
  'operation-reply-send-message-headers',
  'operation-reply-receive-message-payload',
  'operation-reply-send-message-payload',
] as const

export const SCHEMA_SCOPES_BY_SPEC_TYPE: Record<TestSpecType, readonly string[]> = {
  [TEST_SPEC_TYPE_OPEN_API]: OPENAPI_SCHEMA_SCOPES,
  [TEST_SPEC_TYPE_GRAPH_QL]: [],
  [TEST_SPEC_TYPE_ASYNC_API]: ASYNCAPI_SCHEMA_SCOPES,
}

export const isKnownSchemaScopeId = (specType: TestSpecType, suiteId: string): boolean =>
  SCHEMA_SCOPES_BY_SPEC_TYPE[specType].includes(suiteId)
