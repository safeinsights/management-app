import { describe, expect, it } from '@/tests/unit.helpers'
import { ENCRYPTED_TO_APPROVED } from '@/lib/file-type-helpers'
import {
    compareOutputFiles,
    isOutputsReviewEditable,
    OUTPUTS_DECISION_ERRORS,
    OUTPUTS_DECISIONS,
    OUTPUTS_FEEDBACK_MAX_CHARACTERS,
    OUTPUTS_FILE_NAME_MAX_LENGTH,
    toOutputsReviewDecision,
    type OutputFileOrder,
} from './outputs-review'

describe('outputs review decisions', () => {
    it('maps sharing the outputs to an approval', () => {
        expect(toOutputsReviewDecision('share-outputs')).toBe('APPROVE')
    })

    // Not REJECT: withholding the files asks the lab to resubmit, while REJECT ends a study.
    it('maps feedback-only to a clarification request, not a rejection', () => {
        expect(toOutputsReviewDecision('share-feedback-only')).toBe('NEEDS-CLARIFICATION')
    })

    it('offers exactly two mutually exclusive decisions', () => {
        expect(OUTPUTS_DECISIONS).toEqual(['share-outputs', 'share-feedback-only'])
    })

    it('caps feedback at 1800 characters regardless of the run outcome', () => {
        expect(OUTPUTS_FEEDBACK_MAX_CHARACTERS).toBe(1800)
    })

    it('truncates file names at 50 characters', () => {
        expect(OUTPUTS_FILE_NAME_MAX_LENGTH).toBe(50)
    })

    it('names the lab in the empty-feedback error and the cap in the too-long error', () => {
        expect(OUTPUTS_DECISION_ERRORS.feedbackEmpty('Rice Lab')).toBe(
            'Enter your feedback for Rice Lab before submitting.',
        )
        expect(OUTPUTS_DECISION_ERRORS.feedbackTooLong).toBe(
            'Decision exceeds the 1800 character limit. Shorten it to continue.',
        )
        expect(OUTPUTS_DECISION_ERRORS.decisionMissing).toBe('Select an option before submitting')
    })
})

// OTTER-726: the status backstop asks whether the round is still open. The newest status row alone
// cannot answer that, because the scanner writes CODE-SCANNED asynchronously and it can land after
// the files decision on the same job.
describe('isOutputsReviewEditable', () => {
    it('is editable while no files decision exists', () => {
        expect(isOutputsReviewEditable({ jobStatuses: ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE'] })).toBe(true)
    })

    it('is closed once the files are approved or rejected', () => {
        expect(isOutputsReviewEditable({ jobStatuses: ['RUN-COMPLETE', 'FILES-APPROVED'] })).toBe(false)
        expect(isOutputsReviewEditable({ jobStatuses: ['RUN-COMPLETE', 'FILES-REJECTED'] })).toBe(false)
    })

    it('stays closed when a late CODE-SCANNED row follows the decision', () => {
        expect(
            isOutputsReviewEditable({
                jobStatuses: ['CODE-SUBMITTED', 'CODE-APPROVED', 'RUN-COMPLETE', 'FILES-APPROVED', 'CODE-SCANNED'],
            }),
        ).toBe(false)
    })

    it('treats an unknown job as editable, because closing a review needs positive evidence', () => {
        expect(isOutputsReviewEditable({ jobStatuses: [] })).toBe(true)
    })
})

// The types here are the post-decryption ones. useDecryptFiles rewrites every ENCRYPTED-* name
// through ENCRYPTED_TO_APPROVED before the rows are sorted, so an ENCRYPTED-* fixture would pass
// while the real list stayed alphabetical (OTTER-758).
describe('compareOutputFiles', () => {
    const result = (name: string): OutputFileOrder => ({ fileType: 'APPROVED-RESULT', name })
    const order = (files: OutputFileOrder[]) => [...files].sort(compareOutputFiles).map((file) => file.name)

    it('sorts the results by name', () => {
        expect(order([result('tutor_results.csv'), result('a_plot.png'), result('archive.zip')])).toEqual([
            'a_plot.png',
            'archive.zip',
            'tutor_results.csv',
        ])
    })

    it('ignores case, so an upper-case name does not jump the list', () => {
        expect(order([result('beta.csv'), result('Alpha.csv'), result('Gamma.csv')])).toEqual([
            'Alpha.csv',
            'beta.csv',
            'Gamma.csv',
        ])
    })

    it('orders embedded numbers by value rather than by digit', () => {
        expect(order([result('run10.csv'), result('run2.csv'), result('run1.csv')])).toEqual([
            'run1.csv',
            'run2.csv',
            'run10.csv',
        ])
    })

    it('keeps every log above the results whatever the names are', () => {
        const files = [
            result('a_first_by_name.csv'),
            { fileType: 'APPROVED-SECURITY-SCAN-LOG', name: 'security-scan-log.txt' } as OutputFileOrder,
            result('b_second.csv'),
        ]

        expect(order(files)).toEqual(['security-scan-log.txt', 'a_first_by_name.csv', 'b_second.csv'])
    })

    // Pins the coupling rather than a literal: ranking names that decryption never produces is
    // exactly how the log-first order became a no-op.
    it('ranks the type decryption actually produces for a log', () => {
        const decrypted = ENCRYPTED_TO_APPROVED['ENCRYPTED-SECURITY-SCAN-LOG']
        const files = [result('a_first_by_name.csv'), { fileType: decrypted, name: 'scan.txt' } as OutputFileOrder]

        expect(order(files)).toEqual(['scan.txt', 'a_first_by_name.csv'])
    })

    it('puts the code run log above the security scan log, matching the design', () => {
        const files = [
            { fileType: 'APPROVED-PACKAGING-ERROR-LOG', name: 'packaging.txt' } as OutputFileOrder,
            { fileType: 'APPROVED-SECURITY-SCAN-LOG', name: 'security-scan-log.txt' } as OutputFileOrder,
            { fileType: 'APPROVED-CODE-RUN-LOG', name: 'code-run-log.txt' } as OutputFileOrder,
        ]

        expect(order(files)).toEqual(['code-run-log.txt', 'security-scan-log.txt', 'packaging.txt'])
    })

    it('gives the same order whatever order the files arrive in', () => {
        const files = [
            result('tutor_results.csv'),
            { fileType: 'APPROVED-SECURITY-SCAN-LOG', name: 'security-scan-log.txt' } as OutputFileOrder,
            result('a_plot.png'),
        ]
        const expected = ['security-scan-log.txt', 'a_plot.png', 'tutor_results.csv']

        expect(order(files)).toEqual(expected)
        expect(order([...files].reverse())).toEqual(expected)
    })
})
