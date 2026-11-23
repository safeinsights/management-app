import { describe, expect, it } from '@/tests/unit.helpers'
import { pathForLegalDocumentVersion, pathForStudyJob, pathForStudyJobCodeFile } from '@/lib/paths'
import { agreementPath, codeFilePath, resultsFilePath, studyJobPath } from './paths'

// The seed cannot import @/lib/paths (it pulls in Sentry), so these copies must not drift.
describe('sample-data paths', () => {
    const info = { orgSlug: 'openstax', studyId: 'study-1', studyJobId: 'job-1' }

    it('matches the app job and code paths', () => {
        expect(studyJobPath(info)).toBe(pathForStudyJob(info))
        expect(codeFilePath(info, 'main.py')).toBe(pathForStudyJobCodeFile(info, 'main.py'))
    })

    it('matches the results folder the storage helpers write to', () => {
        expect(resultsFilePath(info, 'encrypted-results.zip')).toBe(
            `${pathForStudyJob(info)}/results/encrypted-results.zip`,
        )
    })

    it('matches the legal document version path', () => {
        const ids = { legalDocumentId: 'doc-1', versionId: 'ver-1' }
        expect(agreementPath(ids)).toBe(pathForLegalDocumentVersion({ type: 'SLA', ...ids }))
    })
})
