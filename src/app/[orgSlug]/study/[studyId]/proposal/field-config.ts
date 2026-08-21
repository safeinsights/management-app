import { type ProposalFormValues, WORD_LIMITS } from './schema'

export interface EditableTextField {
    label: string
    id: keyof ProposalFormValues
    description: string
    placeholder: string
    maxWords: number
    /**
     * Height of the editable area before any typing or dragging, in px.
     *
     * Figma gives each field its own box height rather than one shared value (OTTER-691). These are
     * the box heights from `403:20575` / `403:20588` / `403:20601` / `403:20614` less the toolbar
     * row, which sits inside the box.
     */
    contentHeight: number
    required?: boolean
}

export const editableTextFields: EditableTextField[] = [
    {
        label: 'Research question(s)',
        id: 'researchQuestions',
        contentHeight: 205,
        maxWords: WORD_LIMITS.researchQuestions,
        description:
            'Describe the primary research question(s) your study aims to answer. Be as specific as possible to support review and alignment with available data.',
        placeholder:
            'Ex. How do textbook highlights correspond to student performance on assessments when the assessment directly is grounded in the highlighted content?',
        required: true,
    },
    {
        label: 'Project summary',
        id: 'projectSummary',
        contentHeight: 505,
        maxWords: WORD_LIMITS.projectSummary,
        description:
            'Briefly explain your planned study, including the target population, research design, methods, and any interventions or comparisons.',
        placeholder:
            'Ex. This secondary research hopes to examine how textbook highlighting relates to student performance using archival data from your online homework system.',
        required: true,
    },
    {
        label: 'Impact',
        id: 'impact',
        contentHeight: 205,
        maxWords: WORD_LIMITS.impact,
        description:
            'What are the potential outcomes of this study? Describe how your findings could improve learning experiences, teaching practices, educational policy, etc.',
        placeholder:
            'Ex. How students encode information during highlighting and what impact it has on subsequent retention has a contentious literature.',
        required: true,
    },
    {
        label: 'Additional notes or requests',
        id: 'additionalNotes',
        contentHeight: 105,
        maxWords: WORD_LIMITS.additionalNotes,
        description:
            'Add any other information, constraints, or questions for the Data Partner. This might include timing, special requirements, references, or related work.',
        placeholder:
            'Ex. This project is based on grants, so we are operating under specific timelines, reporting requirements, and budget constraints.',
        required: false,
    },
]
