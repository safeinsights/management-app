'use client'

import { useMutation, useQueryClient } from '@/common'
import { errorToString } from '@/lib/errors'
import { agreementTableQueryKeyPrefixes } from '@/schema/legal-document'
import { acknowledgeLegalDocumentAction } from '@/server/actions/legal-document.actions'
import { useState } from 'react'

type Props = {
    versionId?: string
    /** The query the acknowledgement settles, refetched once it is recorded. */
    invalidateKey: readonly unknown[]
}

// Shared by the two blocking gates: recording consent must not drift between the global Terms of
// Service and a study's agreement, since the ack row is the compliance artifact in both.
export const useAcknowledgementConsent = ({ versionId, invalidateKey }: Props) => {
    const queryClient = useQueryClient()
    const [consentedVersionId, setConsentedVersionId] = useState<string | null>(null)

    const {
        mutate: acknowledge,
        isPending,
        error,
    } = useMutation({
        mutationFn: (version: string) => acknowledgeLegalDocumentAction({ versionId: version }),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: invalidateKey }),
                // The ack is also a row in the legal centre's tables. They usually sit on another
                // route, so without this they serve pre-ack rows until their staleTime lapses.
                ...agreementTableQueryKeyPrefixes.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
            ])
        },
    })

    return {
        // Keyed to the version on screen, not a bare boolean: a version published while the modal
        // is open must not inherit a tick given to the one before it.
        isChecked: consentedVersionId === versionId,
        onCheckedChange: (checked: boolean) => setConsentedVersionId(checked ? (versionId ?? null) : null),
        onContinue: () => {
            if (consentedVersionId) acknowledge(consentedVersionId)
        },
        isSubmitting: isPending,
        // errorToString, not error.message: the wrapped useMutation throws an ActionFailure whose
        // message is the JSON of its field errors.
        error: error ? errorToString(error) : null,
    }
}
