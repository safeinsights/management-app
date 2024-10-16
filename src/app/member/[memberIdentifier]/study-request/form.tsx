'use client'
import { Form as HookForm, useForm, useFormState } from 'react-hook-form'
import { Button, Flex } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { onCreateStudyAction } from './actions'
import { useMutation } from '@tanstack/react-query'
import { TextInput, Textarea } from 'react-hook-form-mantine'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormValues, schema } from './schema'

export const Form: React.FC<{ memberId: string; memberIdentifier: string }> = ({ memberId, memberIdentifier }) => {
    const router = useRouter()
    const {
        control,
        formState: { isValid },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            title: '',
            description: '',
            piName: '',
        },
        mode: 'onChange',
    })

    const { mutate: createStudy, isPending } = useMutation({
        mutationFn: async (d: FormValues) => await onCreateStudyAction(memberId, d),
        onSettled(result, error) {
            if (error || !result?.studyId) {
                control.setError('title', { message: error?.message || 'An error occurred' })
            } else {
                router.push(`/member/${memberIdentifier}/study/${result.studyId}/upload`)
            }
        },
    })

    return (
        <HookForm control={control} onSubmit={({ data }) => createStudy(data)}>
            <Flex direction="column" gap="sm" mt="md" justify="stretch">
                <TextInput label="Study Title" required name="title" control={control} />
                <TextInput label="Principal Investigator" name="piName" required control={control} />
                <Textarea label="Study Description" name="description" required rows={5} control={control} />
                <Flex justify={'end'}>
                    <Button type="submit" disabled={!isValid} variant="primary" loading={isPending}>
                        Submit
                    </Button>
                </Flex>
            </Flex>
        </HookForm>
    )
}
