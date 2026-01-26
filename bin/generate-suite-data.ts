import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { load as loadYaml } from 'js-yaml'
import path from 'path'
import { exit } from 'process'
import { fileURLToPath } from 'url'

import {
  buildCaseKey,
  CASE_KEY_SEPARATOR,
  TEST_SPEC_TYPE_ASYNC_API,
  TEST_SPEC_TYPE_GRAPH_QL,
  TEST_SPEC_TYPE_OPEN_API,
  type TestSpecType,
} from '../src/suite-shared'

// Prevent running generators from an installed package in node_modules.
// We only generate when executing from the repo workspace at: <PACKAGE_ROOT>/bin/*
const scriptFilePath = fileURLToPath(import.meta.url)
const scriptDir = path.dirname(scriptFilePath) // <PACKAGE_ROOT>/bin
const PACKAGE_ROOT = path.resolve(scriptDir, '..') // <PACKAGE_ROOT>
if (PACKAGE_ROOT.split(path.sep).includes('node_modules')) {
  exit()
}

const COMPATIBILITY_SUITES_DIR = path.join(PACKAGE_ROOT, 'bin', 'comparison-base-suite')
const SCHEMA_BASE_STORE_DIR = path.join(COMPATIBILITY_SUITES_DIR, 'schemas', 'json-schema')

const DEFAULT_SPEC_SAMPLE_FILE_EXT = 'yaml'
const GRAPHQL_SAMPLE_FILE_EXT = 'graphql'
const SCHEMA_FRAGMENT_FILE_EXT = 'yaml'
const SCHEMA_TEMPLATE_FILE_NAME = 'template.yaml.tpl'

const SPEC_SAMPLE_FILE_EXT_BY_SUITE_TYPE: Record<TestSpecType, string> = {
  [TEST_SPEC_TYPE_OPEN_API]: DEFAULT_SPEC_SAMPLE_FILE_EXT,
  [TEST_SPEC_TYPE_GRAPH_QL]: GRAPHQL_SAMPLE_FILE_EXT,
  [TEST_SPEC_TYPE_ASYNC_API]: DEFAULT_SPEC_SAMPLE_FILE_EXT,
}
const getSampleFileExt = (suiteType: TestSpecType): string => SPEC_SAMPLE_FILE_EXT_BY_SUITE_TYPE[suiteType]

const METADATA_FILE_NAME = 'metadata.yaml'

const GENERATED_SUITE_DATA_PATH = path.join(PACKAGE_ROOT, 'generated', 'suite-data.ts')

const VALID_OPENAPI_MAJOR_MINORS = ['3.0', '3.1'] as const

type CompatibilitySuite = { before: string; after: string }
type CompatibilitySuiteMeta = { versionPairs: [string, string][] }
type SchemaFragments = { schema: string }
type JsonSchemaCase = { before: SchemaFragments; after: SchemaFragments }

const isUnknownArray = (value: unknown): value is unknown[] => Array.isArray(value)

const validateSpecificationVersionPairs = (
  suiteType: TestSpecType,
  versionPairs: unknown,
  caseKey: string,
): void => {
  if (!isUnknownArray(versionPairs) || versionPairs.length === 0) {
    throw new Error(`Invalid metadata for case '${caseKey}': version_combinations must be a non-empty array`)
  }
  for (const pair of versionPairs) {
    if (!isUnknownArray(pair) || pair.length !== 2) {
      throw new Error(`Invalid metadata for case '${caseKey}': each version pair must be a 2-item array`)
    }

    const [beforeVersion, afterVersion] = pair
    if (typeof beforeVersion !== 'string' || typeof afterVersion !== 'string') {
      throw new Error(`Invalid metadata for case '${caseKey}': version must be a string`)
    }

    // OpenAPI-only: strictly accept only 3.0.x and 3.1.x.
    if (suiteType === TEST_SPEC_TYPE_OPEN_API) {
      for (const version of [beforeVersion, afterVersion]) {
        const majorMinor = version.startsWith('3.0.') ? '3.0' : version.startsWith('3.1.') ? '3.1' : null
        if (!majorMinor || !VALID_OPENAPI_MAJOR_MINORS.includes(majorMinor)) {
          throw new Error(`Invalid metadata for case '${caseKey}': unsupported OpenAPI version '${version}'`)
        }
      }
    }
  }
}

const parseMetadata = (
  metadataPath: string,
  caseKey: string,
  suiteType: TestSpecType,
): CompatibilitySuiteMeta | null => {
  if (!existsSync(metadataPath)) {
    return null
  }
  const content = readFileSync(metadataPath, 'utf-8')
  const metadata: unknown = loadYaml(content)
  if (!metadata || typeof metadata !== 'object') {
    return null
  }

  const versionCombinations = (metadata as Record<string, unknown>).version_combinations
  if (versionCombinations === undefined) {
    return null
  }

  validateSpecificationVersionPairs(suiteType, versionCombinations, caseKey)
  return { versionPairs: versionCombinations as CompatibilitySuiteMeta['versionPairs'] }
}

const getDirectories = (basePath: string): string[] =>
  readdirSync(basePath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .sort()

const buildSchemaTemplateKey = (suiteType: TestSpecType, suiteId: string): string =>
  [suiteType, suiteId].join(CASE_KEY_SEPARATOR)

const suitesMap: Array<[string, CompatibilitySuite]> = []
const metaMap: Array<[string, CompatibilitySuiteMeta]> = []
const schemaCaseMap: Array<[string, JsonSchemaCase]> = []
const schemaScopeTemplateMap: Array<[string, string]> = []
const schemaScopeTemplateKeys = new Set<string>()

const isKnownSuiteType = (suiteTypeDir: string): suiteTypeDir is TestSpecType =>
  suiteTypeDir === TEST_SPEC_TYPE_OPEN_API ||
  suiteTypeDir === TEST_SPEC_TYPE_GRAPH_QL ||
  suiteTypeDir === TEST_SPEC_TYPE_ASYNC_API

if (existsSync(SCHEMA_BASE_STORE_DIR)) {
  for (const caseId of getDirectories(SCHEMA_BASE_STORE_DIR)) {
    const caseDir = path.join(SCHEMA_BASE_STORE_DIR, caseId)
    const beforePath = path.join(caseDir, `before.${SCHEMA_FRAGMENT_FILE_EXT}`)
    const afterPath = path.join(caseDir, `after.${SCHEMA_FRAGMENT_FILE_EXT}`)
    if (!existsSync(beforePath) || !existsSync(afterPath)) {
      throw new Error(`Missing JSON schema case fragment(s) for '${caseId}'`)
    }
    const before = readFileSync(beforePath, 'utf-8')
    const after = readFileSync(afterPath, 'utf-8')
    schemaCaseMap.push([caseId, { before: { schema: before }, after: { schema: after } }])
  }
}

const suiteTypeDirs = getDirectories(COMPATIBILITY_SUITES_DIR).filter((suiteTypeDir) => suiteTypeDir !== 'schemas')

for (const suiteTypeDir of suiteTypeDirs) {
  if (!isKnownSuiteType(suiteTypeDir)) {
    throw new Error(`Unknown suiteType directory: ${suiteTypeDir}`)
  }
  const suiteType: TestSpecType = suiteTypeDir
  for (const suiteId of getDirectories(path.join(COMPATIBILITY_SUITES_DIR, suiteType))) {
    const templatePath = path.join(COMPATIBILITY_SUITES_DIR, suiteType, suiteId, SCHEMA_TEMPLATE_FILE_NAME)
    if (existsSync(templatePath)) {
      const templateKey = buildSchemaTemplateKey(suiteType, suiteId)
      schemaScopeTemplateMap.push([templateKey, readFileSync(templatePath, 'utf-8')])
      schemaScopeTemplateKeys.add(templateKey)
    }
  }
}

for (const suiteTypeDir of suiteTypeDirs) {
  if (!isKnownSuiteType(suiteTypeDir)) {
    throw new Error(`Unknown suiteType directory: ${suiteTypeDir}`)
  }
  const suiteType: TestSpecType = suiteTypeDir
  const ext = getSampleFileExt(suiteType)

  for (const suiteId of getDirectories(path.join(COMPATIBILITY_SUITES_DIR, suiteType))) {
    const templateKey = buildSchemaTemplateKey(suiteType, suiteId)
    const isSchemaScope = schemaScopeTemplateKeys.has(templateKey)

    for (const testId of getDirectories(path.join(COMPATIBILITY_SUITES_DIR, suiteType, suiteId))) {
      const basePath = path.join(COMPATIBILITY_SUITES_DIR, suiteType, suiteId, testId)
      const beforePath = path.join(basePath, `before.${ext}`)
      const afterPath = path.join(basePath, `after.${ext}`)
      const caseKey = buildCaseKey(suiteType, suiteId, testId)

      const beforeExists = existsSync(beforePath)
      const afterExists = existsSync(afterPath)
      if (beforeExists !== afterExists) {
        const missing: string[] = []
        if (!beforeExists) missing.push(beforePath)
        if (!afterExists) missing.push(afterPath)
        throw new Error(`Missing compatibility suite sample(s) for '${caseKey}': ${missing.join(', ')}`)
      }
      if (beforeExists && afterExists) {
        const before = readFileSync(beforePath, 'utf-8')
        const after = readFileSync(afterPath, 'utf-8')
        suitesMap.push([caseKey, { before, after }])
      } else if (!isSchemaScope) {
        throw new Error(`Missing compatibility suite sample(s) for '${caseKey}': ${beforePath}, ${afterPath}`)
      }

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
schemaCaseMap.sort((a, b) => a[0].localeCompare(b[0]))
schemaScopeTemplateMap.sort((a, b) => a[0].localeCompare(b[0]))

const suitesJson = JSON.stringify(suitesMap)
const metaJson = JSON.stringify(metaMap)
const schemaCasesJson = JSON.stringify(schemaCaseMap)
const schemaTemplatesJson = JSON.stringify(schemaScopeTemplateMap)

const out = `// @generated
// This file is auto-generated from bin/comparison-base-suite/**. Do not edit manually.

type CompatibilitySuite = { before: string; after: string }
type CompatibilitySuiteMeta = { versionPairs: [string, string][] }
type SchemaFragments = { schema: string }
type JsonSchemaCase = { before: SchemaFragments; after: SchemaFragments }

export const CompatibilitySuiteMap = new Map<string, CompatibilitySuite>(${suitesJson})
export const CompatibilitySuiteMetaMap = new Map<string, CompatibilitySuiteMeta>(${metaJson})
export const JsonSchemaCaseMap = new Map<string, JsonSchemaCase>(${schemaCasesJson})
export const SchemaScopeTemplateMap = new Map<string, string>(${schemaTemplatesJson})
`

mkdirSync(path.dirname(GENERATED_SUITE_DATA_PATH), { recursive: true })
writeFileSync(GENERATED_SUITE_DATA_PATH, out)
