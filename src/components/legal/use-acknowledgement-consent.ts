'use client'

import { useMutation, type ActionResponse } from '@/common'
import { errorToString, isActionError } from '@/lib/errors'
import { acknowledgeLegalDocumentAction } from '@/server/actions/legal-acknowledgement.actions'
import { useState } from 'react'
import { queryKeys } from '@/lib/query-keys'

type Props = {
    versionIds: string[]
    /** The query the acknowledgement settles, refetched once it is recorded. */
    invalidateKey: readonly unknown[]
    onAcknowledged?: () => void
}

// In turn, stopping at the first refusal so its reason reaches the modal.
const acknowledgeEach = async (versionIds: string[]) => {
    let response: ActionResponse<{ acknowledged: boolean }> = { acknowledged: true }
    for (const versionId of versionIds) {
        response = await acknowledgeLegalDocumentAction({ versionId })
        if (isActionError(response)) return response
    }
    return response
}

// Shared by the two blocking gates: recording consent must not drift between the global Terms of
// Service and a study's agreement, since the ack row is the compliance artifact in both.
export const useAcknowledgementConsent = ({ versionIds, invalidateKey, onAcknowledged }: Props) => {
    const [consentedKey, setConsentedKey] = useState<string | null>(null)
    const versionsKey = versionIds.join(',')

    const {
        mutate: acknowledge,
        isPending,
        error,
    } = useMutation({
        mutationFn: acknowledgeEach,
        // The ack is also a row in the legal center's tables. They usually sit on another route, so
        // without them they serve pre-ack rows until their staleTime lapses.
        invalidates: () => [invalidateKey, ...queryKeys.legal.agreementTablePrefixes()],
        onSuccess: () => onAcknowledged?.(),
    })

    // Keyed to the versions on screen, not a bare boolean: a version published while the modal is
    // open must not inherit a tick given to the ones before it.
    const isChecked = Boolean(versionsKey) && consentedKey === versionsKey

    return {
        isChecked,
        onCheckedChange: (checked: boolean) => setConsentedKey(checked ? versionsKey : null),
        onContinue: () => {
            if (isChecked) acknowledge(versionIds)
        },
        isSubmitting: isPending,
        // errorToString, not error.message: the wrapped useMutation throws an ActionFailure whose
        // message is the JSON of its field errors.
        error: error ? errorToString(error) : null,
    }
}
