import { describe, expect, it } from 'vitest'
import { insertTestStudyJobData, mockSessionWithTestData } from '@/tests/unit.helpers'
import { s3Available } from '@/tests/s3.helpers'
import { storeStudyLogFile } from '@/server/storage'
import { db } from '@/database'
import { jobScanResultForJob, parseTrivyStatus, parseSonarqubeStatus } from './queries'

// Real scanner output (see iac codebuild/scripts/common.ts injectScanResults):
// the Trivy section comes first, then an optional SonarQube section.
const TRIVY_CLEAN = 'Trivy Filesystem Scan: no vulnerabilities found'
const TRIVY_FINDINGS = [
    'Trivy Filesystem Scan Results',
    'Target: package-lock.json',
    '  HIGH CVE-2024-1234 lodash 4.17.0 (fix: 4.17.21) - Prototype pollution',
].join('\n')
const SONAR_OK = 'SonarQube Quality Gate: OK'
const SONAR_ERROR = ['SonarQube Quality Gate: ERROR', '  new_coverage: ERROR'].join('\n')

describe('parseTrivyStatus', () => {
    it('passes on the explicit clean line', () => {
        expect(parseTrivyStatus(`${TRIVY_CLEAN}\n\n${SONAR_OK}`)).toBe('PASSED')
    })

    it('fails when Trivy reports findings', () => {
        expect(parseTrivyStatus(`${TRIVY_FINDINGS}\n\n${SONAR_OK}`)).toBe('FAILED')
    })

    it('fails on "no results" (scanner produced no output) rather than claiming a pass', () => {
        expect(parseTrivyStatus('Trivy Filesystem Scan: no results')).toBe('FAILED')
    })

    it('also recognizes the image-scan label', () => {
        expect(parseTrivyStatus('Trivy Image Scan: no vulnerabilities found')).toBe('PASSED')
    })
})

describe('parseSonarqubeStatus', () => {
    it('passes only when the quality gate is OK', () => {
        expect(parseSonarqubeStatus(`${TRIVY_CLEAN}\n\n${SONAR_OK}`)).toBe('PASSED')
    })

    it('needs review when the quality gate errored', () => {
        expect(parseSonarqubeStatus(`${TRIVY_CLEAN}\n\n${SONAR_ERROR}`)).toBe('FAILED')
    })

    it('needs review when the SonarQube section is absent (skipped/unavailable)', () => {
        expect(parseSonarqubeStatus(TRIVY_CLEAN)).toBe('FAILED')
    })

    // The scanner (iac fetchSonarQualityGate) can emit these non-OK statuses; all mean "needs review".
    it.each(['ERROR', 'WARN', 'NONE', 'TIMEOUT', 'UNKNOWN'])('needs review for non-OK gate status %s', (status) => {
        expect(
            parseSonarqubeStatus(
                `Trivy Filesystem Scan: no vulnerabilities found\n\nSonarQube Quality Gate: ${status}`,
            ),
        ).toBe('FAILED')
    })

    it('matches OK case-insensitively', () => {
        expect(parseSonarqubeStatus('sonarqube quality gate: ok')).toBe('PASSED')
    })
})

describe('jobScanResultForJob', () => {
    it('reports no statuses and no log file when the scan has not reported yet', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { job } = await insertTestStudyJobData({ org, researcherId: user.id })

        const result = await jobScanResultForJob(job.id)

        expect(result).toEqual({ trivy: null, sonarqube: null, logFile: null })
    })

    it('keeps the log downloadable with unknown statuses when the file cannot be read', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { job } = await insertTestStudyJobData({ org, researcherId: user.id })
        const createdAt = new Date('2026-01-01T00:00:00Z')

        // Neither object is stored, so fetchFileContents throws after the newest row is selected.
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

        expect(result.trivy).toBeNull()
        expect(result.sonarqube).toBeNull()
        expect(result.logFile?.name).toBe('security-scan-log.txt')
    })

    it.skipIf(!s3Available)('parses per-tool statuses from the stored plaintext log', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { study, job } = await insertTestStudyJobData({ org, researcherId: user.id })

        const file = new File([`${TRIVY_FINDINGS}\n\n${SONAR_OK}`], 'security-scan-log.txt', { type: 'text/plain' })
        await storeStudyLogFile({ orgSlug: org.slug, studyId: study.id, studyJobId: job.id }, file, 'SECURITY-SCAN-LOG')

        const result = await jobScanResultForJob(job.id)

        expect(result.trivy).toBe('FAILED')
        expect(result.sonarqube).toBe('PASSED')
        expect(result.logFile?.name).toBe('security-scan-log.txt')
    })
})
