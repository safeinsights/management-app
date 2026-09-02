import { describe, expect, it } from 'vitest'
import { useForm } from '@/common'
import { renderHook } from '@/tests/unit.helpers'
import { initialFormValues } from '@/contexts/study-request'
import type { StudyProposalFormValues } from './form-schemas'
import { useSetupForm } from './use-setup-form'

const renderSetupForm = ({ initialTitle, formTitle = '' }: { initialTitle?: string; formTitle?: string }) =>
    renderHook(() => {
        const form = useForm<StudyProposalFormValues>({
            mode: 'uncontrolled',
            initialValues: { ...initialFormValues, title: formTitle },
        })

        return useSetupForm({
            form,
            initialTitle,
            isTitleLocked: false,
            isOrgLocked: false,
            isLanguageLocked: false,
            requiresConfirmation: false,
            onProceed: () => {},
        })
    })

// The heading reads titleValue, and the context fills the form from the draft in an effect, so a
// persisted study must not head its page "Untitled study" for a frame first (OTTER-619).
describe('useSetupForm', () => {
    it('starts from the persisted title before the form is filled', () => {
        const { result } = renderSetupForm({ initialTitle: 'A saved title' })

        expect(result.current.titleValue).toBe('A saved title')
    })

    it('starts empty when there is no persisted study', () => {
        const { result } = renderSetupForm({})

        expect(result.current.titleValue).toBe('')
    })

    it('prefers a form value that is already populated', () => {
        const { result } = renderSetupForm({ initialTitle: 'A saved title', formTitle: 'Edited title' })

        expect(result.current.titleValue).toBe('Edited title')
    })
})
