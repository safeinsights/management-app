import { describe, expect, it, vi } from 'vitest'
import { loadOutputsFeedback } from './load-outputs-feedback'

const mockAction = vi.fn()
vi.mock('@/server/actions/study.actions', () => ({
    getOutputsDecisionFeedbackAction: (...args: unknown[]) => mockAction(...args),
}))

describe('loadOutputsFeedback', () => {
    const studyId = '00000000-0000-0000-0000-000000000001'

    it('returns entries on success', async () => {
        const fakeEntries = [{ id: '1', entryType: 'REVIEWER-FEEDBACK' as const }]
        mockAction.mockResolvedValue(fakeEntries)

        const result = await loadOutputsFeedback(studyId)

        expect(mockAction).toHaveBeenCalledWith({ studyId })
        expect(result.feedbackLoadError).toBe(false)
        expect(result.entries).toBe(fakeEntries)
    })

    it('returns empty entries and feedbackLoadError when the action fails', async () => {
        mockAction.mockResolvedValue({ error: 'Not found' })

        const result = await loadOutputsFeedback(studyId)

        expect(result.feedbackLoadError).toBe(true)
        expect(result.entries).toEqual([])
    })
})
