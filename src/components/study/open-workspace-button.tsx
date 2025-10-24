'use client'

import { isActionError } from '@/lib/errors'
import { createUserAndWorkspace, getStudyWorkspaceUrl } from '@/server/actions/coder.actions'
import { Button, Group, Text } from '@mantine/core'
import { useState } from 'react'

interface OpenWorkspaceButtonProps {
    name: string
    email: string
    userId: string
    studyId: string
    alreadyExists: boolean
}

export const OpenWorkspaceButton = ({ name, email, userId, studyId, alreadyExists }: OpenWorkspaceButtonProps) => {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const handleOpenWorkspace = async () => {
        setLoading(true)
        setError(null)
        setSuccess(null)

        try {
            if (alreadyExists) {
                const workspaceUrlResponse = await getStudyWorkspaceUrl({ email, userId, studyId })
                if (!isActionError(workspaceUrlResponse)) {
                    console.warn(`Workspace ${workspaceUrlResponse.url}`)
                    const url = workspaceUrlResponse.url
                    const target = '_blank'
                    const windowRef = window.open(url, target)
                    if (windowRef) windowRef.focus()
                    setSuccess('Workspace opened successfully')
                } else {
                    setError(
                        typeof workspaceUrlResponse.error === 'string'
                            ? workspaceUrlResponse.error
                            : 'An unknown error occurred',
                    )
                }
            } else {
                // Workspace doesn't exist, create it
                const result = await createUserAndWorkspace({
                    name,
                    userId,
                    email,
                    studyId,
                })

                if (isActionError(result)) {
                    setError(typeof result.error === 'string' ? result.error : 'An unknown error occurred')
                } else if (result.success) {
                    setSuccess(`Workspace created successfully: ${result.workspaceName}`)
                    const url = result.workspace.url
                    const target = '_blank'
                    const windowRef = window.open(url, target)
                    if (windowRef) windowRef.focus()
                } else {
                    setError('Failed to create workspace')
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Group>
            <Button onClick={handleOpenWorkspace} loading={loading} disabled={loading}>
                {loading ? 'Processing...' : (alreadyExists ? 'Open' : 'Create') + ' Workspace'}
            </Button>
            {error && <Text c="red">{error}</Text>}
            {success && <Text c="green">{success}</Text>}
        </Group>
    )
}
