'use client'

import { FC, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button, Group, Stack, Text } from '@mantine/core'
import { AppModal } from '@/components/modal'
import { InfoTooltip } from '@/components/tooltip'
import { Routes } from '@/lib/routes'
import { useEditCodeResubmit } from '@/contexts/edit-code-resubmit'

interface EditStudyCodeFooterProps {
    mainFileName: string
    fileNames: string[]
    hasFiles: boolean
    filesChanged: boolean
}

const SAVE_AND_EXIT_TOOLTIP =
    "Progress saved! Note: On exiting the edit mode, your changes won't be visible until you hit Resubmit study code."

export const EditStudyCodeFooter: FC<EditStudyCodeFooterProps> = ({
    mainFileName,
    fileNames,
    hasFiles,
    filesChanged,
}) => {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { studyId, noteForm, saveDraft, resubmit, isSaving, isSubmitting } = useEditCodeResubmit()

    const [isConfirmOpen, setConfirmOpen] = useState(false)

    const isBusy = isSaving || isSubmitting
    const exitTarget = Routes.studyView({ orgSlug, studyId })
    const hasChanges = noteForm.values.resubmissionNote.length > 0 || filesChanged

    const handleCancel = () => {
        if (isBusy) return
        router.push(exitTarget)
    }

    const handleSaveAndExit = async () => {
        if (isBusy) return
        const saved = await saveDraft()
        if (!saved) return
        router.push(exitTarget)
    }

    const canResubmit = hasFiles && mainFileName !== '' && noteForm.isValid() && !isBusy
    const handleConfirmResubmit = () => {
        setConfirmOpen(false)
        resubmit({ mainFileName, fileNames })
    }

    const exitButton = hasChanges ? (
        <InfoTooltip label={SAVE_AND_EXIT_TOOLTIP} withArrow multiline w={320}>
            <Button variant="outline" size="md" disabled={isBusy} loading={isSaving} onClick={handleSaveAndExit}>
                Save and exit
            </Button>
        </InfoTooltip>
    ) : (
        <Button variant="subtle" size="md" disabled={isBusy} onClick={handleCancel}>
            Cancel
        </Button>
    )

    return (
        <>
            <Group justify="flex-end" mt="xs">
                {exitButton}
                <Button
                    variant="primary"
                    size="md"
                    disabled={!canResubmit}
                    loading={isSubmitting}
                    onClick={() => setConfirmOpen(true)}
                >
                    Resubmit study code
                </Button>
            </Group>

            <AppModal
                size="md"
                isOpen={isConfirmOpen}
                onClose={() => setConfirmOpen(false)}
                title="Resubmit study code?"
            >
                <Stack gap="md">
                    <Text>Are you sure you want to resubmit your study code for review?</Text>
                    <Group justify="flex-end" mt="md">
                        <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={handleConfirmResubmit} loading={isSubmitting}>
                            Yes, resubmit
                        </Button>
                    </Group>
                </Stack>
            </AppModal>
        </>
    )
}
