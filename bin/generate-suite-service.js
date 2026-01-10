import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { load as loadYaml } from 'js-yaml'
import path from 'path'
import { exit } from 'process'
import { fileURLToPath } from 'url'

// Prevent running generators from an installed package in node_modules.
// We only generate when executing from the repo workspace at: <PACKAGE_ROOT>/bin/*
const scriptFilePath = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(scriptFilePath) // <PACKAGE_ROOT>/bin
const PACKAGE_ROOT = path.resolve(scriptDir, '..') // <PACKAGE_ROOT>
if (PACKAGE_ROOT.split(path.sep).includes('node_modules')) {
  exit()
}

const COMPATIBILITY_SUITES_DIR = path.join(PACKAGE_ROOT, 'bin', 'comparison-base-suite')

const TEST_SPEC_TYPE_OPEN_API = 'openapi'
const TEST_SPEC_TYPE_GRAPH_QL = 'graphql'

const DEFAULT_SPEC_SAMPLE_FILE_EXT = 'yaml'
const GRAPHQL_SAMPLE_FILE_EXT = 'graphql'
const SPEC_SAMPLE_FILE_EXT_BY_SUITE_TYPE = {
  [TEST_SPEC_TYPE_GRAPH_QL]: GRAPHQL_SAMPLE_FILE_EXT,
}
const getSampleFileExt = (suiteType) =>
  SPEC_SAMPLE_FILE_EXT_BY_SUITE_TYPE[suiteType] ?? DEFAULT_SPEC_SAMPLE_FILE_EXT

const METADATA_FILE_NAME = 'metadata.yaml'

const GENERATED_SUITE_SERVICE_PATH = path.join(PACKAGE_ROOT, 'generation', 'suite-service.ts')

const VALID_OPENAPI_MAJOR_MINORS = ['3.0', '3.1']

// Logical case key (NOT a filesystem path). We use '/' for readability/stability.
const CASE_KEY_SEPARATOR = '/'
const buildCaseKey = (suiteType, suiteId, testId) =>
  [suiteType, suiteId, testId].join(CASE_KEY_SEPARATOR)

const validateSpecificationVersionPairs = (suiteType, versionPairs, caseKey) => {
  if (!Array.isArray(versionPairs) || versionPairs.length === 0) {
    throw new Error(`Invalid metadata for case '${caseKey}': version_combinations must be a non-empty array`)
  }
  for (const pair of versionPairs) {
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new Error(`Invalid metadata for case '${caseKey}': each version pair must be a 2-item array`)
    }
    for (const version of pair) {
      if (typeof version !== 'string') {
        throw new Error(`Invalid metadata for case '${caseKey}': version must be a string`)
      }
      // OpenAPI-only: strictly accept only 3.0.x and 3.1.x.
      if (suiteType === TEST_SPEC_TYPE_OPEN_API) {
        const majorMinor = version.startsWith('3.0.') ? '3.0' : version.startsWith('3.1.') ? '3.1' : null
        if (!VALID_OPENAPI_MAJOR_MINORS.includes(majorMinor)) {
          throw new Error(`Invalid metadata for case '${caseKey}': unsupported OpenAPI version '${version}'`)
        }
      }
    }
  }
}

const parseMetadata = (metadataPath, caseKey, suiteType) => {
  if (!existsSync(metadataPath)) {
    return null
  }
  const content = readFileSync(metadataPath, 'utf-8')
  const metadata = loadYaml(content)
  if (metadata?.version_combinations) {
    validateSpecificationVersionPairs(suiteType, metadata.version_combinations, caseKey)
    return { versionPairs: metadata.version_combinations }
  }
  return null
}

const getDirectories = (basePath) =>
  readdirSync(basePath, { withFileTypes: true })
    .filter((dir) => dir.isDirectory())
    .map((dir) => dir.name)
    .sort()

const suitesMap = []
const metaMap = []

for (const suiteType of getDirectories(COMPATIBILITY_SUITES_DIR)) {
  const ext = getSampleFileExt(suiteType)

  for (const suiteId of getDirectories(path.join(COMPATIBILITY_SUITES_DIR, suiteType))) {
    for (const testId of getDirectories(path.join(COMPATIBILITY_SUITES_DIR, suiteType, suiteId))) {
      const basePath = path.join(COMPATIBILITY_SUITES_DIR, suiteType, suiteId, testId)
      const beforePath = path.join(basePath, `before.${ext}`)
      const afterPath = path.join(basePath, `after.${ext}`)
      const caseKey = buildCaseKey(suiteType, suiteId, testId)

      const beforeExists = existsSync(beforePath)
      const afterExists = existsSync(afterPath)
      if (!beforeExists || !afterExists) {
        const missing = []
        if (!beforeExists) missing.push(beforePath)
        if (!afterExists) missing.push(afterPath)
        throw new Error(`Missing compatibility suite sample(s) for '${caseKey}': ${missing.join(', ')}`)
      }

      const before = readFileSync(beforePath, 'utf-8')
      const after = readFileSync(afterPath, 'utf-8')
      suitesMap.push([caseKey, { before, after }])

      // OpenAPI-only: GraphQL suites do not participate in OpenAPI version matrix.
      if (suiteType === TEST_SPEC_TYPE_OPEN_API) {
        const metadata = parseMetadata(path.join(basePath, METADATA_FILE_NAME), caseKey, suiteType)
        if (metadata) {
          metaMap.push([caseKey, metadata])
        }
      }
    }
  }
}

// Stable output (avoid noisy diffs across filesystems/OS).
suitesMap.sort((a, b) => a[0].localeCompare(b[0]))
metaMap.sort((a, b) => a[0].localeCompare(b[0]))

const BASE_SUITE_SERVICE = `export const TEST_SPEC_TYPE_OPEN_API = '${TEST_SPEC_TYPE_OPEN_API}'
export const TEST_SPEC_TYPE_GRAPH_QL = '${TEST_SPEC_TYPE_GRAPH_QL}'

export type TestSpecType = typeof TEST_SPEC_TYPE_OPEN_API | typeof TEST_SPEC_TYPE_GRAPH_QL

export type SpecificationVersion = string
export type SpecificationVersionPair = [SpecificationVersion, SpecificationVersion]

// Logical case key (NOT a filesystem path).
const CASE_KEY_SEPARATOR = '${CASE_KEY_SEPARATOR}'
const buildCaseKey = (suiteType: TestSpecType, suiteId: string, testId: string): string =>
  [suiteType, suiteId, testId].join(CASE_KEY_SEPARATOR)

type CompatibilitySuiteMeta = {
  versionPairs: SpecificationVersionPair[]
}

// Default OpenAPI version pair for cases without metadata.yaml.
// Used only for enumeration/grouping (major.minor); such cases are canonical and never patched.
const DEFAULT_OPENAPI_VERSION_PAIR: SpecificationVersionPair = ['3.0.0', '3.0.0']

// Non-OpenAPI suites currently do not participate in any version matrix.
// Keep a stable stub for external contract (future-proofing).
const DEFAULT_NON_OPENAPI_VERSION_PAIR: SpecificationVersionPair = ['unversioned', 'unversioned']

type VersionPairPolicy = {
  defaultPair: SpecificationVersionPair
  patchSamples?: (
    before: string,
    after: string,
    specificationVersionPair: SpecificationVersionPair,
  ) => [string, string]
}

// Configuration per suiteType. Extend this map to support specificationVersionPair for new suite types.
const VERSION_PAIR_POLICY_BY_SUITE_TYPE: Record<TestSpecType, VersionPairPolicy> = {
  [TEST_SPEC_TYPE_OPEN_API]: {
    defaultPair: DEFAULT_OPENAPI_VERSION_PAIR,
    patchSamples: (before, after, specificationVersionPair) => [
      patchOpenApiVersion(before, specificationVersionPair[0]),
      patchOpenApiVersion(after, specificationVersionPair[1]),
    ],
  },
  [TEST_SPEC_TYPE_GRAPH_QL]: {
    defaultPair: DEFAULT_NON_OPENAPI_VERSION_PAIR,
  },
}

/**
 * Returns the version-pair policy for a suite type (default pair + optional patch strategy).
 * Throws if suiteType has no VersionPairPolicy entry.
 */
const getVersionPairPolicy = (suiteType: TestSpecType): VersionPairPolicy => {
  const policy = VERSION_PAIR_POLICY_BY_SUITE_TYPE[suiteType]
  if (!policy) {
    // Should never happen because suiteType is a union, but keep a clear runtime error.
    throw new Error(\`Unknown suiteType for VersionPairPolicy lookup: \${suiteType}\`)
  }
  return policy
}

/**
 * Returns version pairs declared in metadata.yaml for the case, or undefined when metadata is absent.
 * Note: currently metadata-based version pairs are supported only for OpenAPI.
 */
const getMetadataVersionPairs = (
  suiteType: TestSpecType,
  caseKey: string,
): SpecificationVersionPair[] | undefined => {
  if (suiteType !== TEST_SPEC_TYPE_OPEN_API) {
    return undefined
  }
  return CompatibilitySuiteMetaMap.get(caseKey)?.versionPairs
}

/**
 * Patches only the root "openapi:" line in an OpenAPI YAML string.
 * Throws if the root "openapi" field is missing.
 */
const patchOpenApiVersion = (source: string, version: string): string => {
  const pattern = /^openapi:\\s*.*$/m
  if (!pattern.test(source)) {
    throw new Error('Invalid OpenAPI sample: missing root "openapi" field')
  }
  return source.replace(pattern, \`openapi: \${version}\`)
}

/**
 * Returns supported specification version pairs for a compatibility suite case.
 *
 * - OpenAPI:
 *   - With metadata.yaml: returns declared version pairs (order preserved).
 *   - Without metadata.yaml: returns a single default pair for enumeration/grouping.
 * - Non-OpenAPI: returns a single default pair (stub; no version matrix yet).
 */
export const getCompatibilitySuiteSpecificationVersionPairs = (
  suiteType: TestSpecType,
  suiteId: string,
  testId: string,
): SpecificationVersionPair[] => {
  const caseKey = buildCaseKey(suiteType, suiteId, testId)

  if (!CompatibilitySuiteMap.has(caseKey)) {
    throw new Error(\`Unknown compatibility suite case: (\${suiteType}, \${suiteId}, \${testId})\`)
  }

  const versionPairPolicy = getVersionPairPolicy(suiteType)
  const metadataVersionPairs = getMetadataVersionPairs(suiteType, caseKey)
  return metadataVersionPairs ? metadataVersionPairs : [versionPairPolicy.defaultPair]
}

/**
 * Returns before/after samples for a compatibility suite case.
 *
 * - If specificationVersionPair is not provided: returns stored samples as-is.
 * - If specificationVersionPair is provided:
 *   - suite types without a version-pair patch strategy: throws (currently OpenAPI-only).
 *   - case without metadata.yaml: returns stored samples as-is (canonical; no patching).
 *   - case with metadata.yaml: patches samples according to the provided pair and returns patched strings.
 */
export const getCompatibilitySuite = (
  suiteType: TestSpecType,
  suiteId: string,
  testId: string,
  specificationVersionPair?: SpecificationVersionPair,
): [string, string] => {
  const caseKey = buildCaseKey(suiteType, suiteId, testId)
  const suite = CompatibilitySuiteMap.get(caseKey)
  if (!suite) {
    return ['', '']
  }

  if (specificationVersionPair === undefined) {
    return [suite.before, suite.after]
  }

  const versionPairPolicy = getVersionPairPolicy(suiteType)

  if (!versionPairPolicy.patchSamples) {
    throw new Error(
      \`specificationVersionPair is currently supported only for OpenAPI cases: (\${suiteType}, \${suiteId}, \${testId})\`
    )
  }

  const supportedPairs = getCompatibilitySuiteSpecificationVersionPairs(suiteType, suiteId, testId)

  // Guard against passing an arbitrary version pair:
  // allow only pairs declared for the case (or the suite-type default stub when metadata is absent).
  const isSupported = supportedPairs.some(
    (pair) => pair[0] === specificationVersionPair[0] && pair[1] === specificationVersionPair[1]
  )
  if (!isSupported) {
    throw new Error(
      \`Unsupported specificationVersionPair [\${specificationVersionPair[0]}, \${specificationVersionPair[1]}] for case (\${suiteType}, \${suiteId}, \${testId})\`
    )
  }

  // Patching semantics:
  // - without metadata.yaml: samples are canonical, never patched.
  // - with metadata.yaml: always patch (even for single pair).
  const metadataVersionPairs = getMetadataVersionPairs(suiteType, caseKey)
  if (!metadataVersionPairs) {
    return [suite.before, suite.after]
  }

  return versionPairPolicy.patchSamples(suite.before, suite.after, specificationVersionPair)
}

/**
 * Enumerates available compatibility suite cases.
 * Returns a map: suiteId -> testIds[] (optionally filtered by specType).
 *
 * Note: enumeration-only; does not return samples/metadata.
 */
export const getCompatibilitySuites = (specType?: TestSpecType): Map<string, string[]> => {
  return [...CompatibilitySuiteMap.keys()].reduce((result, caseKey) => {
    const [suiteType, suiteId, testId] = caseKey.split(CASE_KEY_SEPARATOR)
    if (specType && specType !== suiteType) {
      return result
    }
    const testIds = result.get(suiteId)
    result.set(suiteId, testIds ? [...testIds, testId] : [testId])
    return result
  }, new Map()) as Map<string, string[]>
}

const CompatibilitySuiteMap = new Map(${JSON.stringify(suitesMap)})
const CompatibilitySuiteMetaMap = new Map<string, CompatibilitySuiteMeta>(${JSON.stringify(metaMap)})
`

mkdirSync(path.dirname(GENERATED_SUITE_SERVICE_PATH), { recursive: true })
writeFileSync(GENERATED_SUITE_SERVICE_PATH, BASE_SUITE_SERVICE)
