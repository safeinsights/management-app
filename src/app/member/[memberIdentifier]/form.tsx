'use client'
import { Form as HookForm, useForm } from 'react-hook-form'
import { Button, Flex } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { onCreateStudyAction } from './actions'
import { useMutation } from '@tanstack/react-query'
import { TextInput } from 'react-hook-form-mantine'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormValues, schema } from './schema'

export const Form: React.FC<{ memberId: string; memberIdentifier: string }> = ({ memberId, memberIdentifier }) => {
    const router = useRouter()

    const { control } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            title: '',
        },
    })

    const { mutate: createStudy, isPending } = useMutation({
        mutationFn: async (d: FormValues) => await onCreateStudyAction(memberId, d),
        onSettled(studyId, error) {
            if (error) {
                control.setError('title', { message: error?.message || 'An error occurred' })
            } else {
                router.push(`/member/${memberIdentifier}/study/${studyId}`)
            }
        },
    })

    return (
        <HookForm control={control} onSubmit={({ data }) => createStudy(data)}>
            <Flex mt="lg" direction="column">
                <Flex direction="row" gap="sm" mt="md" align={'end'}>
                    <TextInput
                        label="By what title shall your study be known?"
                        name="title"
                        control={control}
                        aria-label="Study Name"
                        style={{ width: 350 }}
                    />
                    <Button type="submit" variant="primary" loading={isPending}>
                        Let’s Begin
                    </Button>
                </Flex>
            </Flex>
        </HookForm>
    )
}
