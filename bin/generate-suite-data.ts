import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { load as loadYaml } from 'js-yaml'
import path from 'path'
import { exit } from 'process'
import { fileURLToPath } from 'url'

import { isKnownSchemaScopeId } from '../src/schema/schema-scopes'
import {
  buildCaseKey,
  buildTemplateKey,
  isKnownSuiteType,
  TEST_SPEC_TYPE_GRAPH_QL,
  TEST_SPEC_TYPE_OPEN_API,
  type TestSpecType,
} from '../src/shared/suite-shared'

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
}
const getSampleFileExt = (suiteType: TestSpecType): string => SPEC_SAMPLE_FILE_EXT_BY_SUITE_TYPE[suiteType]

const METADATA_FILE_NAME = 'metadata.yaml'

const GENERATED_SUITE_DATA_PATH = path.join(PACKAGE_ROOT, 'generated', 'suite-data.ts')

type CompatibilitySuite = { before: string; after: string }
type CompatibilitySuiteMeta = { versionPairs: [string, string][] }
type SchemaFragments = { schema: string }
type JsonSchemaCase = { before: SchemaFragments; after: SchemaFragments }

const readTextFile = (filePath: string): string => readFileSync(filePath, 'utf-8')

const assertFileExists = (filePath: string, errorMessage: string): void => {
  if (!existsSync(filePath)) {
    throw new Error(errorMessage)
  }
}

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
        if (!majorMinor) {
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
  const content = readTextFile(metadataPath)
  const metadata: unknown = loadYaml(content)
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error(`Invalid metadata for case '${caseKey}': expected a YAML mapping/object`)
  }
  const versionCombinations = (metadata as Record<string, unknown>).version_combinations

  validateSpecificationVersionPairs(suiteType, versionCombinations, caseKey)
  return { versionPairs: versionCombinations as CompatibilitySuiteMeta['versionPairs'] }
}

const getDirectories = (basePath: string): string[] =>
  readdirSync(basePath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .sort()

const main = (): void => {
  const suitesMap: Array<[string, CompatibilitySuite]> = []
  const metaMap: Array<[string, CompatibilitySuiteMeta]> = []
  const schemaCaseMap: Array<[string, JsonSchemaCase]> = []
  const schemaCaseIds = new Set<string>()
  const schemaScopeTemplateMap: Array<[string, string]> = []
  const schemaScopeTemplateKeys = new Set<string>()

  // Scan schema base store for reusable JSON Schema cases
  if (existsSync(SCHEMA_BASE_STORE_DIR)) {
    for (const caseId of getDirectories(SCHEMA_BASE_STORE_DIR)) {
      const caseDir = path.join(SCHEMA_BASE_STORE_DIR, caseId)
      const beforePath = path.join(caseDir, `before.${SCHEMA_FRAGMENT_FILE_EXT}`)
      const afterPath = path.join(caseDir, `after.${SCHEMA_FRAGMENT_FILE_EXT}`)
      const missingFragmentsError = `Missing JSON schema case fragment(s) for '${caseId}'`
      assertFileExists(beforePath, missingFragmentsError)
      assertFileExists(afterPath, missingFragmentsError)
      const before = readTextFile(beforePath)
      const after = readTextFile(afterPath)
      schemaCaseIds.add(caseId)
      schemaCaseMap.push([caseId, { before: { schema: before }, after: { schema: after } }])
    }
  }

  const suiteTypeDirs = getDirectories(COMPATIBILITY_SUITES_DIR).filter((dir) => dir !== 'schemas')

  // First pass: collect schema-scope templates
  for (const suiteTypeDir of suiteTypeDirs) {
    if (!isKnownSuiteType(suiteTypeDir)) {
      throw new Error(`Unknown suiteType directory: ${suiteTypeDir}`)
    }
    for (const suiteId of getDirectories(path.join(COMPATIBILITY_SUITES_DIR, suiteTypeDir))) {
      const templatePath = path.join(COMPATIBILITY_SUITES_DIR, suiteTypeDir, suiteId, SCHEMA_TEMPLATE_FILE_NAME)
      if (existsSync(templatePath)) {
        if (!isKnownSchemaScopeId(suiteTypeDir, suiteId)) {
          throw new Error(`Schema-scope template found in unknown scope: ${suiteTypeDir}/${suiteId}`)
        }
        const templateKey = buildTemplateKey(suiteTypeDir, suiteId)
        schemaScopeTemplateMap.push([templateKey, readTextFile(templatePath)])
        schemaScopeTemplateKeys.add(templateKey)
      }
    }
  }

  // Second pass: collect suite samples and metadata
  for (const suiteTypeDir of suiteTypeDirs) {
    if (!isKnownSuiteType(suiteTypeDir)) {
      throw new Error(`Unknown suiteType directory: ${suiteTypeDir}`)
    }
    const ext = getSampleFileExt(suiteTypeDir)

    for (const suiteId of getDirectories(path.join(COMPATIBILITY_SUITES_DIR, suiteTypeDir))) {
      const templateKey = buildTemplateKey(suiteTypeDir, suiteId)
      const isSchemaScope = schemaScopeTemplateKeys.has(templateKey)

      for (const testId of getDirectories(path.join(COMPATIBILITY_SUITES_DIR, suiteTypeDir, suiteId))) {
        const basePath = path.join(COMPATIBILITY_SUITES_DIR, suiteTypeDir, suiteId, testId)
        const beforePath = path.join(basePath, `before.${ext}`)
        const afterPath = path.join(basePath, `after.${ext}`)
        const caseKey = buildCaseKey(suiteTypeDir, suiteId, testId)

        const beforeExists = existsSync(beforePath)
        const afterExists = existsSync(afterPath)
        if (beforeExists !== afterExists) {
          const missing: string[] = []
          if (!beforeExists) missing.push(beforePath)
          if (!afterExists) missing.push(afterPath)
          throw new Error(`Missing compatibility suite sample(s) for '${caseKey}': ${missing.join(', ')}`)
        }

        // Schema-scope cases are either:
        // - rendered from base-store schema fragments (no full before/after samples on disk)
        // - or full-sample exceptions (before/after exist on disk) that do not require base fragments
        if (isSchemaScope && !beforeExists && !afterExists && !schemaCaseIds.has(testId)) {
          throw new Error(
            `Schema-scope case '${caseKey}' is missing JSON schema fragments in base store: ${testId}`,
          )
        }

        if (beforeExists && afterExists) {
          const before = readTextFile(beforePath)
          const after = readTextFile(afterPath)
          suitesMap.push([caseKey, { before, after }])
        } else if (!isSchemaScope) {
          throw new Error(`Missing compatibility suite sample(s) for '${caseKey}': ${beforePath}, ${afterPath}`)
        }

        // OpenAPI-only: GraphQL suites do not participate in OpenAPI version matrix.
        if (suiteTypeDir === TEST_SPEC_TYPE_OPEN_API) {
          const metadata = parseMetadata(path.join(basePath, METADATA_FILE_NAME), caseKey, suiteTypeDir)
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
}

main()
