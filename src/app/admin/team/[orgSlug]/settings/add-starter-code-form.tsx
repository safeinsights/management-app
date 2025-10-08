'use client'

import { TextInput, Button, Stack, Select, FileInput } from '@mantine/core'
import { useForm } from '@mantine/form'
import { zodResolver } from 'mantine-form-zod-resolver'
import { z } from 'zod'
import { useMutation } from '@/common'
import { useParams } from 'next/navigation'
import { createStarterCodeAction } from './starter-code.actions'
import { reportMutationError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { FileCodeIcon } from '@phosphor-icons/react/dist/ssr'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const schema = z.object({
    name: z.string().min(1, { message: 'Name is required' }),
    language: z.enum(['r', 'python'], { message: 'Please select a language' }),
    file: z
        .instanceof(File)
        .refine((file) => file.size <= MAX_FILE_SIZE, {
            message: 'File size must be less than 10MB',
        })
        .refine(
            (file) => {
                const ext = file.name.split('.').pop()?.toLowerCase()
                return ext === 'r' || ext === 'py'
            },
            {
                message: 'File must be a .r or .py file',
            },
        ),
})

type AddStarterCodeFormProps = {
    onCompleteAction: () => void
}

export const AddStarterCodeForm: React.FC<AddStarterCodeFormProps> = ({ onCompleteAction }) => {
    const { orgSlug } = useParams<{ orgSlug: string }>()

    const form = useForm({
        initialValues: {
            name: '',
            language: 'r' as const,
            file: undefined as File | undefined,
        },
        validate: zodResolver(schema),
    })

    const mutation = useMutation({
        mutationFn: createStarterCodeAction,
        onSuccess: () => {
            reportSuccess('Starter code added successfully')
            onCompleteAction()
        },
        onError: reportMutationError('Failed to add starter code'),
    })

    const handleSubmit = async (values: typeof form.values) => {
        if (!values.file) return
        mutation.mutate({ ...values, orgSlug, file: values.file })
    }

    return (
        <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack>
                <TextInput label="Name" placeholder="Starter code name" {...form.getInputProps('name')} required />
                <Select
                    label="Language"
                    placeholder="Select language"
                    data={[
                        { value: 'r', label: 'R' },
                        { value: 'python', label: 'Python' },
                    ]}
                    {...form.getInputProps('language')}
                    required
                />
                <FileInput
                    label="File"
                    placeholder="Select a file"
                    leftSection={<FileCodeIcon size={16} />}
                    accept=".r,.R,.py"
                    {...form.getInputProps('file')}
                    required
                    description="Maximum file size: 10MB. Accepted formats: .r, .py"
                />
                <Button type="submit" loading={mutation.isPending}>
                    Save Code
                </Button>
            </Stack>
        </form>
    )
}
