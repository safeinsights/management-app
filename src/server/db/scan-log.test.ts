import { describe, expect, it } from 'vitest'
import { insertTestStudyJobData, mockSessionWithTestData } from '@/tests/unit.helpers'
import { s3Available } from '@/tests/s3.helpers'
import { storeStudyLogFile } from '@/server/storage'
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
})

describe('jobScanResultForJob', () => {
    it('reports no statuses and no log file when the scan has not reported yet', async () => {
        const { org, user } = await mockSessionWithTestData({ orgType: 'enclave' })
        const { job } = await insertTestStudyJobData({ org, researcherId: user.id })

        const result = await jobScanResultForJob(job.id)

        expect(result).toEqual({ trivy: null, sonarqube: null, logFile: null })
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
