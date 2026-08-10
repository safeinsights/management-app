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
    'Trivy Filesystem Scan: vulnerabilities found',
    'Target: package-lock.json',
    '  HIGH CVE-2024-1234 lodash 4.17.0 (fix: 4.17.21) - Prototype pollution',
].join('\n')
// Logs stored before the scanner emitted a status phrase headed their findings this way.
const TRIVY_LEGACY_FINDINGS = [
    'Trivy Filesystem Scan Results',
    'Target: package-lock.json',
    '  HIGH CVE-2024-1234 lodash 4.17.0 (fix: 4.17.21) - Prototype pollution',
].join('\n')
const SONAR_OK = 'SonarQube Quality Gate: OK'
const SONAR_ERROR = ['SonarQube Quality Gate: ERROR', '  new_coverage: ERROR'].join('\n')

// Verbatim from QA (job 019fd838-f3da-73c8-afe2-1c72c9142161, 2026-08-06): the scanner aborted before
// Trivy ran, and its failure handler still posted this as a completed scan. The old parser read it as
// a vulnerability finding, which is the defect this card was reopened for.
const QA_ABORTED_SCAN_LOG = [
    'Trivy Filesystem Scan: no results',
    '',
    'SonarQube Quality Gate: OK',
    '  new_violations: OK',
].join('\n')

// Verbatim from the last successful QA scan (job 019eadb3-6cc5-7b1c-8da1-5f925b4a50e6, 2026-06-09).
// Trivy ran but had nothing to analyze: the submission was a single .R file and Trivy has no R
// analyzer, so its SBOM held zero components and its summary reported the target as "not scanned".
const QA_SUCCESSFUL_SCAN_LOG = [
    'Trivy Filesystem Scan: no vulnerabilities found',
    '',
    'SonarQube Quality Gate: OK',
    '  new_violations: OK',
].join('\n')

describe('parseTrivyStatus', () => {
    it('passes on the explicit clean line', () => {
        expect(parseTrivyStatus(`${TRIVY_CLEAN}\n\n${SONAR_OK}`)).toBe('PASSED')
    })

    it('fails when Trivy reports findings', () => {
        expect(parseTrivyStatus(`${TRIVY_FINDINGS}\n\n${SONAR_OK}`)).toBe('FAILED')
    })

    it('still reads findings from logs stored before the status phrase existed', () => {
        expect(parseTrivyStatus(`${TRIVY_LEGACY_FINDINGS}\n\n${SONAR_OK}`)).toBe('FAILED')
    })

    it('is indeterminate when Trivy had nothing it could analyze', () => {
        expect(parseTrivyStatus('Trivy Filesystem Scan: nothing scanned')).toBe('INDETERMINATE')
    })

    it('is indeterminate when the scan never produced a report', () => {
        expect(parseTrivyStatus('Trivy Filesystem Scan: scan did not complete')).toBe('INDETERMINATE')
    })

    it('does not read the legacy "no results" as a vulnerability finding', () => {
        expect(parseTrivyStatus(QA_ABORTED_SCAN_LOG)).toBe('INDETERMINATE')
    })

    it('is indeterminate for an unrecognized log rather than claiming a finding', () => {
        expect(parseTrivyStatus('something else entirely')).toBe('INDETERMINATE')
    })

    it('also recognizes the image-scan label', () => {
        expect(parseTrivyStatus('Trivy Image Scan: no vulnerabilities found')).toBe('PASSED')
    })

    it('matches the status phrase case-insensitively', () => {
        expect(parseTrivyStatus('trivy filesystem scan: NO VULNERABILITIES FOUND')).toBe('PASSED')
    })

    it('reads the last successful QA scan as a pass', () => {
        expect(parseTrivyStatus(QA_SUCCESSFUL_SCAN_LOG)).toBe('PASSED')
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

    it('needs review when no analysis could be resolved for this build', () => {
        expect(parseSonarqubeStatus(`${TRIVY_CLEAN}\n\nSonarQube Quality Gate: not available`)).toBe('FAILED')
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
