'use client'

import { useEffect } from 'react'
import { useForm } from '@mantine/form'
import { zodResolver } from '@/common'
import { studyProposalFormSchema, type StudyProposalFormValues } from '@/app/[orgSlug]/study/request/form-schemas'
import type { Language } from '@/database/types'

export interface DraftData {
    title?: string | null
    piName?: string | null
    language?: Language | null
    orgSlug?: string | null
    descriptionDocPath?: string | null
    irbDocPath?: string | null
    agreementDocPath?: string | null
}

export interface ExistingFiles {
    descriptionDocPath?: string | null
    irbDocPath?: string | null
    agreementDocPath?: string | null
}

const initialFormValues: StudyProposalFormValues = {
    title: '',
    piName: '',
    irbDocument: null,
    descriptionDocument: null,
    agreementDocument: null,
    mainCodeFile: null,
    additionalCodeFiles: [],
    orgSlug: '',
    language: null,
    stepIndex: 0,
    createdStudyId: null,
    ideMainFile: '',
    ideFiles: [],
}

export function useProposalForm(draftData?: DraftData | null) {
    const form = useForm<StudyProposalFormValues>({
        mode: 'uncontrolled',
        validate: zodResolver(studyProposalFormSchema),
        initialValues: initialFormValues,
        validateInputOnChange: [
            'title',
            'orgSlug',
            'language',
            'piName',
            'descriptionDocument',
            'irbDocument',
            'agreementDocument',
        ],
    })

    useEffect(() => {
        if (draftData) {
            form.setValues({
                title: draftData.title || '',
                piName: draftData.piName || '',
                language: draftData.language || null,
                orgSlug: draftData.orgSlug || '',
                irbDocument: null,
                descriptionDocument: null,
                agreementDocument: null,
            })
            form.resetDirty()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draftData?.title, draftData?.piName, draftData?.language, draftData?.orgSlug])

    const existingFiles: ExistingFiles | undefined = draftData
        ? {
              descriptionDocPath: draftData.descriptionDocPath,
              irbDocPath: draftData.irbDocPath,
              agreementDocPath: draftData.agreementDocPath,
          }
        : undefined

    return { form, existingFiles }
}

export function isProposalFormValid(formValues: StudyProposalFormValues, existingFiles?: ExistingFiles): boolean {
    const hasDescription = !!formValues.descriptionDocument || !!existingFiles?.descriptionDocPath
    const hasIrb = !!formValues.irbDocument || !!existingFiles?.irbDocPath
    const hasAgreement = !!formValues.agreementDocument || !!existingFiles?.agreementDocPath

    return (
        !!formValues.orgSlug &&
        !!formValues.language &&
        !!formValues.title &&
        formValues.title.length >= 5 &&
        hasDescription &&
        hasIrb &&
        hasAgreement
    )
}
