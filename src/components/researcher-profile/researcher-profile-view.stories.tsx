import type { Story } from '@ladle/react'
import { useState } from 'react'
import { useForm } from '@mantine/form'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import {
    ResearcherProfileLayout,
    PersonalInfoSectionView,
    EducationSectionView,
    PositionsSectionView,
    ResearchDetailsSectionView,
} from './researcher-profile-view'
import type {
    EducationValues,
    PersonalInfoValues,
    PositionsValues,
    ResearchDetailsValues,
} from '@/schema/researcher-profile'

// Page-view for the Researcher Profile screen. The *SectionView components are
// presentational: each receives a Mantine form + display values + handlers from the
// thin section containers (which own useQuery/useMutation/Clerk). Ladle has no
// QueryClient/Clerk, so the stories build their own forms here (useForm works fine in
// Ladle) and pass no-op submit/edit handlers — letting the whole stacked page render.
const meta = { title: 'Pages / Researcher profile', argTypes: pageBackgroundArgTypes }
export default meta

const noop = () => {}

// -----------------------------------------------------------------------------
// Populated profile — every section in read-only display mode.
// -----------------------------------------------------------------------------

const populatedPersonalInfo: PersonalInfoValues = { firstName: 'Ada', lastName: 'Lovelace' }

const populatedEducation: EducationValues = {
    educationalInstitution: 'Rice University',
    degree: 'Doctoral level degree',
    fieldOfStudy: 'Systems and Cognitive Neuroscience',
    isCurrentlyPursuing: false,
}

const populatedPositions: PositionsValues = {
    positions: [
        {
            affiliation: 'University of California, Berkeley',
            position: 'Senior Researcher',
            profileUrl: 'https://berkeley.edu/faculty/lovelace',
        },
        {
            affiliation: 'Mars University',
            position: 'Visiting Scholar',
            profileUrl: '',
        },
    ],
}

const populatedResearchDetails: ResearchDetailsValues = {
    researchInterests: ['Reading comprehension', 'Cognitive development', 'Educational equity'],
    detailedPublicationsUrl: 'https://scholar.google.com/citations?user=lovelace',
    featuredPublicationsUrls: ['https://example.edu/publications/first', 'https://example.edu/publications/second'],
}

function PopulatedProfile() {
    const personalForm = useForm<PersonalInfoValues>({ initialValues: populatedPersonalInfo })
    const educationForm = useForm<EducationValues>({ initialValues: populatedEducation })
    const positionsForm = useForm<PositionsValues>({ initialValues: populatedPositions })
    const researchForm = useForm<ResearchDetailsValues>({ initialValues: populatedResearchDetails })

    return (
        <ResearcherProfileLayout>
            <PersonalInfoSectionView
                form={personalForm}
                firstName={populatedPersonalInfo.firstName}
                lastName={populatedPersonalInfo.lastName}
                email="ada@university.edu"
                isEditing={false}
                isPending={false}
                showEditButton
                onEdit={noop}
                onSubmit={noop}
            />
            <EducationSectionView
                form={educationForm}
                defaults={populatedEducation}
                isEditing={false}
                isPending={false}
                showEditButton
                onEdit={noop}
                onSubmit={noop}
            />
            <PositionsSectionView
                form={positionsForm}
                defaults={populatedPositions}
                editingIndex={null}
                isPending={false}
                hasExistingPositions
                canDelete
                isAdding={false}
                currentEditValid={false}
                readOnly={false}
                onEdit={noop}
                onAdd={noop}
                onCancel={noop}
                onSubmit={noop}
                onDelete={noop}
            />
            <ResearchDetailsSectionView
                form={researchForm}
                defaults={populatedResearchDetails}
                isEditing={false}
                isPending={false}
                interestDraft=""
                showEditButton
                onEdit={noop}
                onInterestDraftChange={noop}
                onAddInterest={noop}
                onRemoveInterest={noop}
                onSubmit={noop}
            />
        </ResearcherProfileLayout>
    )
}

export const Populated: Story = () => <PopulatedProfile />

// -----------------------------------------------------------------------------
// New / empty profile — incomplete sections auto-open in edit mode, the positions
// section starts with a single empty editing row (mirrors the real auto-open).
// -----------------------------------------------------------------------------

const emptyEducation: EducationValues = {
    educationalInstitution: '',
    degree: '',
    fieldOfStudy: '',
    isCurrentlyPursuing: false,
}

const emptyPositions: PositionsValues = {
    positions: [{ affiliation: '', position: '', profileUrl: '' }],
}

const emptyResearchDetails: ResearchDetailsValues = {
    researchInterests: [],
    detailedPublicationsUrl: '',
    featuredPublicationsUrls: ['', ''],
}

function NewProfile() {
    const personalForm = useForm<PersonalInfoValues>({ initialValues: { firstName: '', lastName: '' } })
    const educationForm = useForm<EducationValues>({ initialValues: emptyEducation })
    const positionsForm = useForm<PositionsValues>({ initialValues: emptyPositions })
    const researchForm = useForm<ResearchDetailsValues>({ initialValues: emptyResearchDetails })
    const [interestDraft, setInterestDraft] = useState('')

    return (
        <ResearcherProfileLayout>
            <PersonalInfoSectionView
                form={personalForm}
                firstName=""
                lastName=""
                email="newuser@university.edu"
                isEditing
                isPending={false}
                showEditButton
                onEdit={noop}
                onSubmit={noop}
            />
            <EducationSectionView
                form={educationForm}
                defaults={emptyEducation}
                isEditing
                isPending={false}
                showEditButton
                onEdit={noop}
                onSubmit={noop}
            />
            <PositionsSectionView
                form={positionsForm}
                defaults={emptyPositions}
                editingIndex={0}
                isPending={false}
                hasExistingPositions={false}
                canDelete={false}
                isAdding={false}
                currentEditValid={false}
                readOnly={false}
                onEdit={noop}
                onAdd={noop}
                onCancel={noop}
                onSubmit={noop}
                onDelete={noop}
            />
            <ResearchDetailsSectionView
                form={researchForm}
                defaults={emptyResearchDetails}
                isEditing
                isPending={false}
                interestDraft={interestDraft}
                showEditButton
                onEdit={noop}
                onInterestDraftChange={setInterestDraft}
                onAddInterest={noop}
                onRemoveInterest={noop}
                onSubmit={noop}
            />
        </ResearcherProfileLayout>
    )
}

export const NewEmpty: Story = () => <NewProfile />
