import { CHARACTER_LIMITS, FIELD_TITLES, type ProposalFormValues } from './schema'

export interface EditableTextField {
    label: string
    id: keyof ProposalFormValues
    description: string
    maxCharacters: number
    // Per-field, from the Figma box heights less the toolbar row, which sits inside the box
    // (OTTER-691).
    contentHeight: number
    required?: boolean
}

export const editableTextFields: EditableTextField[] = [
    {
        label: FIELD_TITLES.researchQuestions,
        id: 'researchQuestions',
        maxCharacters: CHARACTER_LIMITS.researchQuestions,
        contentHeight: 205,
        description:
            'Describe the primary research question(s) your study aims to answer. Be as specific as possible to support review and alignment with available data.',
        required: true,
    },
    {
        label: FIELD_TITLES.projectSummary,
        id: 'projectSummary',
        maxCharacters: CHARACTER_LIMITS.projectSummary,
        contentHeight: 505,
        description:
            'Briefly explain your planned study, including the target population, research design, methods, and any interventions or comparisons.',
        required: true,
    },
    {
        label: FIELD_TITLES.impact,
        id: 'impact',
        maxCharacters: CHARACTER_LIMITS.impact,
        contentHeight: 205,
        description:
            'What are the potential outcomes of this study? Describe how your findings could improve learning experiences, teaching practices, educational policy, etc.',
        required: true,
    },
    {
        label: FIELD_TITLES.additionalNotes,
        id: 'additionalNotes',
        maxCharacters: CHARACTER_LIMITS.additionalNotes,
        contentHeight: 105,
        description:
            'Add any other information, constraints, or questions for the Data Partner. This might include timing, special requirements, references, or related work.',
        required: false,
    },
]
