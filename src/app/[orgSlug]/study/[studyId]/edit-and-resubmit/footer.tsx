'use client'

import { FC, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button, Group, Stack, Text } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { AppModal } from '@/components/modal'
import { Routes } from '@/lib/routes'
import { hasLexicalContent } from '@/lib/lexical'
import { useEditResubmit } from '@/contexts/edit-resubmit'
import { ReviewerPreview } from '@/app/[orgSlug]/study/[studyId]/proposal/reviewer-preview'
import { hasUserProvidedTitle } from '@/app/[orgSlug]/study/[studyId]/proposal/schema'

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

    const { title, researchQuestions, projectSummary, impact, additionalNotes, datasets, piName } = form.values
    const hasContent =
        hasLexicalContent(researchQuestions, projectSummary, impact, additionalNotes) || datasets.length > 0 || !!piName

    const isFormValid = form.isValid() && noteForm.isValid() && hasUserProvidedTitle(title)

    const handleBack = async () => {
        if (form.isDirty()) {
            const saved = await saveDraft()
            if (!saved) return
        }
        // The only legitimate entry to this page today is the "Edit & resubmit"
        // button on /submitted. If we ever add deep links or a dashboard CTA,
        // disambiguate the Back target with a ?from= query param (see
        // review/page.tsx for prior art).
        router.push(Routes.studySubmitted({ orgSlug, studyId }))
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
                    studyId={studyId}
                    values={form.values}
                    researcherName={researcherName}
                    researcherId={researcherId}
                    enclaveOrgSlug={enclaveOrgSlug}
                />
            </AppModal>

            <AppModal
                size="lg"
                radius={0}
                isOpen={isConfirmOpen}
                onClose={() => setConfirmOpen(false)}
                title="Confirm initial request submission?"
                styles={{
                    header: { padding: 'var(--mantine-spacing-xl)', gap: 'var(--mantine-spacing-xxl)' },
                    close: { height: '28px', width: '28px', minHeight: '28px', minWidth: '28px' },
                }}
            >
                <Stack gap="md">
                    <Text>
                        Please confirm you are ready to submit your initial request. Further edits are not permitted
                        once submitted.
                    </Text>
                    <Group justify="flex-start" mt="md">
                        <Button
                            variant="outline"
                            radius={0}
                            onClick={() => setConfirmOpen(false)}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button variant="primary" radius={0} onClick={handleConfirmResubmit} loading={isSubmitting}>
                            Yes, submit initial request
                        </Button>
                    </Group>
                </Stack>
            </AppModal>
        </>
    )
}
