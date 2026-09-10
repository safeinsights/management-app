'use client'

import type { CSSProperties } from 'react'
import type { useReviewFeedback } from '@/hooks/use-review-feedback'
import { fieldCounterId, fieldDescribedBy, FieldErrorBox } from '@/components/form-field'
import { CharacterCounter } from '@/components/character-counter'
import { Editor, type EditorProps } from '@/components/editable-text/editor'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'

// Shared by the proposal and code reviews so the error slot, counter and ARIA wiring cannot
// drift apart again (OTTER-737). Outputs review deliberately owns its own.
type DecisionFeedbackEditorProps = {
    feedback: ReturnType<typeof useReviewFeedback>
    studyId: string
    docName: string
    inputId: string
    ariaLabel: string
    placeholder?: string
    contentStyle: CSSProperties
    skeletonHeight: number
    isResizable?: boolean
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
    isResizable,
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
            isResizable={isResizable}
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
