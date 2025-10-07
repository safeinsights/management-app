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

const schema = z.object({
    name: z.string().min(1, { message: 'Name is required' }),
    language: z.enum(['r', 'python']),
    file: z.instanceof(File),
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
                <TextInput label="Name" placeholder="Starter code name" {...form.getInputProps('name')} />
                <Select
                    label="Language"
                    data={['r', 'python']}
                    {...form.getInputProps('language')}
                />
                <FileInput label="File" placeholder="Select a file" {...form.getInputProps('file')} />
                <Button type="submit" loading={mutation.isPending}>Save Code</Button>
            </Stack>
        </form>
    )
}
