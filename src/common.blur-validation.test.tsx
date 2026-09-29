import { describe, expect, it } from 'vitest'
import { MultiSelect, Select, TextInput } from '@mantine/core'
import { z } from 'zod'
import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { useForm, zodResolver } from '@/common'
import { FormField, nativeFieldProps } from '@/components/form-field'

// OTTER-647: Mantine defaults `validateInputOnBlur` to false, so this exercises the @/common
// `useForm` wrapper that turns it on.

const schema = z.object({
    title: z.string().trim().min(1, { message: 'Study title is required.' }),
    partner: z.string().min(1, { message: 'Data Partner is required.' }),
    datasets: z.array(z.string()).min(1, { message: 'Select at least one dataset.' }),
})

function Harness() {
    const form = useForm({
        initialValues: { title: '', partner: '', datasets: [] as string[] },
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
            {/* MultiSelect stores an array and renders pills, so its ids are asserted separately. */}
            <FormField inputId="datasets" label="Dataset(s) of interest" required error={form.errors.datasets}>
                <MultiSelect
                    id="datasets"
                    data={[{ value: 'ds-a', label: 'Dataset A' }]}
                    {...form.getInputProps('datasets')}
                    {...nativeFieldProps(form.errors.datasets as unknown as string)}
                />
            </FormField>
            <button type="button">next</button>
        </>
    )
}

// Fragile because it depends on the inner and outer Input.Wrapper deriving the same description id.
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

    it('errors a multi-select left empty when the user moves on, and reaches its message', async () => {
        const user = userEvent.setup()
        renderWithProviders(<Harness />)

        await user.click(screen.getByLabelText(/Dataset\(s\) of interest/))
        await user.tab()
        await screen.findByText('Select at least one dataset.')

        const input = screen.getByLabelText(/Dataset\(s\) of interest/)
        expect(input).toHaveAttribute('aria-invalid', 'true')
        expect(input.getAttribute('aria-describedby')).toContain('datasets-error')
        expect(document.getElementById('datasets-error')).toHaveTextContent('Select at least one dataset.')
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

// Global `validateInputOnBlur` cleared the error whenever the client rule passed, silently erasing
// `setFieldError` messages from a server rejection.
describe('server-set errors survive a blur', () => {
    function ServerErrorHarness() {
        const form = useForm({
            initialValues: { email: '', password: '' },
            validate: zodResolver(z.object({ email: z.string(), password: z.string() })),
        })

        return (
            <>
                <TextInput label="Email" {...form.getInputProps('email')} />
                <TextInput label="Password" {...form.getInputProps('password')} />
                <button type="button" onClick={() => form.setFieldError('password', 'Incorrect password.')}>
                    reject
                </button>
            </>
        )
    }

    it('keeps a server error when the field is re-read and left unchanged', async () => {
        const user = userEvent.setup()
        renderWithProviders(<ServerErrorHarness />)

        await user.click(screen.getByRole('button', { name: 'reject' }))
        expect(await screen.findByText('Incorrect password.')).toBeInTheDocument()

        await user.click(screen.getByLabelText('Password'))
        await user.tab()

        expect(screen.getByText('Incorrect password.')).toBeInTheDocument()
    })

    it('drops the server error once the user edits the value', async () => {
        const user = userEvent.setup()
        renderWithProviders(<ServerErrorHarness />)

        await user.click(screen.getByRole('button', { name: 'reject' }))
        expect(await screen.findByText('Incorrect password.')).toBeInTheDocument()

        await user.type(screen.getByLabelText('Password'), 'x')

        expect(screen.queryByText('Incorrect password.')).not.toBeInTheDocument()
    })
})
