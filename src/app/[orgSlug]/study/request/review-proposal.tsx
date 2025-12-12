import { Stack, Title, Paper, Divider, Group, Text } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { StudyProposalFormValues } from './study-proposal-form-schema'
import { Routes } from '@/lib/routes'
import { Link } from '@/components/links'

interface DetailRowProps {
    label: string
    children: React.ReactNode
}

const DetailRow: React.FC<DetailRowProps> = ({ label, children }) => (
    <Group gap="xl">
        <Text w={180} c="dimmed" size="sm">
            {label}
        </Text>
        <div>{children}</div>
    </Group>
)

interface FileLinkProps {
    file: File | null | undefined
}

const FileLink: React.FC<FileLinkProps> = ({ file }) => {
    if (!file) return <Text c="dimmed">Not uploaded</Text>
    return (
        <Group gap="xs">
            <Text size="sm" c="blue">
                {file.name}
            </Text>
        </Group>
    )
}

export const StudyProposalReview: React.FC<{ form: UseFormReturnType<StudyProposalFormValues>; studyId: string }> = ({
    form,
    studyId,
}) => {
    const values = form.getValues()
    const additionalFiles = values.additionalCodeFiles.filter(Boolean) as File[]
    const { orgSlug } = values

    return (
        <Stack gap="lg">
            <Title order={3}>Review your submission</Title>

            {/* Data Organization Section */}
            <Paper bg="white" p="xl" radius="sm" withBorder>
                <Stack gap="md">
                    <Title order={5}>Data Organization</Title>
                    <Divider />
                    <DetailRow label="Data Organization">{values.orgSlug || 'Not specified'}</DetailRow>
                </Stack>
            </Paper>

            {/* Study Proposal Section */}
            <Paper bg="white" p="xl" radius="sm" withBorder>
                <Stack gap="md">
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Proposal
                        </Title>
                        <Link href={Routes.studyEdit({ orgSlug, studyId })}>Edit</Link>
                    </Group>
                    <Divider />
                    <Stack gap="sm">
                        <DetailRow label="Study title">{values.title || 'Not specified'}</DetailRow>
                        <DetailRow label="Principal Investigator">{values.piName || 'Not specified'}</DetailRow>
                        <DetailRow label="Study description">
                            <FileLink file={values.descriptionDocument} />
                        </DetailRow>
                        <DetailRow label="IRB document">
                            <FileLink file={values.irbDocument} />
                        </DetailRow>
                        <DetailRow label="Agreement document">
                            <FileLink file={values.agreementDocument} />
                        </DetailRow>
                    </Stack>
                </Stack>
            </Paper>

            {/* Programming Language Section */}
            <Paper bg="white" p="xl" radius="sm" withBorder>
                <Stack gap="md">
                    <Title order={5}>Programming language</Title>
                    <Divider />
                    <DetailRow label="Programming language">{values.language || 'Not specified'}</DetailRow>
                </Stack>
            </Paper>

            {/* Study Code Section */}
            <Paper bg="white" p="xl" radius="sm" withBorder>
                <Stack gap="md">
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Code
                        </Title>
                        <Link href={Routes.studyResubmit({ orgSlug, studyId })}>Edit</Link>
                    </Group>
                    <Divider />
                    <Stack gap="sm">
                        <DetailRow label="Main code file">
                            {values.mainCodeFile ? (
                                <FileLink file={values.mainCodeFile} />
                            ) : (
                                <Text c="dimmed">No file uploaded</Text>
                            )}
                        </DetailRow>
                        {additionalFiles.length > 0 && (
                            <DetailRow label="Additional file(s)">
                                <Group gap="md">
                                    {additionalFiles.map((file) => (
                                        <FileLink key={file.name} file={file} />
                                    ))}
                                </Group>
                            </DetailRow>
                        )}
                    </Stack>
                </Stack>
            </Paper>
        </Stack>
    )
}
