'use client'

import { useMutation, useQuery, useQueryClient } from '@/common'
import { CONTEXT_LABELS, CONTEXT_NAMES, ContextName } from '@/lib/claude-context'
import { errorToString, isActionError } from '@/lib/errors'
import { getClaudeContextAction, writeClaudeContextAction } from '@/server/actions/claude-context.actions'
import { Stack, Title, Button, Textarea, Text, Group, Paper } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'

type ContextProps = { name: ContextName; orgId: string | null }

type EditorFormValues = { content: string }

function useClaudeContextEditor({ name, orgId, initialContent }: ContextProps & { initialContent: string }) {
    const queryClient = useQueryClient()

    const form = useForm<EditorFormValues>({
        initialValues: { content: initialContent },
    })

    const { mutate, isPending } = useMutation({
        mutationFn: writeClaudeContextAction,
        onSuccess: (_, variables) => {
            form.resetDirty({ content: variables.content })
            queryClient.invalidateQueries({ queryKey: ['claudeContext', name, orgId] })
        },
        onError: (error) => {
            notifications.show({
                color: 'red',
                title: 'Context save failed',
                message: errorToString(error),
                autoClose: false,
            })
        },
    })

    const onSubmit = form.onSubmit(({ content }) => {
        mutate({ name, content, orgId })
    })

    return { form, onSubmit, isPending }
}

function ClaudeContextEditor({ name, orgId, initialContent }: ContextProps & { initialContent: string }) {
    const { form, onSubmit, isPending } = useClaudeContextEditor({ name, orgId, initialContent })

    return (
        <form onSubmit={onSubmit}>
            <Stack gap="md">
                <Textarea
                    autosize
                    minRows={8}
                    maxRows={20}
                    label={CONTEXT_LABELS[name].label}
                    description={CONTEXT_LABELS[name].description}
                    {...form.getInputProps('content')}
                />
                <Group justify="flex-end">
                    <Button type="submit" loading={isPending} disabled={!form.isDirty()}>
                        Submit
                    </Button>
                </Group>
            </Stack>
        </form>
    )
}

function ClaudeContextDataLoader({ name, orgId }: ContextProps) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['claudeContext', name, orgId],
        queryFn: () => getClaudeContextAction({ name, orgId }),
        retry: false,
    })

    if (isLoading) return null

    if (error) {
        return (
            <Text c="red">
                Failed to load context for {name}: {error.message}
            </Text>
        )
    }
    return <ClaudeContextEditor name={name} orgId={orgId} initialContent={data ? data.content : ''} />
}

export function ClaudeContext() {
    return (
        <Stack gap="md">
            <Title order={1}>System and Language Context for Claude</Title>
            <Text c="dimmed" size="sm">
                Edit the context Claude uses for each language. The system context applies globally; language contexts
                apply when a study uses that language.
            </Text>
            <Stack gap="md">
                {CONTEXT_NAMES.map((contextName) => {
                    return (
                        <Paper key={contextName} p="md" withBorder>
                            <ClaudeContextDataLoader name={contextName} orgId={null} />
                        </Paper>
                    )
                })}
            </Stack>
        </Stack>
    )
}
