import { describe, expect, it, renderWithProviders, screen } from '@/tests/unit.helpers'
import { PasswordInput } from '@mantine/core'
import { usePasswordRequirements } from './password-requirements'

// The list reaches assistive tech only through `aria-describedby`, which Mantine computes from its
// `description` prop; passing it any other way leaves it visible but unreachable (OTTER-647).
function Harness({ password, touched }: { password: string; touched: boolean }) {
    const { requirementsDescription } = usePasswordRequirements(password, touched)

    return (
        <PasswordInput
            label="Enter password"
            value={password}
            readOnly
            description={requirementsDescription}
            inputWrapperOrder={['label', 'input', 'description', 'error']}
        />
    )
}

const input = () => screen.getByLabelText('Enter password')

const describedText = () => {
    const ids = (input().getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
    expect(ids.length).toBeGreaterThan(0)
    return ids
        .map((id) => {
            const node = document.getElementById(id)
            expect(node, `aria-describedby points at missing id "${id}"`).not.toBeNull()
            return node?.textContent ?? ''
        })
        .join(' ')
}

describe('password requirements association', () => {
    it('points the input at the requirements list once the field has been left empty', () => {
        renderWithProviders(<Harness password="" touched />)

        const text = describedText()
        expect(text).toContain('One number')
        expect(text).toContain('One uppercase letter')
        expect(text).toContain('One special symbol')
        expect(text).toContain('8 character minimum')
    })

    it('still describes the input while some requirements are unmet', () => {
        renderWithProviders(<Harness password="abc" touched />)

        expect(describedText()).toContain('One number')
    })

    it('describes nothing once every requirement is met', () => {
        renderWithProviders(<Harness password="Passw0rd!" touched />)

        // With no description Mantine must not leave a dangling aria-describedby behind.
        const ref = input().getAttribute('aria-describedby')
        const ids = (ref || '').split(/\s+/).filter(Boolean)
        for (const id of ids) {
            expect(document.getElementById(id)?.textContent ?? '').not.toContain('One number')
        }
    })

    it('renders the list inline, so it is valid inside Mantine description markup', () => {
        const { container } = renderWithProviders(<Harness password="" touched />)

        // A block element inside Mantine's description <p> is invalid HTML and React reports it as
        // a nesting error.
        expect(container.querySelectorAll('p div')).toHaveLength(0)
    })
})
