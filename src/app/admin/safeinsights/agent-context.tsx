'use client'

import { useMutation, useQuery, useQueryClient } from '@/common'
import { CONTEXT_LABELS, CONTEXT_NAMES, ContextName } from '@/lib/agent-context'
import { errorToString } from '@/lib/errors'
import { getAgentContextAction, writeAgentContextAction } from '@/server/actions/agent-context.actions'
import { Stack, Title, Button, Textarea, Text, Group, Paper } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'

type ContextProps = { name: ContextName; orgId: string | null }

type EditorFormValues = { content: string }

function useAgentContextEditor({ name, orgId, initialContent }: ContextProps & { initialContent: string }) {
    const queryClient = useQueryClient()

    const form = useForm<EditorFormValues>({
        initialValues: { content: initialContent },
    })

    const { mutate, isPending } = useMutation({
        mutationFn: writeAgentContextAction,
        onSuccess: (_, variables) => {
            form.resetDirty({ content: variables.content })
            queryClient.invalidateQueries({ queryKey: ['agentContext', name, orgId] })
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

function AgentContextEditor({ name, orgId, initialContent }: ContextProps & { initialContent: string }) {
    const { form, onSubmit, isPending } = useAgentContextEditor({ name, orgId, initialContent })

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

function AgentContextDataLoader({ name, orgId }: ContextProps) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['agentContext', name, orgId],
        queryFn: () => getAgentContextAction({ name, orgId }),
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
    return <AgentContextEditor name={name} orgId={orgId} initialContent={data ? data.content : ''} />
}

export function AgentContext() {
    return (
        <Stack gap="md">
            <Title order={1}>System and Language Context for the AI assistant</Title>
            <Text c="dimmed" size="sm">
                Edit the context the AI assistant uses for each language. The system context applies globally; language
                contexts apply when a study uses that language.
            </Text>
            <Stack gap="md">
                {CONTEXT_NAMES.map((contextName) => {
                    return (
                        <Paper key={contextName} p="md" withBorder>
                            <AgentContextDataLoader name={contextName} orgId={null} />
                        </Paper>
                    )
                })}
            </Stack>
        </Stack>
    )
}
