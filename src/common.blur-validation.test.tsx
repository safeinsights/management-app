import { describe, expect, it } from 'vitest'
import { Checkbox, MultiSelect, Select, TextInput } from '@mantine/core'
import { z } from 'zod'
import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { useForm, zodResolver } from '@/common'
import { InputError } from '@/components/errors'
import { FormField, nativeFieldProps } from '@/components/form-field'

// The error the field announces, found only when it carries the design's icon.
function describedError(input: HTMLElement) {
    const ids = input.getAttribute('aria-describedby')?.split(' ') ?? []
    return ids.map((id) => document.getElementById(id)).find((el) => el?.querySelector('svg'))
}

// OTTER-647: Mantine defaults `validateInputOnBlur` to false, so this exercises the @/common
// `useForm` wrapper that turns it on.

const schema = z.object({
    title: z.string().trim().min(1, { error: 'Study title is required.' }),
    partner: z.string().min(1, { error: 'Data Partner is required.' }),
    datasets: z.array(z.string()).min(1, { error: 'Select at least one dataset.' }),
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
        validate: zodResolver(z.object({ title: z.string().trim().min(1, { error: 'Study title is required.' }) })),
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
        expect(describedError(screen.getByLabelText('Password'))).toHaveTextContent('Incorrect password.')
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

describe('error icon from the shared useForm', () => {
    const titleSchema = z.object({ title: z.string().trim().min(1, { error: 'Enter a title.' }) })

    type Options = { withError?: boolean; withFocus?: boolean }

    function IconHarness({ options, override }: { options?: Options; override?: boolean }) {
        const form = useForm({ initialValues: { title: '' }, validate: zodResolver(titleSchema) })
        const ownError = override && form.errors.title ? <InputError error={form.errors.title} /> : undefined

        return (
            <>
                <TextInput
                    label="Title"
                    {...form.getInputProps('title', options)}
                    {...(override ? { error: ownError } : {})}
                />
                <button type="button" onClick={() => form.setFieldError('title', 'Server says no.')}>
                    reject
                </button>
                <button type="button" onClick={() => form.setFieldError('title', true)}>
                    flag
                </button>
            </>
        )
    }

    it('wraps a blur error in the icon and keeps the aria wiring', async () => {
        const user = userEvent.setup()
        renderWithProviders(<IconHarness />)

        await user.click(screen.getByLabelText('Title'))
        await user.tab()
        await screen.findByText('Enter a title.')

        const input = screen.getByLabelText('Title')
        expect(input).toHaveAttribute('aria-invalid', 'true')
        expect(describedError(input)).toHaveTextContent('Enter a title.')
    })

    it('shows no error for a field read with withError false', async () => {
        const user = userEvent.setup()
        renderWithProviders(<IconHarness options={{ withError: false }} />)

        await user.click(screen.getByRole('button', { name: 'reject' }))

        expect(screen.queryByText('Server says no.')).not.toBeInTheDocument()
        expect(screen.getByLabelText('Title')).not.toHaveAttribute('aria-invalid', 'true')
    })

    it('wraps the error on a field that has no blur handler', async () => {
        const user = userEvent.setup()
        renderWithProviders(<IconHarness options={{ withFocus: false }} />)

        await user.click(screen.getByRole('button', { name: 'reject' }))

        expect(describedError(screen.getByLabelText('Title'))).toHaveTextContent('Server says no.')
    })

    it('lets an error set after the spread win, so it shows one time', async () => {
        const user = userEvent.setup()
        renderWithProviders(<IconHarness override />)

        await user.click(screen.getByRole('button', { name: 'reject' }))

        expect(screen.getAllByText('Server says no.')).toHaveLength(1)
        expect(describedError(screen.getByLabelText('Title'))?.querySelectorAll('svg')).toHaveLength(1)
    })

    it('passes a boolean error through as invalid with no message', async () => {
        const user = userEvent.setup()
        renderWithProviders(<IconHarness />)

        await user.click(screen.getByRole('button', { name: 'flag' }))

        const input = screen.getByLabelText('Title')
        expect(input).toHaveAttribute('aria-invalid', 'true')
        expect(input).not.toHaveAttribute('aria-describedby')
    })

    it('wraps a checkbox error in the icon', async () => {
        function CheckboxHarness() {
            const form = useForm({ initialValues: { accept: false } })

            return (
                <>
                    <Checkbox label="Accept" {...form.getInputProps('accept', { type: 'checkbox' })} />
                    <button type="button" onClick={() => form.setFieldError('accept', 'Accept to continue.')}>
                        reject
                    </button>
                </>
            )
        }

        const user = userEvent.setup()
        renderWithProviders(<CheckboxHarness />)

        await user.click(screen.getByRole('button', { name: 'reject' }))

        expect(screen.getByText('Accept to continue.').closest('p')?.querySelector('svg')).toBeInTheDocument()
    })
})
