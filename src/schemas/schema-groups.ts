import {
  TEST_SPEC_TYPE_ASYNC_API,
  TEST_SPEC_TYPE_OPEN_API,
  type TestSpecType,
} from '../suite-types'

const SCHEMA_GROUP_COMMON = 'common' as const
const SCHEMA_GROUP_OPENAPI = 'openapi' as const
const SCHEMA_GROUP_OPENAPI_30 = 'openapi-30' as const
const SCHEMA_GROUP_DRAFT_07 = 'draft-07' as const

/**
 * All schema groups that can exist on disk.
 */
const SCHEMA_GROUPS = [
  SCHEMA_GROUP_COMMON,
  SCHEMA_GROUP_OPENAPI,
  SCHEMA_GROUP_OPENAPI_30,
  SCHEMA_GROUP_DRAFT_07,
] as const

export type SchemaGroup = typeof SCHEMA_GROUPS[number]

export const isAllowedSchemaGroup = (value: string): value is SchemaGroup =>
  (SCHEMA_GROUPS as readonly string[]).includes(value)

// Schema group chains: self-contained ordered lists of groups for fragment resolution.
// Each chain includes ALL groups whose cases are resolvable for the given suiteType+version.
// First match wins: the chain is ordered from most specific to most general.
// Key format: `${suiteType}` or `${suiteType}:${majorMinor}`.

const buildChainKey = (suiteType: TestSpecType, specVersion?: string): string =>
  specVersion ? `${suiteType}:${specVersion}` : suiteType

const SCHEMA_GROUP_CHAINS: ReadonlyMap<string, readonly SchemaGroup[]> = new Map([
  [buildChainKey(TEST_SPEC_TYPE_ASYNC_API), [SCHEMA_GROUP_DRAFT_07, SCHEMA_GROUP_COMMON]],
  [buildChainKey(TEST_SPEC_TYPE_OPEN_API, '3.0'), [SCHEMA_GROUP_OPENAPI_30, SCHEMA_GROUP_OPENAPI, SCHEMA_GROUP_COMMON, SCHEMA_GROUP_DRAFT_07]],
  [buildChainKey(TEST_SPEC_TYPE_OPEN_API, '3.1'), [SCHEMA_GROUP_DRAFT_07, SCHEMA_GROUP_OPENAPI, SCHEMA_GROUP_COMMON, SCHEMA_GROUP_OPENAPI_30]],
])

/**
 * Returns the ordered schema group chain for fragment resolution.
 * The chain is self-contained: it includes every group whose cases are
 * resolvable for the given suiteType and spec version.
 *
 * Looks up by `suiteType:specVersion` first, then by `suiteType` alone.
 * Throws if no chain is configured.
 */
export const getSchemaGroupChain = (
  suiteType: TestSpecType,
  specVersion?: string,
): readonly SchemaGroup[] => {
  if (specVersion) {
    const versioned = SCHEMA_GROUP_CHAINS.get(buildChainKey(suiteType, specVersion))
    if (versioned) {
      return versioned
    }
  }
  const chain = SCHEMA_GROUP_CHAINS.get(buildChainKey(suiteType))
  if (chain) {
    return chain
  }
  throw new Error(`No schema group chain configured for (${suiteType}, ${specVersion ?? 'default'})`)
}

/**
 * Returns the union of schema groups across all chains for the given suite type.
 * Used to enumerate all applicable testIds regardless of spec version.
 */
export const getApplicableSchemaGroups = (suiteType: TestSpecType): readonly SchemaGroup[] => {
  const groups = new Set<SchemaGroup>()
  for (const [key, chain] of SCHEMA_GROUP_CHAINS) {
    if (key === suiteType || key.startsWith(`${suiteType}:`)) {
      for (const g of chain) {
        groups.add(g)
      }
    }
  }
  if (groups.size === 0) {
    throw new Error(`No schema group chains configured for suite type: ${suiteType}`)
  }
  return [...groups]
}
