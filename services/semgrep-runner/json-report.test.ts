import { expect, it } from '../../tests/unit.helpers'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { readJsonReport } from './json-report.ts'
import { prepareSemgrepReport, semgrepPlaintextLog, type SemgrepOutput } from './semgrep.ts'

it('returns null for missing, empty, unreadable, or malformed reports', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reports-'))
    try {
        const file = path.join(root, 'report.json')
        expect(readJsonReport(file)).toBe(null)
        expect(readJsonReport(root)).toBe(null)
        for (const content of ['', '{invalid']) {
            fs.writeFileSync(file, content)
            expect(readJsonReport(file)).toBe(null)
        }
        fs.writeFileSync(file, '{"results":[]}')
        expect(readJsonReport(file)).toEqual({ results: [] })
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

it('a scan that writes no report cannot reuse a stale or submitted report', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reports-'))
    try {
        const submission = path.join(root, 'submission')
        const reportPath = path.join(root, 'reports', 'semgrep.json')
        fs.mkdirSync(submission)
        const forged = '{"results":[],"paths":{"scanned":["src/main.R"]}}'
        fs.writeFileSync(path.join(submission, 'semgrep.json'), forged)
        prepareSemgrepReport(reportPath)
        fs.writeFileSync(reportPath, forged)
        prepareSemgrepReport(reportPath)
        expect(semgrepPlaintextLog(readJsonReport<SemgrepOutput>(reportPath))).toBe(
            'Semgrep Scan: scan did not complete',
        )
        expect(fs.readFileSync(path.join(submission, 'semgrep.json'), 'utf-8')).toBe(forged)
    } finally {
        fs.rmSync(root, { recursive: true, force: true })
    }
})
