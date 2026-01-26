export const TEST_SPEC_TYPE_OPEN_API = 'openapi' as const
export const TEST_SPEC_TYPE_GRAPH_QL = 'graphql' as const
export const TEST_SPEC_TYPE_ASYNC_API = 'asyncapi' as const

export type TestSpecType =
  | typeof TEST_SPEC_TYPE_OPEN_API
  | typeof TEST_SPEC_TYPE_GRAPH_QL
  | typeof TEST_SPEC_TYPE_ASYNC_API

// Logical case key (NOT a filesystem path). We use '/' for readability/stability.
export const CASE_KEY_SEPARATOR = '/' as const

/**
 * Builds a stable logical case key for a suite case.
 */
export const buildCaseKey = (suiteType: TestSpecType, suiteId: string, testId: string): string =>
  [suiteType, suiteId, testId].join(CASE_KEY_SEPARATOR)
