import { describe, expect, it } from '@/tests/unit.helpers'
import { buildTestRequest, testRunTarget } from './test-run'

describe('buildTestRequest', () => {
    it('lays out rules, fixtures and scratch files as a gate does', () => {
        const request = buildTestRequest(
            [
                { path: 'rules/r/secrets.yaml', content: 'rules: []' },
                { path: 'tests/r/secrets.r', content: '# ruleid: x' },
                { path: 'tests/corpus/notebook.ipynb', content: '{}' },
            ],
            [{ name: 'secrets.r', content: 'token <- "x"' }],
        )

        expect(request).toEqual({
            mode: 'test',
            rules: [{ path: 'r/secrets.yaml', content: 'rules: []' }],
            files: [
                { path: 'r/secrets.r', content: '# ruleid: x' },
                { path: 'corpus/notebook.ipynb', content: '{}' },
                { path: '_scratch/secrets.r', content: 'token <- "x"' },
            ],
        })
    })
})

describe('testRunTarget', () => {
    it('maps runner paths back to ruleset files and scratch files', () => {
        expect(testRunTarget('r/secrets.r')).toEqual({ kind: 'ruleset', path: 'tests/r/secrets.r' })
        expect(testRunTarget('src/r/secrets.r')).toEqual({ kind: 'ruleset', path: 'tests/r/secrets.r' })
        expect(testRunTarget('rules/r/secrets.yaml')).toEqual({ kind: 'ruleset', path: 'rules/r/secrets.yaml' })
        expect(testRunTarget('_scratch/mine.py')).toEqual({ kind: 'scratch', name: 'mine.py' })
        expect(testRunTarget('src/_scratch/mine.py')).toEqual({ kind: 'scratch', name: 'mine.py' })
    })
})
