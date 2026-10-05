import { notifications } from '@mantine/notifications'
import { act, createTestQueryWrapper, describe, expect, it, renderHook, waitFor } from '@/tests/unit.helpers'
import type { StudyProposalFormValues } from '../study-request-types'
import { useSaveDraft } from './use-save-draft'

const formValues = (overrides: Partial<StudyProposalFormValues> = {}): StudyProposalFormValues => ({
    title: 'A study',
    orgSlug: '',
    language: null,
    piName: '',
    description: '',
    mainCodeFile: null,
    additionalCodeFiles: [],
    stepIndex: 0,
    createdStudyId: null,
    ideMainFile: '',
    ideFiles: [],
    ...overrides,
})

describe('useSaveDraft', () => {
    it('reports a failed first save with its reason and a support reference', async () => {
        const { result } = renderHook(() => useSaveDraft({ studyId: null, submittingOrgSlug: 'lab' }), {
            wrapper: createTestQueryWrapper(),
        })

        act(() => result.current.saveDraft(formValues()))

        await waitFor(() => {
            expect(notifications.show).toHaveBeenCalledWith(
                expect.objectContaining({
                    'data-toast-kind': 'error',
                    title: 'Failed to save draft',
                    message: expect.stringMatching(
                        /^Data Partner is required to create a study\nReference: [a-f0-9]{32}$/,
                    ),
                }),
            )
        })
    })
})
