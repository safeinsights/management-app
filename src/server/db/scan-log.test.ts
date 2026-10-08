import { describe, expect, it } from 'vitest'
import { insertTestStudyJobData, mockSessionWithTestData } from '@/tests/unit.helpers'
import { s3Available } from '@/tests/s3.helpers'
import { storeStudyLogFile } from '@/server/storage'
import { db } from '@/database'
import { jobScanResultForJob, parseSemgrepStatus } from './queries'

// Real scanner output: see iac codebuild/scripts/semgrep.ts semgrepPlaintextLog.
const SEMGREP_CLEAN = ['Semgrep Scan: no findings', 'R and Python files analyzed: 1', '  main.R'].join('\n')
const SEMGREP_FINDINGS = [
    'Semgrep Scan: findings found',
    'R and Python files analyzed: 1',
    '  main.R',
    '',
    'Findings that fail the review gate:',
    '  main.R:12  ERROR    privacy-r-network-call',
    '',
    'Rules:',
    '  privacy-r-network-call: Sends or fetches data over the network.',
].join('\n')

describe('parseSemgrepStatus', () => {
    it('passes on the explicit clean line', () => {
        expect(parseSemgrepStatus(SEMGREP_CLEAN)).toBe('PASSED')
    })

    it('fails when Semgrep reports findings that fail the gate', () => {
        expect(parseSemgrepStatus(SEMGREP_FINDINGS)).toBe('FAILED')
    })

    // A timed-out rule or an unparsable file left code unexamined, so it clears nothing.
    it.each(['partially scanned', 'nothing scanned', 'scan did not complete'])(
        'is indeterminate for "%s"',
        (phrase) => {
            expect(parseSemgrepStatus(`Semgrep Scan: ${phrase}`)).toBe('INDETERMINATE')
        },
    )

    it('reports not run when the log has no Semgrep header', () => {
        expect(parseSemgrepStatus('No scan report available')).toBe('NOT-RUN')
    })

    it('does not take a verdict from the label appearing mid-line', () => {
        expect(parseSemgrepStatus('  notes/Semgrep Scan: no findings.R:3  INFO  r-silent-failure')).toBe('NOT-RUN')
    })

    it('matches the status phrase case-insensitively', () => {
        expect(parseSemgrepStatus('semgrep scan: NO FINDINGS')).toBe('PASSED')
    })
})

describe('scan status header boundaries', () => {
    it('accepts leading blank lines before the status header', () => {
        expect(parseSemgrepStatus(`\n  \n  ${SEMGREP_CLEAN}`)).toBe('PASSED')
    })

    it('reports an empty log as not run', () => {
        expect(parseSemgrepStatus('\n  \n')).toBe('NOT-RUN')
    })

    it('ignores a status header after an unrelated first line', () => {
        expect(parseSemgrepStatus(`Researcher-supplied details\n${SEMGREP_CLEAN}`)).toBe('NOT-RUN')
    })

    it('keeps an unknown verdict indeterminate despite a later clean line', () => {
        expect(parseSemgrepStatus(`Semgrep Scan: unknown\n${SEMGREP_CLEAN}`)).toBe('INDETERMINATE')
    })
})

describe('jobScanResultForJob', () => {
    it('reports no statuses and no log file when the scan has not reported yet', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { job } = await insertTestStudyJobData({ org, researcherId: user.id })

        const result = await jobScanResultForJob(job.id)

        expect(result).toEqual({ semgrep: null, logFile: null })
    })

    it('keeps the log downloadable with unknown statuses when the file cannot be read', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { job } = await insertTestStudyJobData({ org, researcherId: user.id })
        const createdAt = new Date('2026-01-01T00:00:00Z')

        await db
            .insertInto('studyJobFile')
            .values([
                {
                    id: '00000000-0000-7000-8000-000000000001',
                    studyJobId: job.id,
                    name: 'old-security-scan-log.txt',
                    path: `studies/x/jobs/${job.id}/results/old-security-scan-log.txt`,
                    fileType: 'SECURITY-SCAN-LOG',
                    createdAt,
                },
                {
                    id: '00000000-0000-7000-8000-000000000002',
                    studyJobId: job.id,
                    name: 'security-scan-log.txt',
                    path: `studies/x/jobs/${job.id}/results/security-scan-log.txt`,
                    fileType: 'SECURITY-SCAN-LOG',
                    createdAt,
                },
            ])
            .execute()

        const result = await jobScanResultForJob(job.id)

        expect(result.semgrep).toBeNull()
        expect(result.logFile?.name).toBe('security-scan-log.txt')
    })

    it.skipIf(!s3Available).each([
        { log: SEMGREP_FINDINGS, semgrep: 'FAILED' },
        { log: SEMGREP_CLEAN, semgrep: 'PASSED' },
        { log: 'No scan report available', semgrep: 'NOT-RUN' },
        { log: 'Semgrep Scan: partially scanned', semgrep: 'INDETERMINATE' },
    ])('parses stored log as Semgrep $semgrep', async ({ log, semgrep }) => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study, job } = await insertTestStudyJobData({ org, researcherId: user.id })

        const file = new File([log], 'security-scan-log.txt', { type: 'text/plain' })
        await storeStudyLogFile({ orgSlug: org.slug, studyId: study.id, studyJobId: job.id }, file, 'SECURITY-SCAN-LOG')

        const result = await jobScanResultForJob(job.id)

        expect(result.semgrep).toBe(semgrep)
        expect(result.logFile?.name).toBe('security-scan-log.txt')
    })
})
