import { existsSync, readdirSync, readFileSync } from 'fs'
import path from 'path'

import { Parser } from '@asyncapi/parser'
import type { RulesetOptions } from '@asyncapi/parser/esm/ruleset'

import { TEST_SPEC_TYPE_ASYNC_API } from '../src/suite-types'

/**
 * Every hand-authored AsyncAPI sample in the corpus must be a valid AsyncAPI document.
 *
 * This belongs here rather than in each consumer. The samples are this package's product; a
 * consumer reading one through `getCompatibilitySuite` has no way to tell a malformed document
 * from a genuine diff result, and every consumer would otherwise re-parse the whole corpus on
 * every test run.
 *
 * Scope is the **full-sample** suites - the case directories holding `before.yaml` / `after.yaml`.
 * Schema suites are deliberately excluded: they render one hand-written `template.yaml.tpl`
 * against the JSON-Schema base store, so covering them would parse a few thousand near-identical
 * documents to re-check a single template.
 */

const ASYNC_API_SUITES_DIR = path.join(
  __dirname, '..', 'bin', 'comparison-base-suite', TEST_SPEC_TYPE_ASYNC_API,
)

const SAMPLE_FILE_NAMES = ['before.yaml', 'after.yaml'] as const

/**
 * Parser ruleset with one rule intentionally suppressed.
 *
 * asyncapi-latest-version: fires when the document uses AsyncAPI 3.0.0 instead of the newest
 * version known to the parser. The corpus pins 3.0.0 on purpose, so this is noise rather than a
 * defect. Turning the rule off beats filtering its output afterwards: a filter also hides the rule
 * firing for a reason we did not anticipate, and it has to be repeated by every consumer.
 *
 * Mirrors `ASYNCAPI_PARSER_RULESET` in api-processor's `src/apitypes/async/async.parser.ts`.
 */
const ASYNCAPI_PARSER_RULESET: RulesetOptions = {
  extends: [],
  rules: {
    'asyncapi-latest-version': 'off',
  },
}

const parser = new Parser({ ruleset: ASYNCAPI_PARSER_RULESET })

const directoriesIn = (basePath: string): string[] =>
  readdirSync(basePath, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()

/** `[caseName, filePath]` per sample, shaped for `it.each`. */
const collectSamples = (): Array<[string, string]> => {
  if (!existsSync(ASYNC_API_SUITES_DIR)) {
    return []
  }
  const samples: Array<[string, string]> = []
  for (const suiteId of directoriesIn(ASYNC_API_SUITES_DIR)) {
    for (const testId of directoriesIn(path.join(ASYNC_API_SUITES_DIR, suiteId))) {
      for (const fileName of SAMPLE_FILE_NAMES) {
        const filePath = path.join(ASYNC_API_SUITES_DIR, suiteId, testId, fileName)
        // A case without these is part of a schema suite, rendered from a template instead.
        if (existsSync(filePath)) {
          samples.push([`${suiteId}/${testId}/${fileName}`, filePath])
        }
      }
    }
  }
  return samples
}

const SAMPLES = collectSamples()

describe('AsyncAPI full-sample corpus', () => {
  it('has samples to validate', () => {
    // `it.each([])` registers nothing and reports green, so a corpus that moved or emptied out
    // would otherwise read as "all passing".
    expect(SAMPLES.length).toBeGreaterThan(0)
  })

  it.each(SAMPLES)('%s is a valid AsyncAPI document', async (_caseName, filePath) => {
    const { diagnostics } = await parser.parse(readFileSync(filePath, 'utf-8'))

    const problems = diagnostics
      .map(diagnostic => `${diagnostic.message} (at ${diagnostic.path.join('/') || 'document root'})`)

    expect(problems).toEqual([])
  })
})
