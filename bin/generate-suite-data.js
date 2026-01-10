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
const getSampleFileExt = (suiteType) => SPEC_SAMPLE_FILE_EXT_BY_SUITE_TYPE[suiteType] ?? DEFAULT_SPEC_SAMPLE_FILE_EXT

const METADATA_FILE_NAME = 'metadata.yaml'

const GENERATED_SUITE_DATA_PATH = path.join(PACKAGE_ROOT, 'generated', 'suite-data.ts')

const VALID_OPENAPI_MAJOR_MINORS = ['3.0', '3.1']

// Logical case key (NOT a filesystem path). We use '/' for readability/stability.
const CASE_KEY_SEPARATOR = '/'
const buildCaseKey = (suiteType, suiteId, testId) => [suiteType, suiteId, testId].join(CASE_KEY_SEPARATOR)

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

const suitesJson = JSON.stringify(suitesMap)
const metaJson = JSON.stringify(metaMap)

const out = `// @generated
// This file is auto-generated from bin/comparison-base-suite/**. Do not edit manually.

type CompatibilitySuite = { before: string; after: string }
type CompatibilitySuiteMeta = { versionPairs: [string, string][] }

export const CompatibilitySuiteMap = new Map<string, CompatibilitySuite>(${suitesJson})
export const CompatibilitySuiteMetaMap = new Map<string, CompatibilitySuiteMeta>(${metaJson})
`

mkdirSync(path.dirname(GENERATED_SUITE_DATA_PATH), { recursive: true })
writeFileSync(GENERATED_SUITE_DATA_PATH, out)
