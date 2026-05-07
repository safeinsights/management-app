'use client'

import { useQuery } from '@/common'
import { CONTEXT_NAMES } from '@/lib/claude-context'
import { isActionError, errorToString } from '@/lib/errors'
import { getClaudeContextAction, writeClaudeContextAction } from '@/server/actions/claude-context.actions'
import { Box, Stack, Title, Button, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useState } from 'react'

type ContextProps = { name: string; orgId: string | null }

function ClaudeContextEditor(
    {name, orgId, initialContent}:  ContextProps & { initialContent: string}
) {
    const [content, setContent] = useState(initialContent)

    const onSubmit = async () => {
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
    }
    // TODO: Update title and label
    return <form action={onSubmit}>
        <Textarea
            label="System context"
            description="Context about the general SI system"
            value={content}
            onChange={(e) => setContent(e.currentTarget.value)}
        ></Textarea>
        <Button type="submit">Submit</Button>
    </form>
}

function ClaudeContextDataLoader({name, orgId}: ContextProps) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['claudeContext', name, orgId],
        queryFn: () => getClaudeContextAction({ name, orgId})
    })

    if (isLoading) return null

    if (error) {
        notifications.show({
            color: 'red',
            title: 'Failed to load existing context for ' + name,
            message: error.message,
            autoClose: false
        })
        return
    }

    if (!data) {
        return <ClaudeContextEditor name={name} orgId={orgId} initialContent='' />
    }
    return <ClaudeContextEditor name={name} orgId={orgId} initialContent={data.content} />
}

export function ClaudeContext() {
    return (
        <Box style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
            <Title>System and Language Context for Claude</Title>
            <Stack p="md">
                {CONTEXT_NAMES.map((contextName) => {
                    return <ClaudeContextDataLoader key={contextName} name={contextName} orgId={null} />
                })}
            </Stack>
        </Box>
    )
}
