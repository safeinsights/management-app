'use client'

import React, { useRef } from 'react'
import { Pill, PillsInput, Text, VisuallyHidden } from '@mantine/core'
import type { UseFormReturnType } from '@mantine/form'
import type { ResearchDetailsValues } from '@/schema/researcher-profile'

interface ResearchInterestsInputProps {
    form: UseFormReturnType<ResearchDetailsValues>
    draftValue: string
    onDraftChange: (value: string) => void
    onAdd: () => void
    onRemove: (index: number) => void
}

export function ResearchInterestsInput({
    form,
    draftValue,
    onDraftChange,
    onAdd,
    onRemove,
}: ResearchInterestsInputProps) {
    // PillsInput forwards ref to its root element; Mantine types that ref as HTMLInputElement
    // even though the root renders as a div. We only need Node.contains, so the type is harmless.
    const rootRef = useRef<HTMLInputElement>(null)
    const interests = form.values.researchInterests || []
    const maxItems = 5
    const isAtLimit = interests.length >= maxItems

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!isAtLimit) onDraftChange(e.currentTarget.value)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            onAdd()
        }
        if (e.key === 'Backspace' && !draftValue && interests.length > 0) {
            onRemove(interests.length - 1)
        }
    }

    // Commit the draft only when focus moves to another element outside this input. Skip when
    // focus leaves the page entirely (switching tabs/windows makes relatedTarget null) or moves
    // to a control inside the widget (e.g. a pill's remove button, which lives inside rootRef),
    // so the user does not get an accidental pill they never meant to add.
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        const next = e.relatedTarget as Node | null
        if (!next || rootRef.current?.contains(next)) return
        onAdd()
    }

    const interestPills = interests.map((item, idx) => (
        <Pill key={form.key(`researchInterests.${idx}`)} withRemoveButton onRemove={() => onRemove(idx)}>
            {item}
        </Pill>
    ))

    const announcement = interests.length
        ? `Research interests: ${interests.join(', ')}`
        : 'No research interests selected'

    return (
        <>
            <PillsInput ref={rootRef} id="researchInterests" error={form.errors.researchInterests as unknown as string}>
                <Pill.Group>
                    {interestPills}
                    <PillsInput.Field
                        placeholder={isAtLimit ? '' : 'Type a research interest and press enter'}
                        value={draftValue}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        onBlur={handleBlur}
                    />
                </Pill.Group>
            </PillsInput>
            <VisuallyHidden role="status">{announcement}</VisuallyHidden>
            <InterestsHelperText isVisible={!isAtLimit} />
        </>
    )
}

function InterestsHelperText({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text size="sm" mt={4}>
            Include up to five area(s) of research interest.
        </Text>
    )
}
