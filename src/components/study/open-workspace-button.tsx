'use client'

import { isActionError } from '@/lib/errors'
import { createUserAndWorkspace, getStudyWorkspaceUrl } from '@/server/actions/coder.actions'
import { Button, Group, Alert } from '@mantine/core'
import { useState } from 'react'

interface OpenWorkspaceButtonProps {
    name: string
    email: string
    userId: string
    studyId: string
    alreadyExists: boolean
    isReady: boolean
}

// Helper function to open workspace in new tab
const openWorkspaceInNewTab = (url: string) => {
    const target = '_blank'
    const windowRef = window.open(url, target)
    if (windowRef) windowRef.focus()
}

export const OpenWorkspaceButton = ({ name, email, userId, studyId, alreadyExists, isReady }: OpenWorkspaceButtonProps) => {
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
                    openWorkspaceInNewTab(workspaceUrlResponse.url)
                    setSuccess('Workspace opened successfully in a new tab')
                } else {
                    setError(
                        typeof workspaceUrlResponse.error === 'string'
                            ? workspaceUrlResponse.error
                            : 'Failed to retrieve workspace URL',
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
                    setError(typeof result.error === 'string' ? result.error : 'Failed to create workspace')
                } else if (result.success) {
                    setSuccess(`Workspace creation in progress!: ${result.workspaceName}`)
                } else {
                    setError('Failed to create workspace')
                }
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred'
            setError(`Operation failed: ${errorMessage}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Group gap="sm">
            {error && (
                <Alert 
                    variant="light" 
                    color="red" 
                    title="Error" 
                    style={{ marginTop: '0.5rem' }}
                    aria-live="assertive"
                >
                    {error}
                </Alert>
            )}
            {success && (
                <Alert 
                    variant="light" 
                    color="green" 
                    title="Success" 
                    style={{ marginTop: '0.5rem' }}
                    aria-live="polite"
                >
                    {success}
                </Alert>
            )}
            <Button 
                onClick={handleOpenWorkspace} 
                loading={loading} 
                disabled={loading || (alreadyExists && !isReady)}
                aria-busy={loading}
                aria-disabled={loading || (alreadyExists && !isReady)}
            >
                {
                    !alreadyExists ? 'Create Workspace' : isReady ? 'Open Workspace' : 'Creating Workspace'
                }
            </Button>
        </Group>
    )
}
