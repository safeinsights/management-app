'use client'

import { useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useUser } from '@clerk/nextjs'

import { ActiveEditorsList } from '@/components/editable-text/collaborative-editor'
import { useSubmissionRedirectListener } from '@/hooks/use-submission-redirect-listener'
import type { CodeSubmissionPresence as Presence } from '@/hooks/use-code-submission-presence'

type Props = Pick<Presence, 'provider' | 'tabSessionId'> & { studyId: string }

// Shows who else has the code page open and kicks this tab out when one of them submits.
export function CodeSubmissionPresence({ provider, tabSessionId, studyId }: Props) {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { user } = useUser()
    const providerRef = useMemo(() => ({ current: provider }), [provider])

    useSubmissionRedirectListener({ provider, orgSlug, studyId, currentTabId: tabSessionId })

    return <ActiveEditorsList providerRef={providerRef} currentUserId={user?.id} />
}
