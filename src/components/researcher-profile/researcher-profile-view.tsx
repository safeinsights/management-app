'use client'

import type { ReactNode } from 'react'
import {
    Anchor,
    Box,
    Button,
    Checkbox,
    Container,
    Group,
    Paper,
    Pill,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core'
import type { UseFormReturnType } from '@mantine/form'
import { SectionHeader } from '@/components/researcher-profile/section-header'
import { DisplayField } from '@/components/researcher-profile/display-field'
import { ResearchInterestsInput } from '@/components/researcher-profile/research-interests-input'
import { PositionsTable } from '@/components/researcher-profile/positions-table'
import { PositionForm, PositionFormActions } from '@/components/researcher-profile/position-form'
import { FormFieldLabel } from '@/components/form-field-label'
import { InfoTooltip } from '@/components/tooltip'
import { DEGREE_OPTIONS } from '@/lib/degree-options'
import type {
    EducationValues,
    PersonalInfoValues,
    PositionsValues,
    ResearchDetailsValues,
} from '@/schema/researcher-profile'

// Presentational page-view for the Researcher Profile screen. These components render
// from props only — they own no data fetching (useQuery), no mutations (useMutation),
// and no Clerk session. The form instances and submit/edit handlers are injected by the
// thin section containers (personal-info-section, education-section, etc.), which keep
// the data + mutation plumbing. Because everything here is render-safe, the stacked page
// renders in isolation (e.g. Ladle) when a story supplies its own forms and no-op handlers.

// -----------------------------------------------------------------------------
// Page layout chrome
// -----------------------------------------------------------------------------

export function ResearcherProfileLayout({ children }: { children: ReactNode }) {
    return (
        <Container size="lg" py="xl">
            <Stack gap="xl">
                <Title order={1}>Researcher Profile</Title>
                <Text c="dimmed">
                    Create and manage your researcher profile. Adding professional details helps establish your
                    credibility and allows Data Partners to view your published work, credentials, and professional
                    background. Those pursuing a graduate degree will be able to share their background and interests.
                </Text>
                {children}
            </Stack>
        </Container>
    )
}

// -----------------------------------------------------------------------------
// Personal information
// -----------------------------------------------------------------------------

interface PersonalInfoSectionViewProps {
    form: UseFormReturnType<PersonalInfoValues>
    firstName: string
    lastName: string
    email: string
    isEditing: boolean
    isPending: boolean
    showEditButton: boolean
    onEdit: () => void
    onSubmit: (values: PersonalInfoValues) => void
}

function PersonalInfoEditForm({
    form,
    email,
    isPending,
    onSubmit,
}: Pick<PersonalInfoSectionViewProps, 'form' | 'email' | 'isPending' | 'onSubmit'>) {
    return (
        <form onSubmit={form.onSubmit(onSubmit)}>
            <Group grow align="flex-start">
                <div>
                    <FormFieldLabel label="First name" required inputId="firstName" />
                    <TextInput
                        id="firstName"
                        placeholder="Enter your first name"
                        {...form.getInputProps('firstName')}
                    />
                </div>
                <div>
                    <FormFieldLabel label="Last name" required inputId="lastName" />
                    <TextInput id="lastName" placeholder="Enter your last name" {...form.getInputProps('lastName')} />
                </div>
            </Group>

            <Box mt="md">
                <FormFieldLabel label="Email address" required inputId="email" />
                <InfoTooltip label="Email address cannot be edited" withArrow>
                    <TextInput id="email" value={email} placeholder="you@university.edu" disabled />
                </InfoTooltip>
            </Box>

            <Group justify="flex-end" mt="xl">
                <Button type="submit" disabled={!form.isValid() || isPending} loading={isPending}>
                    Save changes
                </Button>
            </Group>
        </form>
    )
}

function PersonalInfoDisplay({ firstName, lastName, email }: { firstName: string; lastName: string; email: string }) {
    return (
        <Stack gap="md">
            <Group grow>
                <DisplayField label="First name">
                    <Text>{firstName}</Text>
                </DisplayField>
                <DisplayField label="Last name">
                    <Text>{lastName}</Text>
                </DisplayField>
            </Group>
            <DisplayField label="Email address">
                <Text>{email}</Text>
            </DisplayField>
        </Stack>
    )
}

export function PersonalInfoSectionView({
    form,
    firstName,
    lastName,
    email,
    isEditing,
    isPending,
    showEditButton,
    onEdit,
    onSubmit,
}: PersonalInfoSectionViewProps) {
    return (
        <Paper p="xl" radius="sm">
            <SectionHeader
                title="Personal information"
                isEditing={isEditing}
                onEdit={onEdit}
                showEditButton={showEditButton}
            />

            {isEditing ? (
                <PersonalInfoEditForm form={form} email={email} isPending={isPending} onSubmit={onSubmit} />
            ) : (
                <PersonalInfoDisplay firstName={firstName} lastName={lastName} email={email} />
            )}
        </Paper>
    )
}

// -----------------------------------------------------------------------------
// Highest level of education
// -----------------------------------------------------------------------------

interface EducationSectionViewProps {
    form: UseFormReturnType<EducationValues>
    defaults: EducationValues
    isEditing: boolean
    isPending: boolean
    showEditButton: boolean
    onEdit: () => void
    onSubmit: (values: EducationValues) => void
}

function EducationEditForm({
    form,
    isPending,
    onSubmit,
}: Pick<EducationSectionViewProps, 'form' | 'isPending' | 'onSubmit'>) {
    return (
        <form onSubmit={form.onSubmit(onSubmit)}>
            <Stack gap="md">
                <div>
                    <FormFieldLabel label="Educational institution" required inputId="educationalInstitution" />
                    <TextInput
                        id="educationalInstitution"
                        placeholder="Ex: Rice University"
                        {...form.getInputProps('educationalInstitution')}
                    />
                </div>

                <Group grow align="flex-start">
                    <div>
                        <FormFieldLabel label="Degree" required inputId="degree" />
                        <Select
                            id="degree"
                            searchable
                            placeholder="Select your degree"
                            data={DEGREE_OPTIONS}
                            {...form.getInputProps('degree')}
                        />
                    </div>
                    <div>
                        <FormFieldLabel label="Field of study" required inputId="fieldOfStudy" />
                        <TextInput
                            id="fieldOfStudy"
                            placeholder="Ex: Systems and Cognitive Neuroscience"
                            {...form.getInputProps('fieldOfStudy')}
                        />
                    </div>
                </Group>

                <Checkbox
                    label="I am currently pursuing this degree and have not yet graduated."
                    {...form.getInputProps('isCurrentlyPursuing', { type: 'checkbox' })}
                />

                <Group justify="flex-end" mt="xl">
                    <Button type="submit" disabled={!form.isValid() || isPending} loading={isPending}>
                        Save changes
                    </Button>
                </Group>
            </Stack>
        </form>
    )
}

function EducationDisplay({ defaults }: { defaults: EducationValues }) {
    const degreeLabel = defaults.isCurrentlyPursuing ? 'Degree (currently pursuing)' : 'Degree'

    return (
        <Stack gap="md">
            <DisplayField label="Educational institution">
                <Text>{defaults.educationalInstitution}</Text>
            </DisplayField>
            <Group grow>
                <DisplayField label={degreeLabel}>
                    <Text>{defaults.degree}</Text>
                </DisplayField>
                <DisplayField label="Field of study">
                    <Text>{defaults.fieldOfStudy}</Text>
                </DisplayField>
            </Group>
        </Stack>
    )
}

export function EducationSectionView({
    form,
    defaults,
    isEditing,
    isPending,
    showEditButton,
    onEdit,
    onSubmit,
}: EducationSectionViewProps) {
    return (
        <Paper p="xl" radius="sm">
            <SectionHeader
                title="Highest level of education"
                isEditing={isEditing}
                onEdit={onEdit}
                showEditButton={showEditButton}
            />

            {isEditing ? (
                <EducationEditForm form={form} isPending={isPending} onSubmit={onSubmit} />
            ) : (
                <EducationDisplay defaults={defaults} />
            )}
        </Paper>
    )
}

// -----------------------------------------------------------------------------
// Current institutional information (positions)
// -----------------------------------------------------------------------------

interface PositionsSectionViewProps {
    form: UseFormReturnType<PositionsValues>
    defaults: PositionsValues
    editingIndex: number | null
    isPending: boolean
    hasExistingPositions: boolean
    canDelete: boolean
    isAdding: boolean
    currentEditValid: boolean
    readOnly: boolean
    onEdit: (index: number) => void
    onAdd: () => void
    onCancel: () => void
    onSubmit: () => void
    onDelete: (index: number) => void
}

export function PositionsSectionView({
    form,
    defaults,
    editingIndex,
    isPending,
    hasExistingPositions,
    canDelete,
    isAdding,
    currentEditValid,
    readOnly,
    onEdit,
    onAdd,
    onCancel,
    onSubmit,
    onDelete,
}: PositionsSectionViewProps) {
    const isFormVisible = !readOnly && editingIndex !== null
    const actionsDisabled = editingIndex !== null

    const formFields = (
        <PositionForm
            isVisible={isFormVisible}
            editingIndex={editingIndex ?? 0}
            form={form}
            isAdding={isAdding}
            hasExistingPositions={hasExistingPositions}
            onSubmit={onSubmit}
        />
    )

    return (
        <Paper p="xl" radius="sm">
            <SectionHeader
                title="Current institutional information"
                isEditing={false}
                onEdit={() => {}}
                showEditButton={false}
            />

            <PositionsTable
                isVisible={hasExistingPositions}
                positions={defaults.positions}
                editingIndex={editingIndex}
                form={form}
                canDelete={canDelete}
                actionsDisabled={actionsDisabled}
                readOnly={readOnly}
                formSlot={formFields}
                onEdit={onEdit}
                onDelete={onDelete}
                onAdd={onAdd}
            />

            {/* Shown only when no positions exist; otherwise the form renders inside PositionsTable */}
            <PositionForm
                isVisible={!hasExistingPositions && isFormVisible}
                editingIndex={editingIndex ?? 0}
                form={form}
                isAdding={isAdding}
                hasExistingPositions={hasExistingPositions}
                onSubmit={onSubmit}
            />

            <PositionFormActions
                isVisible={isFormVisible}
                hasExistingPositions={hasExistingPositions}
                currentEditValid={currentEditValid}
                isPending={isPending}
                onCancel={onCancel}
            />
        </Paper>
    )
}

// -----------------------------------------------------------------------------
// Research details
// -----------------------------------------------------------------------------

interface ResearchDetailsSectionViewProps {
    form: UseFormReturnType<ResearchDetailsValues>
    defaults: ResearchDetailsValues
    isEditing: boolean
    isPending: boolean
    interestDraft: string
    showEditButton: boolean
    onEdit: () => void
    onInterestDraftChange: (value: string) => void
    onAddInterest: () => void
    onRemoveInterest: (index: number) => void
    onSubmit: () => void
}

type ResearchDetailsEditFormProps = Pick<
    ResearchDetailsSectionViewProps,
    'form' | 'interestDraft' | 'isPending' | 'onInterestDraftChange' | 'onAddInterest' | 'onRemoveInterest' | 'onSubmit'
>

function ResearchDetailsEditForm({
    form,
    interestDraft,
    isPending,
    onInterestDraftChange,
    onAddInterest,
    onRemoveInterest,
    onSubmit,
}: ResearchDetailsEditFormProps) {
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault()
                onSubmit()
            }}
        >
            <Stack gap="md">
                <div>
                    <FormFieldLabel label="Research interests" required inputId="researchInterests" />
                    <ResearchInterestsInput
                        form={form}
                        draftValue={interestDraft}
                        onDraftChange={onInterestDraftChange}
                        onAdd={onAddInterest}
                        onRemove={onRemoveInterest}
                    />
                </div>

                <div>
                    <FormFieldLabel label="Detailed publications URL" required inputId="detailedPublicationsUrl" />
                    <Text size="sm" mb={6}>
                        Provide a digital link where your complete and most recent publications are listed (e.g., Google
                        Scholar, LinkedIn, personal website, or resume).
                    </Text>
                    <TextInput
                        id="detailedPublicationsUrl"
                        placeholder="https://scholar.google.com/user..."
                        {...form.getInputProps('detailedPublicationsUrl')}
                    />
                </div>

                <div>
                    <FormFieldLabel label="Featured publications URLs" inputId="featured0" />
                    <Text size="sm" mb={6}>
                        Share the URL for two of your most relevant publications, if available. If you do not have any
                        publications yet, please share publications from your current research lab that closely
                        represent the work you want to do.
                    </Text>
                    <Stack gap="sm">
                        <TextInput
                            id="featured0"
                            placeholder="https://first-publication-link"
                            {...form.getInputProps('featuredPublicationsUrls.0')}
                        />
                        <TextInput
                            id="featured1"
                            placeholder="https://second-publication-link"
                            {...form.getInputProps('featuredPublicationsUrls.1')}
                        />
                    </Stack>
                </div>

                <Group justify="flex-end" mt="xl">
                    <Button type="submit" disabled={isPending} loading={isPending}>
                        Save changes
                    </Button>
                </Group>
            </Stack>
        </form>
    )
}

function ResearchDetailsDisplay({ defaults }: { defaults: ResearchDetailsValues }) {
    const interestPills = (defaults.researchInterests || []).map((item, idx) => (
        <Pill key={`${item}-${idx}`}>{item}</Pill>
    ))

    const featuredUrls = (defaults.featuredPublicationsUrls || []).filter((u) => u)
    const hasFeaturedUrls = featuredUrls.length > 0
    const featuredLinks = featuredUrls.map((u, idx) => (
        <Anchor key={idx} href={u} target="_blank">
            {u}
        </Anchor>
    ))

    return (
        <Stack gap="md">
            <DisplayField label="Research interests">
                <Group gap="xs" mt={6}>
                    {interestPills}
                </Group>
            </DisplayField>
            <DisplayField label="Detailed publications URL">
                <Anchor href={defaults.detailedPublicationsUrl} target="_blank">
                    {defaults.detailedPublicationsUrl}
                </Anchor>
            </DisplayField>
            {hasFeaturedUrls && (
                <DisplayField label="Featured publications URLs">
                    <Stack gap={4} mt={4}>
                        {featuredLinks}
                    </Stack>
                </DisplayField>
            )}
        </Stack>
    )
}

export function ResearchDetailsSectionView({
    form,
    defaults,
    isEditing,
    isPending,
    interestDraft,
    showEditButton,
    onEdit,
    onInterestDraftChange,
    onAddInterest,
    onRemoveInterest,
    onSubmit,
}: ResearchDetailsSectionViewProps) {
    return (
        <Paper p="xl" radius="sm">
            <SectionHeader
                title="Research details"
                isEditing={isEditing}
                onEdit={onEdit}
                showEditButton={showEditButton}
            />

            {isEditing ? (
                <ResearchDetailsEditForm
                    form={form}
                    interestDraft={interestDraft}
                    isPending={isPending}
                    onInterestDraftChange={onInterestDraftChange}
                    onAddInterest={onAddInterest}
                    onRemoveInterest={onRemoveInterest}
                    onSubmit={onSubmit}
                />
            ) : (
                <ResearchDetailsDisplay defaults={defaults} />
            )}
        </Paper>
    )
}
