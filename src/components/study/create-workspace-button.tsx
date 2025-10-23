'use client'

import { isActionError } from '@/lib/errors'
import { createUserAndWorkspace } from '@/server/actions/coder.actions'
import { Button, Group, Text } from '@mantine/core'
import { useState } from 'react'

interface CreateWorkspaceButtonProps {
    name: string
    email: string
    userId: string
    studyId: string
    studyTitle: string
}

export const CreateWorkspaceButton = ({ name, email, userId, studyId, studyTitle }: CreateWorkspaceButtonProps) => {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const handleCreateWorkspace = async () => {
        setLoading(true)
        setError(null)
        setSuccess(null)

        try {
            const result = await createUserAndWorkspace({
                name,
                userId,
                email,
                studyId,
                studyTitle,
            })

            if (isActionError(result)) {
                setError(typeof result.error === 'string' ? result.error : 'An unknown error occurred')
            } else if (result.success) {
                setSuccess(`Workspace created successfully: ${result.workspaceName}`)
                window.open(result.url, '_blank')?.focus()
            } else {
                setError('Failed to create workspace')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Group>
            <Button onClick={handleCreateWorkspace} loading={loading} disabled={loading}>
                Create Workspace
            </Button>
            {error && <Text c="red">{error}</Text>}
            {success && <Text c="green">{success}</Text>}
        </Group>
    )
}
