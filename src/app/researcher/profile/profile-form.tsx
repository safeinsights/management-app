'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useForm, zodResolver } from '@/common'
import {
    Container,
    Group,
    Stack,
    Text,
    Title,
    Paper,
    TextInput,
    Button,
    Select,
    Checkbox,
    Divider,
    Table,
    Anchor,
    ActionIcon,
    Box,
    PillsInput,
    Pill,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
    getResearcherProfileAction,
    updatePersonalInfoAction,
    updateEducationAction,
    updateCurrentPositionsAction,
    updateResearchDetailsAction,
} from '@/server/actions/researcher-profile.actions'
import {
    currentPositionSchema,
    educationSchema,
    personalInfoSchema,
    researchDetailsSchema,
    type CurrentPositionValues,
    type EducationValues,
    type PersonalInfoValues,
    type ResearchDetailsValues,
} from '@/schema/researcher-profile'
import { FormFieldLabel } from '@/components/form-field-label'
import { DEGREE_OPTIONS } from '@/lib/degree-options'
import { PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react/dist/ssr'

// UI implementation will be built iteratively; this is the initial scaffold.
export function ResearcherProfileClientPage() {
    const [isEditingPersonal, setIsEditingPersonal] = useState(true)
    const [isEditingEducation, setIsEditingEducation] = useState(true)
    const [editingPositionIndex, setEditingPositionIndex] = useState<number | null>(null)
    const [isAddingPosition, setIsAddingPosition] = useState(false)
    const [isEditingResearchDetails, setIsEditingResearchDetails] = useState(true)

    const profileQuery = useQuery({
        queryKey: ['researcher-profile'],
        queryFn: async () => getResearcherProfileAction(),
    })

    const data = profileQuery.data && 'error' in profileQuery.data ? null : profileQuery.data

    const personalDefaults: PersonalInfoValues = useMemo(
        () => ({
            firstName: data?.user.firstName ?? '',
            lastName: data?.user.lastName ?? '',
        }),
        [data?.user.firstName, data?.user.lastName],
    )

    const personalForm = useForm<PersonalInfoValues>({
        mode: 'controlled',
        initialValues: personalDefaults,
        validate: zodResolver(personalInfoSchema),
        validateInputOnBlur: true,
    })

    useEffect(() => {
        personalForm.setValues(personalDefaults)
        personalForm.resetDirty(personalDefaults)
        // Default to view mode once section is complete
        const complete = Boolean(personalDefaults.firstName) && Boolean(personalDefaults.lastName)
        setIsEditingPersonal(!complete)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- tie to computed defaults
    }, [personalDefaults.firstName, personalDefaults.lastName])

    const educationDefaults: EducationValues = useMemo(
        () => ({
            educationalInstitution: data?.profile.educationInstitution ?? '',
            degree: data?.profile.educationDegree ?? '',
            fieldOfStudy: data?.profile.educationFieldOfStudy ?? '',
            isCurrentlyPursuing: Boolean(data?.profile.educationIsCurrentlyPursuing ?? false),
        }),
        [
            data?.profile.educationInstitution,
            data?.profile.educationDegree,
            data?.profile.educationFieldOfStudy,
            data?.profile.educationIsCurrentlyPursuing,
        ],
    )

    const educationForm = useForm<EducationValues>({
        mode: 'controlled',
        initialValues: educationDefaults,
        validate: zodResolver(educationSchema),
        validateInputOnBlur: true,
    })

    useEffect(() => {
        educationForm.setValues(educationDefaults)
        educationForm.resetDirty(educationDefaults)
        // Default to view mode once section is complete
        const complete =
            Boolean(educationDefaults.educationalInstitution) &&
            Boolean(educationDefaults.degree) &&
            Boolean(educationDefaults.fieldOfStudy)
        setIsEditingEducation(!complete)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- tie to computed defaults
    }, [educationDefaults.educationalInstitution, educationDefaults.degree, educationDefaults.fieldOfStudy])

    const currentPositions: CurrentPositionValues[] = useMemo(() => {
        const raw = (data?.profile.currentPositions ?? []) as unknown
        if (Array.isArray(raw)) {
            return raw
                .map((p) => {
                    const obj = p as Record<string, unknown>
                    return {
                        affiliation: String(obj.affiliation ?? ''),
                        position: String(obj.position ?? ''),
                        profileUrl: (obj.profileUrl ? String(obj.profileUrl) : undefined) as string | undefined,
                    }
                })
                .filter((p) => p.affiliation || p.position || p.profileUrl)
        }
        return []
    }, [data?.profile.currentPositions])

    const positionForm = useForm<CurrentPositionValues>({
        mode: 'controlled',
        initialValues: { affiliation: '', position: '', profileUrl: '' },
        validate: zodResolver(currentPositionSchema),
        validateInputOnBlur: true,
    })

    const researchDefaults: ResearchDetailsValues = useMemo(
        () => ({
            researchInterests: (data?.profile.researchInterests ?? []) as string[],
            detailedPublicationsUrl: data?.profile.detailedPublicationsUrl ?? '',
            featuredPublicationsUrls: ((data?.profile.featuredPublicationsUrls ?? []) as string[]).slice(0, 2),
        }),
        [
            data?.profile.researchInterests,
            data?.profile.detailedPublicationsUrl,
            data?.profile.featuredPublicationsUrls,
        ],
    )

    const researchForm = useForm<ResearchDetailsValues>({
        mode: 'controlled',
        initialValues: researchDefaults,
        validate: zodResolver(researchDetailsSchema),
        validateInputOnBlur: true,
    })

    const [researchInterestDraft, setResearchInterestDraft] = useState('')

    useEffect(() => {
        researchForm.setValues(researchDefaults)
        researchForm.resetDirty(researchDefaults)
        const complete =
            Boolean(researchDefaults.researchInterests?.length) && Boolean(researchDefaults.detailedPublicationsUrl)
        setIsEditingResearchDetails(!complete)
        setResearchInterestDraft('')
        // eslint-disable-next-line react-hooks/exhaustive-deps -- tie to computed defaults
    }, [researchDefaults.detailedPublicationsUrl, (researchDefaults.researchInterests || []).join('|')])

    // Ensure initial disabled state is correct (Save buttons disabled until valid)
    useEffect(() => {
        personalForm.validate()
        educationForm.validate()
        researchForm.validate()
        // positions form is only visible when editing/adding
        // eslint-disable-next-line react-hooks/exhaustive-deps -- run once
    }, [])

    const savePersonal = useMutation({
        mutationFn: async (values: PersonalInfoValues) => updatePersonalInfoAction(values),
        onSuccess: async (res) => {
            if (res && 'error' in res) {
                notifications.show({ title: 'Save failed', message: String(res.error), color: 'red' })
                return
            }
            await profileQuery.refetch()
            setIsEditingPersonal(false)
            notifications.show({ title: 'Saved', message: 'Personal information updated', color: 'green' })
        },
    })

    const saveEducation = useMutation({
        mutationFn: async (values: EducationValues) => updateEducationAction(values),
        onSuccess: async (res) => {
            if (res && 'error' in res) {
                notifications.show({ title: 'Save failed', message: String(res.error), color: 'red' })
                return
            }
            await profileQuery.refetch()
            setIsEditingEducation(false)
            notifications.show({ title: 'Saved', message: 'Education updated', color: 'green' })
        },
    })

    const savePositions = useMutation({
        mutationFn: async (positions: CurrentPositionValues[]) => updateCurrentPositionsAction({ positions }),
        onSuccess: async (res) => {
            if (res && 'error' in res) {
                notifications.show({ title: 'Save failed', message: String(res.error), color: 'red' })
                return
            }
            await profileQuery.refetch()
            setEditingPositionIndex(null)
            setIsAddingPosition(false)
            notifications.show({ title: 'Saved', message: 'Current institutional information updated', color: 'green' })
        },
    })

    const saveResearchDetails = useMutation({
        mutationFn: async (values: ResearchDetailsValues) => updateResearchDetailsAction(values),
        onSuccess: async (res) => {
            if (res && 'error' in res) {
                notifications.show({ title: 'Save failed', message: String(res.error), color: 'red' })
                return
            }
            await profileQuery.refetch()
            setIsEditingResearchDetails(false)
            notifications.show({ title: 'Saved', message: 'Research details updated', color: 'green' })
        },
    })

    const openEditPosition = (index: number) => {
        setEditingPositionIndex(index)
        setIsAddingPosition(false)
        const pos = currentPositions[index]
        positionForm.setValues({
            affiliation: pos?.affiliation ?? '',
            position: pos?.position ?? '',
            profileUrl: pos?.profileUrl ?? '',
        })
        positionForm.resetDirty()
    }

    const openAddPosition = () => {
        setIsAddingPosition(true)
        setEditingPositionIndex(null)
        positionForm.setValues({ affiliation: '', position: '', profileUrl: '' })
        positionForm.resetDirty()
        positionForm.validate()
    }

    const cancelEditPosition = () => {
        // If there are no positions on file, we keep the add panel open (matches “default state” behavior).
        if (currentPositions.length === 0) {
            openAddPosition()
            return
        }
        setEditingPositionIndex(null)
        setIsAddingPosition(false)
        positionForm.reset()
    }

    const addResearchInterest = () => {
        const v = researchInterestDraft.trim()
        if (!v) return

        const existing = researchForm.values.researchInterests || []
        if (existing.length >= 5) return
        if (existing.some((x) => x.toLowerCase() === v.toLowerCase())) {
            setResearchInterestDraft('')
            return
        }

        researchForm.setFieldValue('researchInterests', [...existing, v])
        // Validate immediately so Save button state updates
        researchForm.validateField('researchInterests')
        setResearchInterestDraft('')
    }

    const removeResearchInterest = (idx: number) => {
        const next = [...(researchForm.values.researchInterests || [])]
        next.splice(idx, 1)
        researchForm.setFieldValue('researchInterests', next)
        researchForm.validateField('researchInterests')
    }

    return (
        <Container size="lg" py="xl">
            <Stack gap="sm">
                <Title order={1}>Researcher Profile</Title>
                <Text c="dimmed">
                    Create and manage your researcher profile. Adding professional details helps establish your
                    credibility and allows Data Organizations to view your published work, credentials, and professional
                    background. Those pursuing a graduate degree will be able to share their background and interests.
                </Text>

                {/* Personal information (first section) */}
                <Paper p="xl" radius="sm">
                    <Group justify="space-between" align="center" mb="md">
                        <Title order={3}>Personal information</Title>
                        {!isEditingPersonal && (
                            <Button variant="subtle" onClick={() => setIsEditingPersonal(true)}>
                                Edit
                            </Button>
                        )}
                    </Group>

                    {isEditingPersonal ? (
                        <form
                            onSubmit={personalForm.onSubmit((values) => {
                                savePersonal.mutate(values)
                            })}
                        >
                            <Group grow align="flex-start">
                                <div>
                                    <FormFieldLabel label="First name" required inputId="firstName" />
                                    <TextInput
                                        id="firstName"
                                        placeholder="Enter your first name"
                                        {...personalForm.getInputProps('firstName')}
                                    />
                                </div>
                                <div>
                                    <FormFieldLabel label="Last name" required inputId="lastName" />
                                    <TextInput
                                        id="lastName"
                                        placeholder="Enter your last name"
                                        {...personalForm.getInputProps('lastName')}
                                    />
                                </div>
                            </Group>

                            <div style={{ marginTop: 16 }}>
                                <FormFieldLabel label="Email address" required inputId="email" />
                                <TextInput
                                    id="email"
                                    value={data?.user.email ?? ''}
                                    placeholder="you@university.edu"
                                    disabled
                                />
                            </div>

                            <Group justify="flex-end" mt="xl">
                                <Button
                                    type="submit"
                                    disabled={!personalForm.isValid() || savePersonal.isPending}
                                    loading={savePersonal.isPending}
                                >
                                    Save changes
                                </Button>
                            </Group>
                        </form>
                    ) : (
                        <Stack gap="sm">
                            <Group grow>
                                <div>
                                    <Text fw={600} size="sm">
                                        First name
                                    </Text>
                                    <Text>{data?.user.firstName || ''}</Text>
                                </div>
                                <div>
                                    <Text fw={600} size="sm">
                                        Last name
                                    </Text>
                                    <Text>{data?.user.lastName || ''}</Text>
                                </div>
                            </Group>
                            <div>
                                <Text fw={600} size="sm">
                                    Email address
                                </Text>
                                <Text>{data?.user.email || ''}</Text>
                            </div>
                        </Stack>
                    )}
                </Paper>

                <Divider my="sm" />

                {/* Highest level of education */}
                <Paper p="xl" radius="sm">
                    <Group justify="space-between" align="center" mb="md">
                        <Title order={3}>Highest level of education</Title>
                        {!isEditingEducation && (
                            <Button variant="subtle" onClick={() => setIsEditingEducation(true)}>
                                Edit
                            </Button>
                        )}
                    </Group>

                    {isEditingEducation ? (
                        <form
                            onSubmit={educationForm.onSubmit((values) => {
                                saveEducation.mutate(values)
                            })}
                        >
                            <Stack gap="md">
                                <div>
                                    <FormFieldLabel
                                        label="Educational institution"
                                        required
                                        inputId="educationalInstitution"
                                    />
                                    <TextInput
                                        id="educationalInstitution"
                                        placeholder="Ex: Rice University"
                                        {...educationForm.getInputProps('educationalInstitution')}
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
                                            {...educationForm.getInputProps('degree')}
                                        />
                                    </div>
                                    <div>
                                        <FormFieldLabel label="Field of study" required inputId="fieldOfStudy" />
                                        <TextInput
                                            id="fieldOfStudy"
                                            placeholder="Ex: Systems and Cognitive Neuroscience"
                                            {...educationForm.getInputProps('fieldOfStudy')}
                                        />
                                    </div>
                                </Group>

                                <Checkbox
                                    label="I am currently pursuing this degree and have not yet graduated."
                                    {...educationForm.getInputProps('isCurrentlyPursuing', { type: 'checkbox' })}
                                />

                                <Group justify="flex-end" mt="xl">
                                    <Button
                                        type="submit"
                                        disabled={!educationForm.isValid() || saveEducation.isPending}
                                        loading={saveEducation.isPending}
                                    >
                                        Save changes
                                    </Button>
                                </Group>
                            </Stack>
                        </form>
                    ) : (
                        <Stack gap="sm">
                            <div>
                                <Text fw={600} size="sm">
                                    Educational institution
                                </Text>
                                <Text>{educationDefaults.educationalInstitution}</Text>
                            </div>
                            <Group grow>
                                <div>
                                    <Text fw={600} size="sm">
                                        {educationDefaults.isCurrentlyPursuing
                                            ? 'Degree (currently pursuing)'
                                            : 'Degree'}
                                    </Text>
                                    <Text>{educationDefaults.degree}</Text>
                                </div>
                                <div>
                                    <Text fw={600} size="sm">
                                        Field of study
                                    </Text>
                                    <Text>{educationDefaults.fieldOfStudy}</Text>
                                </div>
                            </Group>
                        </Stack>
                    )}
                </Paper>

                <Divider my="sm" />

                {/* Current institutional information */}
                <Paper p="xl" radius="sm">
                    <Group justify="space-between" align="center" mb="md">
                        <Title order={3}>Current institutional information</Title>
                        {/* This section is view-first. Editing is row-level (pencil icon). */}
                    </Group>

                    {currentPositions.length > 0 && (
                        <>
                            <Table withTableBorder withColumnBorders>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Institutional affiliation</Table.Th>
                                        <Table.Th>Position</Table.Th>
                                        <Table.Th>Profile page</Table.Th>
                                        <Table.Th w={80} ta="center">
                                            Edit
                                        </Table.Th>
                                        {currentPositions.length >= 2 && (
                                            <Table.Th w={80} ta="center">
                                                Delete
                                            </Table.Th>
                                        )}
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {currentPositions.map((pos, idx) => (
                                        <Table.Tr key={idx}>
                                            <Table.Td>{pos.affiliation}</Table.Td>
                                            <Table.Td>{pos.position}</Table.Td>
                                            <Table.Td>
                                                {pos.profileUrl ? (
                                                    <Anchor href={pos.profileUrl} target="_blank">
                                                        {pos.profileUrl}
                                                    </Anchor>
                                                ) : null}
                                            </Table.Td>
                                            <Table.Td ta="center">
                                                <ActionIcon
                                                    variant="subtle"
                                                    onClick={() => openEditPosition(idx)}
                                                    aria-label="Edit current position"
                                                >
                                                    <PencilSimpleIcon />
                                                </ActionIcon>
                                            </Table.Td>
                                            {currentPositions.length >= 2 && (
                                                <Table.Td ta="center">
                                                    <ActionIcon
                                                        variant="subtle"
                                                        color="red"
                                                        disabled={currentPositions.length < 2}
                                                        onClick={() => {
                                                            if (currentPositions.length < 2) return
                                                            const next = currentPositions.filter((_, i) => i !== idx)
                                                            savePositions.mutate(next)
                                                        }}
                                                        aria-label="Delete current position"
                                                    >
                                                        <TrashIcon />
                                                    </ActionIcon>
                                                </Table.Td>
                                            )}
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>

                            <Box mt="md">
                                <Anchor component="button" onClick={openAddPosition}>
                                    + Add another current position
                                </Anchor>
                            </Box>
                        </>
                    )}

                    {(editingPositionIndex !== null || isAddingPosition || currentPositions.length === 0) && (
                        <Box mt={currentPositions.length > 0 ? 'lg' : undefined}>
                            {currentPositions.length > 0 && <Divider my="md" />}
                            <Title order={5} mb="sm">
                                {isAddingPosition || currentPositions.length === 0
                                    ? 'Add current position'
                                    : 'Edit current position'}
                            </Title>

                            <form
                                onSubmit={positionForm.onSubmit((values) => {
                                    const cleaned: CurrentPositionValues = {
                                        affiliation: values.affiliation,
                                        position: values.position,
                                        profileUrl: values.profileUrl?.trim() ? values.profileUrl.trim() : undefined,
                                    }
                                    const next = [...currentPositions]
                                    if (isAddingPosition) {
                                        next.push(cleaned)
                                    } else if (editingPositionIndex !== null) {
                                        next[editingPositionIndex] = cleaned
                                    }
                                    savePositions.mutate(next)
                                })}
                            >
                                <Stack gap="md">
                                    <div>
                                        <FormFieldLabel
                                            label="Institutional or organization affiliation"
                                            required
                                            inputId="affiliation"
                                        />
                                        <Text size="sm" mb={6}>
                                            State your current institutional or organizational affiliation. If you are a
                                            student, please specify your current educational institution.
                                        </Text>
                                        <TextInput
                                            id="affiliation"
                                            placeholder="Ex: University of California, Berkeley"
                                            {...positionForm.getInputProps('affiliation')}
                                        />
                                    </div>
                                    <div>
                                        <FormFieldLabel label="Position" required inputId="position" />
                                        <Text size="sm" mb={6}>
                                            Your current position at this organization or institution.
                                        </Text>
                                        <TextInput
                                            id="position"
                                            placeholder="Ex: Senior Researcher"
                                            {...positionForm.getInputProps('position')}
                                        />
                                    </div>
                                    <div>
                                        <FormFieldLabel label="Link to your profile page" inputId="profileUrl" />
                                        <Text size="sm" mb={6}>
                                            Add a link to your personal institutional or organization&apos;s profile
                                            page, if available.
                                        </Text>
                                        <TextInput
                                            id="profileUrl"
                                            placeholder="https://university.edu/student/yourname"
                                            {...positionForm.getInputProps('profileUrl')}
                                        />
                                    </div>

                                    <Group justify="flex-end" mt="sm">
                                        <Button variant="default" onClick={cancelEditPosition}>
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            disabled={!positionForm.isValid() || savePositions.isPending}
                                            loading={savePositions.isPending}
                                        >
                                            Save changes
                                        </Button>
                                    </Group>
                                </Stack>
                            </form>
                        </Box>
                    )}
                </Paper>

                <Divider my="sm" />

                {/* Research details */}
                <Paper p="xl" radius="sm">
                    <Group justify="space-between" align="center" mb="md">
                        <Title order={3}>Research details</Title>
                        {!isEditingResearchDetails && (
                            <Button variant="subtle" onClick={() => setIsEditingResearchDetails(true)}>
                                Edit
                            </Button>
                        )}
                    </Group>

                    {isEditingResearchDetails ? (
                        <form
                            onSubmit={researchForm.onSubmit((values) => {
                                // Normalize featured URLs: drop empty strings
                                const featured = (values.featuredPublicationsUrls || [])
                                    .filter((v) => v && v.trim())
                                    .slice(0, 2)
                                saveResearchDetails.mutate({
                                    ...values,
                                    featuredPublicationsUrls: featured,
                                })
                            })}
                        >
                            <Stack gap="md">
                                <div>
                                    <FormFieldLabel label="Research interests" required inputId="researchInterests" />
                                    <PillsInput
                                        id="researchInterests"
                                        error={researchForm.errors.researchInterests as unknown as string}
                                    >
                                        <Pill.Group>
                                            {(researchForm.values.researchInterests || []).map((item, idx) => (
                                                <Pill
                                                    key={`${item}-${idx}`}
                                                    withRemoveButton
                                                    onRemove={() => removeResearchInterest(idx)}
                                                >
                                                    {item}
                                                </Pill>
                                            ))}
                                            <PillsInput.Field
                                                placeholder="Type a research interest and press enter"
                                                value={researchInterestDraft}
                                                onChange={(e) => setResearchInterestDraft(e.currentTarget.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault()
                                                        addResearchInterest()
                                                    }
                                                }}
                                                disabled={(researchForm.values.researchInterests || []).length >= 5}
                                            />
                                        </Pill.Group>
                                    </PillsInput>
                                    <Text size="sm" mt={4}>
                                        Include up to five area(s) of research interest.
                                    </Text>
                                </div>

                                <div>
                                    <FormFieldLabel
                                        label="Detailed publications URL"
                                        required
                                        inputId="detailedPublicationsUrl"
                                    />
                                    <Text size="sm" mb={6}>
                                        Provide a digital link where your complete and most recent publications are
                                        listed (e.g., Google Scholar, LinkedIn, personal website, or resume).
                                    </Text>
                                    <TextInput
                                        id="detailedPublicationsUrl"
                                        placeholder="https://scholar.google.com/user..."
                                        {...researchForm.getInputProps('detailedPublicationsUrl')}
                                    />
                                </div>

                                <div>
                                    <FormFieldLabel label="Featured publications URLs" inputId="featured0" />
                                    <Text size="sm" mb={6}>
                                        Share the URL for two of your most relevant publications, if available. If you
                                        do not have any publications yet, please share publications from your current
                                        research lab that closely represent the work you want to do.
                                    </Text>
                                    <Stack gap="sm">
                                        <TextInput
                                            id="featured0"
                                            placeholder="https://first-publication-link"
                                            value={researchForm.values.featuredPublicationsUrls?.[0] ?? ''}
                                            onChange={(e) =>
                                                researchForm.setFieldValue('featuredPublicationsUrls', [
                                                    e.currentTarget.value,
                                                    researchForm.values.featuredPublicationsUrls?.[1] ?? '',
                                                ])
                                            }
                                            error={
                                                (
                                                    researchForm.errors.featuredPublicationsUrls as unknown as
                                                        | string[]
                                                        | undefined
                                                )?.[0]
                                            }
                                        />
                                        <TextInput
                                            id="featured1"
                                            placeholder="https://second-publication-link"
                                            value={researchForm.values.featuredPublicationsUrls?.[1] ?? ''}
                                            onChange={(e) =>
                                                researchForm.setFieldValue('featuredPublicationsUrls', [
                                                    researchForm.values.featuredPublicationsUrls?.[0] ?? '',
                                                    e.currentTarget.value,
                                                ])
                                            }
                                            error={
                                                (
                                                    researchForm.errors.featuredPublicationsUrls as unknown as
                                                        | string[]
                                                        | undefined
                                                )?.[1]
                                            }
                                        />
                                    </Stack>
                                </div>

                                <Group justify="flex-end" mt="xl">
                                    <Button
                                        type="submit"
                                        disabled={!researchForm.isValid() || saveResearchDetails.isPending}
                                        loading={saveResearchDetails.isPending}
                                    >
                                        Save changes
                                    </Button>
                                </Group>
                            </Stack>
                        </form>
                    ) : (
                        <Stack gap="sm">
                            <div>
                                <Text fw={600} size="sm">
                                    Research interests
                                </Text>
                                <Group gap="xs" mt={6}>
                                    {(researchDefaults.researchInterests || []).map((item, idx) => (
                                        <Pill key={`${item}-${idx}`}>{item}</Pill>
                                    ))}
                                </Group>
                            </div>
                            <div>
                                <Text fw={600} size="sm">
                                    Detailed publications URL
                                </Text>
                                <Anchor href={researchDefaults.detailedPublicationsUrl} target="_blank">
                                    {researchDefaults.detailedPublicationsUrl}
                                </Anchor>
                            </div>
                            {researchDefaults.featuredPublicationsUrls?.length ? (
                                <div>
                                    <Text fw={600} size="sm">
                                        Featured publications URLs
                                    </Text>
                                    <Stack gap={4} mt={4}>
                                        {researchDefaults.featuredPublicationsUrls.map((u, idx) => (
                                            <Anchor key={idx} href={u} target="_blank">
                                                {u}
                                            </Anchor>
                                        ))}
                                    </Stack>
                                </div>
                            ) : null}
                        </Stack>
                    )}
                </Paper>
            </Stack>
        </Container>
    )
}
