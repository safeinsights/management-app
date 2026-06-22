import { vi } from 'vitest'
import { renderWithProviders, screen, describe, it, expect } from '@/tests/unit.helpers'

const mockSingleUser = vi.hoisted(() => ({ value: false }))

vi.mock('@/lib/config', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/config')>()
    return {
        ...original,
        get IS_SINGLE_USER_EDITING() {
            return mockSingleUser.value
        },
    }
})

import { Editor } from './editor'

describe('Editor', () => {
    it('renders the single-user editor when the flag is set, without a websocket', async () => {
        mockSingleUser.value = true
        renderWithProviders(<Editor id="doc-1" studyId="study-1" ariaLabel="Feedback" websocketProvider={null} />)

        // The single-user editor renders the editable surface synchronously; the
        // collaborative path would show a skeleton because websocketProvider is null.
        expect(await screen.findByLabelText('Feedback')).toBeDefined()
    })

    it('holds a skeleton in collaborative mode until the websocket exists', () => {
        mockSingleUser.value = false
        const { container } = renderWithProviders(
            <Editor id="doc-2" studyId="study-1" ariaLabel="Feedback" websocketProvider={null} />,
        )

        expect(container.querySelector('[aria-label="Feedback"]')).toBeNull()
    })
})
