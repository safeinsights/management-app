import { describe, expect, it } from '../../tests/unit.helpers'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
    extractJupyterCode,
    extractNotebookCode,
    extractNotebooks,
    semgrepFindings,
    semgrepOutcome,
    semgrepPlaintextLog,
    submissionPath,
} from './semgrep.ts'
import type { SemgrepFinding, SemgrepOutput } from './protocol.ts'

function finding(file: string, line: number, severity: string, rule = 'r-eval-parse'): SemgrepFinding {
    return {
        check_id: `rules.${rule}`,
        path: file,
        start: { line },
        extra: { severity, message: `${rule} message` },
    }
}

function report(overrides: Partial<SemgrepOutput> = {}): SemgrepOutput {
    return { results: [], errors: [], paths: { scanned: ['src/analysis.R'] }, ...overrides }
}

describe('extractNotebookCode', () => {
    const notebook = [
        '---',
        'title: "Study"',
        '---',
        'Prose without inline code.',
        '```{r setup, include=FALSE}',
        'library(dplyr)',
        '```',
        '```{python}',
        'print(1)',
        '```',
        '```{R}',
        'x <- eval(parse(text = y))',
        '```',
    ].join('\n')

    // A finding's line in the extract must be its line in the notebook, or the reviewer is sent to
    // the wrong place.
    it('keeps chunk lines where they are and blanks the rest', () => {
        const lines = extractNotebookCode(notebook, 'R').split('\n')

        expect(lines.length).toBe(notebook.split('\n').length)
        expect(lines[5]).toBe('library(dplyr)')
        expect(lines[11]).toBe('x <- eval(parse(text = y))')
        expect(lines.filter((l) => l !== '')).toEqual(['library(dplyr)', 'x <- eval(parse(text = y))'])
    })

    it('leaves out chunks in another language', () => {
        expect(extractNotebookCode(notebook, 'R')).not.toMatch(/print\(1\)/)
        expect(extractNotebookCode(notebook, 'py').split('\n')[8]).toBe('print(1)')
    })

    // knitr does not nest fences, so a chunk header inside a longer fence still runs.
    it('starts a chunk at every knitr chunk header', () => {
        const lines = extractNotebookCode('````markdown\n```{r}\nsystem(cmd)\n```\n````\n', 'R').split('\n')

        expect(lines[2]).toBe('system(cmd)')
    })

    it('reads chunks in a blockquote and removes the prefix', () => {
        const lines = extractNotebookCode('> ```{r}\n> system(cmd)\n> ```\n', 'R').split('\n')

        expect(lines[1]).toBe('system(cmd)')
    })

    it('uses the engine option over the header engine', () => {
        const source = '```{r, engine=\'bash\'}\necho hi\n```\n```{r engine="python"}\nx = 1\n```\n'

        expect(extractNotebookCode(source, 'R').trim()).toBe('')
        expect(extractNotebookCode(source, 'py').split('\n')[4]).toBe('x = 1')
    })

    it('extracts knitr and Quarto inline code, including expressions over two lines', () => {
        const source = 'A `{r} system(cmd)` and `{python} os.system(cmd)`.\nB `r system(\n  other)` C'

        expect(extractNotebookCode(source, 'R').split('\n')).toEqual(['system(cmd)', 'system(', 'other)'])
        expect(extractNotebookCode(source, 'py').split('\n')).toEqual(['os.system(cmd)', '', ''])
    })
})

describe('extractJupyterCode', () => {
    function notebook(cells: (string | string[])[], language = 'python'): string {
        return JSON.stringify(
            {
                cells: cells.map((source) => ({ cell_type: 'code', source })),
                metadata: { kernelspec: { language } },
            },
            null,
            1,
        )
    }

    it('puts each code line on the line of the notebook file that holds it', () => {
        const text = notebook([['import os\n', 'os.system(cmd)']])
        const lines = extractJupyterCode(text)!.code.split('\n')
        const at = text.split('\n').findIndex((l) => l.includes('os.system'))

        expect(lines.length).toBe(text.split('\n').length)
        expect(lines[at]).toBe('os.system(cmd)')
    })

    it('scans a cell in another layout after the last line', () => {
        const text = notebook(['import os\nos.system(cmd)'])

        expect(extractJupyterCode(text)!.code).toMatch(/\nimport os\nos\.system\(cmd\)\n/)
    })

    it('leaves out IPython syntax and cell magics that are not Python', () => {
        const code = extractJupyterCode(
            notebook([
                ['!ls\n', 'x = 1'],
                ['%%bash\n', 'echo hi'],
                ['%%time\n', 'y = 2'],
            ]),
        )!.code

        expect(code).not.toMatch(/ls|echo/)
        expect(code).toMatch(/x = 1/)
        expect(code).toMatch(/y = 2/)
    })

    it('takes the language from the kernel and skips other kernels', () => {
        expect(extractJupyterCode(notebook([['x <- 1']], 'R'))!.language).toBe('R')
        expect(extractJupyterCode(notebook([['x = 1']], 'julia'))!.language).toBe(undefined)
        expect(extractJupyterCode('not json')).toBe(undefined)
    })
})

describe('extractNotebooks', () => {
    it('writes one extract per language, next to the notebook path, and skips plain files', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'submission-'))
        const out = fs.mkdtempSync(path.join(os.tmpdir(), 'extracts-'))
        fs.mkdirSync(path.join(root, 'reports'))
        fs.writeFileSync(path.join(root, 'reports', 'study.Rmd'), '```{r}\nx <- 1\n```\n```{python}\ny = 2\n```\n')
        fs.writeFileSync(path.join(root, 'notes.qmd'), 'no chunks here\n')
        fs.writeFileSync(path.join(root, 'reports', 'old.Rmarkdown'), '```{r}\nx <- 1\n```\n')
        fs.writeFileSync(path.join(root, 'analysis.ipynb'), '{"cells": [{"cell_type": "code", "source": "x = 1"}]}')
        fs.writeFileSync(path.join(root, 'main.R'), 'z <- 3\n')

        try {
            expect(extractNotebooks(root, out)).toBe(4)
            expect(fs.readdirSync(path.join(out, 'reports')).sort()).toEqual([
                'old.Rmarkdown.R',
                'study.Rmd.R',
                'study.Rmd.py',
            ])
            expect(fs.existsSync(path.join(out, 'analysis.ipynb.py'))).toBe(true)
            expect(fs.existsSync(path.join(out, 'main.R'))).toBe(false)
        } finally {
            fs.rmSync(root, { recursive: true, force: true })
            fs.rmSync(out, { recursive: true, force: true })
        }
    })
})

describe('submissionPath', () => {
    it('maps extracts back to their notebook and leaves other paths unchanged', () => {
        expect(submissionPath('notebooks/a/b.Rmd.R')).toBe('a/b.Rmd')
        expect(submissionPath('src/a/b.R')).toBe('a/b.R')
        expect(submissionPath('other/b.R')).toBe('other/b.R')
    })
})

describe('semgrepFindings', () => {
    // Regex rules fire on the notebook and on its extract; both map to the same place.
    it('maps extract paths back to the notebook and drops the duplicate', () => {
        const findings = semgrepFindings(
            report({
                results: [
                    finding('notebooks/reports/study.Rmd.R', 4, 'ERROR', 'secret-github-token'),
                    finding('src/reports/study.Rmd', 4, 'ERROR', 'secret-github-token'),
                ],
            }),
        )

        expect(findings.map((f) => [f.path, f.start.line, f.check_id])).toEqual([
            ['reports/study.Rmd', 4, 'secret-github-token'],
        ])
    })
})

describe('semgrepOutcome', () => {
    it('reports findings when any ERROR or WARNING matched', () => {
        expect(semgrepOutcome(report({ results: [finding('src/analysis.R', 3, 'WARNING')] }))).toBe('FINDINGS-FOUND')
    })

    // INFO findings are for the reviewer to read; they never fail the gate.
    it('treats INFO findings alone as no findings', () => {
        expect(semgrepOutcome(report({ results: [finding('src/analysis.R', 3, 'INFO')] }))).toBe('NO-FINDINGS')
    })

    it('reports a missing report as a scan that did not complete', () => {
        expect(semgrepOutcome(null)).toBe('DID-NOT-COMPLETE')
    })

    // The OTTER-649 case: a submission with nothing Semgrep can parse must not read as clean.
    it('reports nothing scanned when no R or Python file was analyzed', () => {
        expect(semgrepOutcome(report({ paths: { scanned: ['src/data.csv', 'src/README.md'] } }))).toBe(
            'NOTHING-SCANNED',
        )
    })

    it('counts a notebook extract as an analyzed file', () => {
        expect(semgrepOutcome(report({ paths: { scanned: ['notebooks/study.Rmd.R'] } }))).toBe('NO-FINDINGS')
    })

    // A rule that timed out or a file that failed to parse left code unexamined.
    it('reports a partial scan when Semgrep reported errors and nothing gating', () => {
        const errors = [{ type: 'Timeout', path: 'src/big.R', message: 'Timeout when running r-eval-parse' }]

        expect(semgrepOutcome(report({ errors }))).toBe('PARTIALLY-SCANNED')
    })

    it('still reports findings when the scan was also partial', () => {
        const errors = [{ type: 'Timeout', path: 'src/big.R' }]

        expect(semgrepOutcome(report({ errors, results: [finding('src/analysis.R', 3, 'ERROR')] }))).toBe(
            'FINDINGS-FOUND',
        )
    })
})

describe('semgrepPlaintextLog', () => {
    // The management app parses this line; the rest of the log is for people.
    it('leads with the status line', () => {
        expect(semgrepPlaintextLog(null)).toBe('Semgrep Scan: scan did not complete')
        expect(semgrepPlaintextLog(report())).toMatch(/^Semgrep Scan: no findings\n/)
    })

    it('separates gating findings from INFO findings and explains each rule once', () => {
        const log = semgrepPlaintextLog(
            report({
                results: [
                    finding('src/analysis.R', 9, 'INFO', 'privacy-r-aggregate'),
                    finding('src/analysis.R', 3, 'ERROR'),
                    finding('src/analysis.R', 7, 'ERROR'),
                ],
            }),
        )

        expect(log).toMatch(/^Semgrep Scan: findings found$/m)
        expect(log).toMatch(
            /Findings that fail the review gate:\n {2}analysis\.R:3 {2}ERROR {4}r-eval-parse\n {2}analysis\.R:7/,
        )
        expect(log).toMatch(/For review, not failing the gate:\n {2}analysis\.R:9 {2}INFO {5}privacy-r-aggregate/)
        expect(log.match(/r-eval-parse message/g)?.length).toBe(1)
    })

    it('lists files that were not fully analyzed', () => {
        const log = semgrepPlaintextLog(report({ errors: [{ type: ['PartialParsing', []], path: 'src/odd.R' }] }))

        expect(log).toMatch(/Not fully analyzed:\n {2}odd\.R: PartialParsing/)
    })

    it('caps a long section and says how many lines it left out', () => {
        const results = Array.from({ length: 205 }, (_, i) => finding('src/analysis.R', i + 1, 'INFO'))

        expect(semgrepPlaintextLog(report({ results }))).toMatch(/ {2}\.\.\. 5 more in semgrep\.json/)
    })
})

describe('review regressions', () => {
    it('does not count raw notebooks or startup files as parsed code', () => {
        for (const file of ['study.Rmd', 'study.qmd', '.Rprofile', 'Rprofile.site']) {
            expect(semgrepOutcome(report({ paths: { scanned: [`src/${file}`] } }))).toBe('NOTHING-SCANNED')
        }
    })

    it('extracts startup files and inline R with submission line numbers', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'submission-'))
        const out = fs.mkdtempSync(path.join(os.tmpdir(), 'extracts-'))
        try {
            fs.writeFileSync(path.join(root, '.Rprofile'), 'system(cmd)\n')
            fs.writeFileSync(path.join(root, 'Rprofile.site'), 'system(other)\n')
            fs.writeFileSync(
                path.join(root, 'study.qmd'),
                [
                    'Prose `r system(cmd)` and `r eval(expr)`.',
                    '~~~{r}',
                    'system(other)',
                    '~~~',
                    '```{bash}',
                    'echo "`r ignored`"',
                    '```',
                ].join('\n'),
            )
            expect(extractNotebooks(root, out)).toBe(3)
            expect(fs.readFileSync(path.join(out, '.Rprofile.R'), 'utf-8')).toBe('system(cmd)\n')
            expect(fs.readFileSync(path.join(out, 'Rprofile.site.R'), 'utf-8')).toBe('system(other)\n')
            const lines = fs.readFileSync(path.join(out, 'study.qmd.R'), 'utf-8').split('\n')
            expect(lines[0]).toBe('system(cmd); eval(expr)')
            expect(lines[2]).toBe('system(other)')
            expect(lines[5]).toBe('')
            const log = semgrepPlaintextLog(
                report({
                    paths: { scanned: ['notebooks/.Rprofile.R'] },
                    results: [finding('notebooks/.Rprofile.R', 1, 'WARNING')],
                }),
            )
            expect(log).toMatch(/ {2}\.Rprofile:1/)
        } finally {
            fs.rmSync(root, { recursive: true, force: true })
            fs.rmSync(out, { recursive: true, force: true })
        }
    })
})
