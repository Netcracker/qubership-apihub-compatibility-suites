/**
 * Copyright 2024-2025 NetCracker Technology Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { load as loadYaml } from 'js-yaml'
import path from 'path'
import { exit } from 'process'

// If installed as a dependency, this script is executed from within `node_modules/<package>/...`.
// In that scenario we intentionally do nothing (the published package must be prebuilt).
const twoLevelsUp = path.resolve('..', '..')
if (path.basename(twoLevelsUp) === 'node_modules') {
  exit()
}

const COMPATIBILITY_SUITES_PATH = `./bin/comparison-base-suite`

const TEST_SPEC_TYPE_OPEN_API = 'openapi'
const TEST_SPEC_TYPE_GRAPH_QL = 'graphql'

// OpenAPI-only: we currently support only OAS 3.0.x and 3.1.x in the version matrix.
const VALID_OPENAPI_MAJOR_MINORS = ['3.0', '3.1']

const validateVersionPairs = (versionPairs, suiteKey) => {
  if (!Array.isArray(versionPairs) || versionPairs.length === 0) {
    throw new Error(`Invalid metadata for case '${suiteKey}': version_combinations must be a non-empty array`)
  }
  for (const pair of versionPairs) {
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new Error(`Invalid metadata for case '${suiteKey}': each version pair must be a 2-item array`)
    }
    for (const version of pair) {
      if (typeof version !== 'string') {
        throw new Error(`Invalid metadata for case '${suiteKey}': version must be a string`)
      }
      // Strictly accept only 3.0.x and 3.1.x.
      const majorMinor = version.startsWith('3.0.') ? '3.0' : version.startsWith('3.1.') ? '3.1' : null
      if (!VALID_OPENAPI_MAJOR_MINORS.includes(majorMinor)) {
        throw new Error(`Invalid metadata for case '${suiteKey}': unsupported OpenAPI version '${version}'`)
      }
    }
  }
}

const parseMetadata = (metadataPath, suiteKey) => {
  if (!existsSync(metadataPath)) {
    return null
  }
  const content = readFileSync(metadataPath, 'utf-8')
  const metadata = loadYaml(content)
  if (metadata?.version_combinations) {
    validateVersionPairs(metadata.version_combinations, suiteKey)
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

for (const suiteType of getDirectories(COMPATIBILITY_SUITES_PATH)) {
  const ext = suiteType === TEST_SPEC_TYPE_GRAPH_QL ? 'graphql' : 'yaml'

  for (const suiteId of getDirectories(`${COMPATIBILITY_SUITES_PATH}/${suiteType}`)) {
    for (const testId of getDirectories(`${COMPATIBILITY_SUITES_PATH}/${suiteType}/${suiteId}`)) {
      const basePath = `${COMPATIBILITY_SUITES_PATH}/${suiteType}/${suiteId}/${testId}`
      const beforePath = `${basePath}/before.${ext}`
      const afterPath = `${basePath}/after.${ext}`
      const suiteKey = `${suiteType}/${suiteId}/${testId}`

      const beforeExists = existsSync(beforePath)
      const afterExists = existsSync(afterPath)
      if (!beforeExists || !afterExists) {
        const missing = []
        if (!beforeExists) missing.push(beforePath)
        if (!afterExists) missing.push(afterPath)
        throw new Error(`Missing compatibility suite sample(s) for '${suiteKey}': ${missing.join(', ')}`)
      }

      const before = readFileSync(beforePath, 'utf-8')
      const after = readFileSync(afterPath, 'utf-8')
      suitesMap.push([suiteKey, { before, after }])

      // OpenAPI-only: GraphQL suites do not participate in OpenAPI version matrix.
      if (suiteType === TEST_SPEC_TYPE_OPEN_API) {
        const metadata = parseMetadata(`${basePath}/metadata.yaml`, suiteKey)
        if (metadata) {
          metaMap.push([suiteKey, metadata])
        }
      }
    }
  }
}

if (!existsSync('./generation')) {
  mkdirSync('./generation')
}

// Stable output (avoid noisy diffs across filesystems/OS).
suitesMap.sort((a, b) => a[0].localeCompare(b[0]))
metaMap.sort((a, b) => a[0].localeCompare(b[0]))

const BASE_SUITE_SERVICE = `export const TEST_SPEC_TYPE_OPEN_API = '${TEST_SPEC_TYPE_OPEN_API}'
export const TEST_SPEC_TYPE_GRAPH_QL = '${TEST_SPEC_TYPE_GRAPH_QL}'

export type TestSpecType = typeof TEST_SPEC_TYPE_OPEN_API | typeof TEST_SPEC_TYPE_GRAPH_QL

export type OpenApiVersion = string
export type OpenApiVersionPair = [OpenApiVersion, OpenApiVersion]

type CompatibilitySuiteMeta = {
  versionPairs: OpenApiVersionPair[]
}

// Default OpenAPI version pair for cases without metadata.yaml.
// Used only for enumeration/grouping (major.minor); such cases are canonical and never patched.
const DEFAULT_OPENAPI_VERSION_PAIR: OpenApiVersionPair = ['3.0.0', '3.0.0']

const patchOpenapi = (source: string, version: string): string => {
  const pattern = /^openapi:\\s*.*$/m
  if (!pattern.test(source)) {
    throw new Error('Invalid OpenAPI sample: missing root "openapi" field')
  }
  return source.replace(pattern, \`openapi: \${version}\`)
}

/**
 * Returns supported OpenAPI version pairs for an OpenAPI case.
 *
 * - With metadata.yaml: returns declared version pairs (order preserved).
 * - Without metadata.yaml: returns a single default pair for enumeration/grouping.
 */
export const getOpenApiCompatibilitySuiteVersionPairs = (
  suiteId: string,
  testId: string,
): OpenApiVersionPair[] => {
  const suiteKey = \`\${TEST_SPEC_TYPE_OPEN_API}/\${suiteId}/\${testId}\`

  if (!CompatibilitySuiteMap.has(suiteKey)) {
    throw new Error(\`Unknown compatibility suite case: (\${TEST_SPEC_TYPE_OPEN_API}, \${suiteId}, \${testId})\`)
  }

  const meta = CompatibilitySuiteMetaMap.get(suiteKey)
  return meta ? meta.versionPairs : [DEFAULT_OPENAPI_VERSION_PAIR]
}

/**
 * Returns before/after samples for a compatibility suite case.
 *
 * - If openApiVersionPair is not provided: returns stored samples as-is.
 * - If openApiVersionPair is provided:
 *   - non-OpenAPI suite types: throws (OpenAPI version matrix does not apply).
 *   - OpenAPI case without metadata.yaml: returns stored samples as-is (canonical; no patching).
 *   - OpenAPI case with metadata.yaml: patches root "openapi" in both samples and returns patched strings.
 */
export const getCompatibilitySuite = (
  suiteType: TestSpecType,
  suiteId: string,
  testId: string,
  openApiVersionPair?: OpenApiVersionPair,
): [string, string] => {
  const suiteKey = \`\${suiteType}/\${suiteId}/\${testId}\`
  const suite = CompatibilitySuiteMap.get(suiteKey)
  if (!suite) {
    return ['', '']
  }

  if (suiteType !== TEST_SPEC_TYPE_OPEN_API) {
    if (openApiVersionPair !== undefined) {
      throw new Error(
        \`openApiVersionPair is supported only for OpenAPI cases: (\${suiteType}, \${suiteId}, \${testId})\`
      )
    }
    return [suite.before, suite.after]
  }

  if (openApiVersionPair === undefined) {
    return [suite.before, suite.after]
  }

  const supportedPairs = getOpenApiCompatibilitySuiteVersionPairs(suiteId, testId)

  // Guard against passing an arbitrary OpenAPI version pair:
  // allow only pairs declared for the case (or the OpenAPI default stub when metadata is absent).
  const isSupported = supportedPairs.some(
    (pair) => pair[0] === openApiVersionPair[0] && pair[1] === openApiVersionPair[1]
  )
  if (!isSupported) {
    throw new Error(
      \`Unsupported OpenAPI version pair [\${openApiVersionPair[0]}, \${openApiVersionPair[1]}] for case (\${suiteType}, \${suiteId}, \${testId})\`
    )
  }

  // If metadata exists -> always patch (even for single pair)
  const hasMetadata = CompatibilitySuiteMetaMap.has(suiteKey)
  if (!hasMetadata) {
    return [suite.before, suite.after]
  }

  return [
    patchOpenapi(suite.before, openApiVersionPair[0]),
    patchOpenapi(suite.after, openApiVersionPair[1]),
  ]
}

/**
 * Enumerates available compatibility suite cases.
 * Returns a map: suiteId -> testIds[] (optionally filtered by specType).
 *
 * Note: enumeration-only; does not return samples/metadata.
 */
export const getCompatibilitySuites = (specType?: TestSpecType): Map<string, string[]> => {
  return [...CompatibilitySuiteMap.keys()].reduce((result, key) => {
    const [suiteType, suiteId, testId] = key.split('/')
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

writeFileSync('./generation/suite-service.ts', BASE_SUITE_SERVICE)
