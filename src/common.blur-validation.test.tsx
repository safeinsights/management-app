import { describe, expect, it } from 'vitest'
import { Select, TextInput } from '@mantine/core'
import { z } from 'zod'
import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { useForm, zodResolver } from '@/common'
import { FormField, nativeFieldProps } from '@/components/form-field'

// OTTER-647's acceptance criteria in its most reduced form: moving away from an incomplete
// required field must raise its error. Mantine defaults `validateInputOnBlur` to false, so
// this exercises the project `useForm` wrapper in @/common that turns it on, and the
// FormField wrapper that renders and associates the message.

const schema = z.object({
    title: z.string().trim().min(1, { message: 'Study title is required.' }),
    partner: z.string().min(1, { message: 'Data Partner is required.' }),
})

function Harness() {
    const form = useForm({
        initialValues: { title: '', partner: '' },
        validate: zodResolver(schema),
    })

    return (
        <>
            <FormField inputId="title" label="Study title" required error={form.errors.title}>
                <TextInput id="title" {...form.getInputProps('title')} {...nativeFieldProps(form.errors.title)} />
            </FormField>
            <FormField inputId="partner" label="Data Partner" required error={form.errors.partner}>
                <Select
                    id="partner"
                    data={[{ value: 'rice', label: 'Rice University' }]}
                    {...form.getInputProps('partner')}
                    {...nativeFieldProps(form.errors.partner)}
                />
            </FormField>
            <button type="button">next</button>
        </>
    )
}

// The description path is the fragile one: it depends on the inner and outer Input.Wrapper
// deriving the same description id from the shared `id`.
function HarnessWithDescription() {
    const form = useForm({
        initialValues: { title: '' },
        validate: zodResolver(z.object({ title: z.string().trim().min(1, { message: 'Study title is required.' }) })),
    })

    return (
        <FormField
            inputId="described-title"
            label="Study title"
            required
            description="Keep it short and clear."
            error={form.errors.title}
        >
            <TextInput
                id="described-title"
                {...form.getInputProps('title')}
                {...nativeFieldProps(form.errors.title, { required: true, description: true })}
            />
        </FormField>
    )
}

describe('required-field blur validation', () => {
    it('surfaces no error on first paint, before the user interacts', () => {
        renderWithProviders(<Harness />)

        expect(screen.queryByText('Study title is required.')).not.toBeInTheDocument()
        expect(screen.queryByText('Data Partner is required.')).not.toBeInTheDocument()
    })

    it('errors a text field left empty when the user moves to the next field', async () => {
        const user = userEvent.setup()
        renderWithProviders(<Harness />)

        await user.click(screen.getByLabelText(/Study title/))
        await user.tab()

        expect(await screen.findByText('Study title is required.')).toBeInTheDocument()
    })

    it('errors a select left empty when the user moves on', async () => {
        const user = userEvent.setup()
        renderWithProviders(<Harness />)

        await user.click(screen.getByLabelText(/Data Partner/))
        await user.click(screen.getByRole('button', { name: 'next' }))

        expect(await screen.findByText('Data Partner is required.')).toBeInTheDocument()
    })

    it('clears the error once the user supplies a value', async () => {
        const user = userEvent.setup()
        renderWithProviders(<Harness />)

        await user.click(screen.getByLabelText(/Study title/))
        await user.tab()
        expect(await screen.findByText('Study title is required.')).toBeInTheDocument()

        await user.type(screen.getByLabelText(/Study title/), 'A real title')

        expect(screen.queryByText('Study title is required.')).not.toBeInTheDocument()
    })

    it('treats a whitespace-only value as incomplete', async () => {
        const user = userEvent.setup()
        renderWithProviders(<Harness />)

        await user.type(screen.getByLabelText(/Study title/), '   ')
        await user.tab()

        expect(await screen.findByText('Study title is required.')).toBeInTheDocument()
    })

    it('points the input at both its description and its error message', async () => {
        const user = userEvent.setup()
        renderWithProviders(<HarnessWithDescription />)

        await user.click(screen.getByLabelText(/Study title/))
        await user.tab()
        await screen.findByText('Study title is required.')

        const input = screen.getByLabelText(/Study title/)
        const describedBy = input.getAttribute('aria-describedby') ?? ''
        expect(describedBy).toContain('described-title-error')
        expect(describedBy).toContain('described-title-description')
        expect(document.getElementById('described-title-description')).toHaveTextContent('Keep it short and clear.')
    })

    it('points the input at its error message for assistive tech', async () => {
        const user = userEvent.setup()
        renderWithProviders(<Harness />)

        await user.click(screen.getByLabelText(/Study title/))
        await user.tab()
        await screen.findByText('Study title is required.')

        const input = screen.getByLabelText(/Study title/)
        expect(input).toHaveAttribute('aria-invalid', 'true')
        expect(input.getAttribute('aria-describedby')).toContain('title-error')
        expect(document.getElementById('title-error')).toHaveTextContent('Study title is required.')
    })
})
