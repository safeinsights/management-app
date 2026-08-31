'use client'

import type { CSSProperties } from 'react'
import type { useReviewFeedback } from '@/hooks/use-review-feedback'
import { fieldCounterId, fieldDescribedBy, FieldErrorBox } from '@/components/form-field'
import { CharacterCounter } from '@/components/character-counter'
import { Editor, type EditorProps } from '@/components/editable-text/editor'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'

/**
 * The Data Partner's Decision editor, shared by the proposal review and the code review.
 *
 * The two pages had a copy each, differing only in the document name, the ids and the copy. What
 * they had in common was the part worth keeping in one place: the error slot, the counter, and the
 * ARIA wiring that ties the two to the editor. That wiring had already drifted once, because every
 * change to it (the counter id, the live region, `hasCounter`) had to be made twice by hand
 * (OTTER-737).
 *
 * Outputs review is deliberately not a caller. It carries its own decision radios and its own
 * error derivation, and shares only the components below.
 */
type DecisionFeedbackEditorProps = {
    feedback: ReturnType<typeof useReviewFeedback>
    studyId: string
    /** Yjs document name. NOT a DOM id; `inputId` is that. */
    docName: string
    inputId: string
    ariaLabel: string
    placeholder: string
    /** Owned by the caller: the two pages give the editor different heights and font sizes. */
    contentStyle: CSSProperties
    skeletonHeight: number
    onProviderReady: EditorProps['onProviderReady']
}

export function DecisionFeedbackEditor({
    feedback,
    studyId,
    docName,
    inputId,
    ariaLabel,
    placeholder,
    contentStyle,
    skeletonHeight,
    onProviderReady,
}: DecisionFeedbackEditorProps) {
    const websocketProvider = useYjsWebsocket()

    const describedBy = fieldDescribedBy(inputId, {
        hasError: !!feedback.error,
        hasDescription: false,
        hasCounter: true,
    })

    return (
        <Editor
            id={docName}
            inputId={inputId}
            studyId={studyId}
            websocketProvider={websocketProvider}
            contentStyle={contentStyle}
            onChange={feedback.onChange}
            onBlur={feedback.onBlur}
            error={feedback.error}
            ariaLabel={ariaLabel}
            ariaRequired
            ariaDescribedBy={describedBy}
            placeholder={placeholder}
            // The error takes exactly the slot the save indicator vacates, so it sits directly
            // under the input instead of a row below the character counter (OTTER-674).
            footerLeft={<FieldErrorBox fieldId={inputId} error={feedback.error} isLive />}
            footerRight={
                <CharacterCounter
                    id={fieldCounterId(inputId)}
                    count={feedback.characterCount}
                    maxCharacters={feedback.maxCharacters}
                />
            }
            onProviderReady={onProviderReady}
            skeletonHeight={skeletonHeight}
        />
    )
}
