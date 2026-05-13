'use client'

import { useQuery } from '@/common'
import { CONTEXT_LABELS, CONTEXT_NAMES, ContextName } from '@/lib/claude-context'
import { isActionError, errorToString } from '@/lib/errors'
import { getClaudeContextAction, writeClaudeContextAction } from '@/server/actions/claude-context.actions'
import { Stack, Title, Button, Textarea, Text, Group, Paper } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useState } from 'react'

type ContextProps = { name: ContextName; orgId: string | null }

function ClaudeContextEditor(
    { name, orgId, initialContent }: ContextProps & { initialContent: string }
) {
    const [content, setContent] = useState(initialContent)
    const [lastSavedContent, setLastSavedContent] = useState(initialContent)
    const [isSaving, setIsSaving] = useState(false)
    const isDiff = content !== lastSavedContent // true if there's a diff,  false if the same as db

    const onSubmit = async () => {
        setIsSaving(true)
        try {
            const result = await writeClaudeContextAction({
                name: name,
                content: content,
                orgId: orgId
            })
            if (isActionError(result)) {
                notifications.show({
                    color: 'red',
                    title: 'Context save failed',
                    message: errorToString(result),
                    autoClose: false
                })
                return
            }
            setLastSavedContent(content)
        } finally {
            setIsSaving(false)
        }

    }

    // TODO: Update title and label
    return <form action={onSubmit}>
        <Stack gap="md">
            <Textarea autosize minRows={8} maxRows={20}
                label={CONTEXT_LABELS[name].label}
                description={CONTEXT_LABELS[name].description}
                value={content}
                onChange={(e) => setContent(e.currentTarget.value)}
            ></Textarea>
            <Group justify="flex-end">
                <Button type="submit" loading={isSaving} disabled={!isDiff}>Submit</Button>
            </Group>
        </Stack>
    </form>
}

function ClaudeContextDataLoader({ name, orgId }: ContextProps) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['claudeContext', name, orgId],
        queryFn: () => getClaudeContextAction({ name, orgId }),
        retry: false
    })

    if (isLoading) return null

    if (error) {
        return <Text c="red">Failed to load context for {name}: {error.message}</Text>
    }

    if (!data) {
        return <ClaudeContextEditor name={name} orgId={orgId} initialContent='' />
    }
    return <ClaudeContextEditor name={name} orgId={orgId} initialContent={data.content} />
}

export function ClaudeContext() {
    return (
        <Stack gap="md">
            <Title order={1}>System and Language Context for Claude</Title>
            <Text c="dimmed" size="sm">
                Edit the context Claude uses for each language. The system context applies globally; language contexts apply when a study uses that language.
            </Text>
            <Stack gap="md">
                {CONTEXT_NAMES.map((contextName) => {
                    return (<Paper key={contextName} p="md" withBorder>
                        <ClaudeContextDataLoader name={contextName} orgId={null} />
                    </Paper>)
                })}
            </Stack>
        </Stack>
    )
}
