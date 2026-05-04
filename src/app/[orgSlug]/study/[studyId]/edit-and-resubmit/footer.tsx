'use client'

import { FC, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button, Group, Stack, Text } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { AppModal } from '@/components/modal'
import { Routes } from '@/lib/routes'
import { hasLexicalContent } from '@/lib/word-count'
import { useEditResubmit } from '@/contexts/edit-resubmit'
import { ReviewerPreview } from '@/app/[orgSlug]/study/[studyId]/proposal/reviewer-preview'

interface EditResubmitFooterProps {
    researcherName: string
    researcherId: string
    enclaveOrgSlug?: string
}

export const EditResubmitFooter: FC<EditResubmitFooterProps> = ({ researcherName, researcherId, enclaveOrgSlug }) => {
    const router = useRouter()
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const { studyId, form, noteForm, saveDraft, resubmit, isSaving, isSubmitting } = useEditResubmit()

    const [isReviewerOpen, setReviewerOpen] = useState(false)
    const [isConfirmOpen, setConfirmOpen] = useState(false)

    const isBusy = isSaving || isSubmitting

    const { researchQuestions, projectSummary, impact, additionalNotes, datasets, piName } = form.values
    const hasContent =
        hasLexicalContent(researchQuestions, projectSummary, impact, additionalNotes) || datasets.length > 0 || !!piName

    const isFormValid = form.isValid() && noteForm.isValid()

    const handleBack = async () => {
        if (form.isDirty()) {
            const saved = await saveDraft()
            if (!saved) return
        }
        router.push(Routes.studyView({ orgSlug, studyId }))
    }

    const handleConfirmResubmit = () => {
        setConfirmOpen(false)
        resubmit()
    }

    return (
        <>
            <Group mt="xs" justify="space-between" w="100%">
                <Button
                    type="button"
                    variant="subtle"
                    size="md"
                    leftSection={<CaretLeftIcon />}
                    disabled={isBusy}
                    loading={isSaving}
                    onClick={handleBack}
                >
                    Back
                </Button>
                <Group>
                    <Button
                        variant="outline"
                        size="md"
                        disabled={!hasContent || isBusy}
                        onClick={() => setReviewerOpen(true)}
                    >
                        View as reviewer
                    </Button>
                    <Button
                        variant="outline"
                        size="md"
                        disabled={!form.isDirty() || isBusy}
                        loading={isSaving}
                        onClick={saveDraft}
                    >
                        Save as draft
                    </Button>
                    <Button
                        size="md"
                        variant="primary"
                        disabled={!isFormValid || isBusy}
                        loading={isSubmitting}
                        onClick={() => setConfirmOpen(true)}
                    >
                        Resubmit initial request
                    </Button>
                </Group>
            </Group>

            <AppModal size="xl" isOpen={isReviewerOpen} onClose={() => setReviewerOpen(false)} title="View as reviewer">
                <ReviewerPreview
                    researcherName={researcherName}
                    researcherId={researcherId}
                    piUserId={form.values.piUserId}
                    enclaveOrgSlug={enclaveOrgSlug}
                />
            </AppModal>

            <AppModal
                size="md"
                isOpen={isConfirmOpen}
                onClose={() => setConfirmOpen(false)}
                title="Resubmit initial request?"
            >
                <Stack gap="md">
                    <Text>Are you sure you want to resubmit your initial request for review?</Text>
                    <Group justify="flex-end" mt="md">
                        <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={handleConfirmResubmit} loading={isSubmitting}>
                            Yes, submit initial request
                        </Button>
                    </Group>
                </Stack>
            </AppModal>
        </>
    )
}
