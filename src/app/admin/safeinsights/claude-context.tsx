'use client'

import { useQuery } from '@/common'
import { isActionError, errorToString } from '@/lib/errors'
import { getClaudeContextAction, writeClaudeContextAction } from '@/server/actions/claude-context.actions'
import { Box, Group, Stack, Title, Text, FileButton, Button, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { FileArrowUpIcon, UploadIcon } from '@phosphor-icons/react/dist/ssr'
import React, { useRef, useState } from 'react'

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
    const { data, isLoading } = useQuery({
        queryKey: ['claudeContext', name, orgId],
        queryFn: () => getClaudeContextAction({ name, orgId})
    })

    if (isLoading || !data) return null
    return <ClaudeContextEditor name={name} orgId={orgId} initialContent={data.content} />
}

export function ClaudeContext() {
    const systemContext = { name: 'system', orgId: null }

    return (
        <Box style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
            <Title>System and Language Context for Claude</Title>
            <Stack p="md">
                {/* TODO: iterate over types of context; a different form for each */}
                <ClaudeContextDataLoader name={systemContext.name} orgId={systemContext.orgId} />
            </Stack>
        </Box>
    )
}
