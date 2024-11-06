'use client'
import { useForm } from '@mantine/form'
import { TextInput, Textarea, Button, Flex } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { onCreateStudyAction } from './actions'
import { useMutation } from '@tanstack/react-query'
import { customLabel } from './style.css'
import { zodResolver, FormValues, schema } from './schema'

export const Form: React.FC<{ memberId: string; memberIdentifier: string }> = ({ memberId }) => {
    const router = useRouter()
    const form = useForm<FormValues>({
        mode: 'uncontrolled',
        validate: zodResolver(schema),
        validateInputOnBlur: true,
        initialValues: {
            title: '',
            description: '',
            piName: '',
        },
    })


    const { mutate: createStudy, isPending } = useMutation({
        mutationFn: async (d: FormValues) => await onCreateStudyAction(memberId, d),
        onSettled(result, error) {
            if (error || !result?.studyId) {
                form.setErrors({
                    title: error?.message || 'An error occurred',
                })
            } else {
                router.push(`/researcher/study/${result.studyId}/upload`)
            }
        },
    })

    return (
        <form onSubmit={form.onSubmit((values) => createStudy(values))}>
            <Flex direction="column" gap="xl" mt="md" justify="stretch">
                <TextInput
                    label="Study Title" required name="title"
                    key={form.key('title')}
                    {...form.getInputProps('title')}
                    className={customLabel}
                />
                <TextInput
                    label="Principal Investigator"
                    name="piName"
                    required
                    key={form.key('piName')}
                    {...form.getInputProps('piName')}
                    className={customLabel}
                />
                <Textarea
                    label="Study Description"
                    name="description"
                    required
                    rows={5}
                    key={form.key('description')}
                    {...form.getInputProps('description')}
                    className={customLabel}
                />
                <Flex justify={'end'}>
                    <Button fz="lg" type="submit" disabled={!form.isValid} variant="primary" loading={isPending}>
                        Submit
                    </Button>
                </Flex>
            </Flex>
        </form>
    )
}
