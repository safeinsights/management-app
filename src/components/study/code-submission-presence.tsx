'use client'

import { useMemo } from 'react'
import { useUser } from '@clerk/nextjs'

import { ActiveEditorsList } from '@/components/editable-text/collaborative-editor'
import type { CodeSubmissionPresence as Presence } from '@/hooks/use-code-submission-presence'

// Display only: shows who else has the code page open. The kick-out lives in useCodeSubmissionPresence.
export function CodeSubmissionPresence({ provider }: Pick<Presence, 'provider'>) {
    const { user } = useUser()
    const providerRef = useMemo(() => ({ current: provider }), [provider])

    return <ActiveEditorsList providerRef={providerRef} currentUserId={user?.id} />
}
