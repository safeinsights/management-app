import { Stack, Title, Paper, Divider, Group, Text } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { StudyProposalFormValues } from './step1-schema'
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
    existingPath?: string | null
}

const FileLink: React.FC<FileLinkProps> = ({ file, existingPath }) => {
    // Show File object name if available, otherwise show existing path from server
    if (file) {
        return (
            <Group gap="xs">
                <Text size="sm" c="blue">
                    {file.name}
                </Text>
            </Group>
        )
    }
    if (existingPath) {
        return (
            <Group gap="xs">
                <Text size="sm" c="blue">
                    {existingPath}
                </Text>
            </Group>
        )
    }
    return <Text c="dimmed">Not uploaded</Text>
}

interface ExistingFiles {
    descriptionDocPath?: string | null
    irbDocPath?: string | null
    agreementDocPath?: string | null
    mainCodeFileName?: string | null
    additionalCodeFileNames?: string[]
}

interface StudyProposalReviewProps {
    form: UseFormReturnType<StudyProposalFormValues>
    studyId: string
    existingFiles?: ExistingFiles
}

export const StudyProposalReview: React.FC<StudyProposalReviewProps> = ({ form, studyId, existingFiles }) => {
    const values = form.getValues()
    const additionalFiles = values.additionalCodeFiles.filter(Boolean) as File[]
    const { orgSlug } = values

    return (
        <Stack gap="xl">
            <Title order={1}>Review your submission</Title>

            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Data Organization
                        </Title>
                    </Group>
                    <Divider c="dimmed" />
                    <DetailRow label="Data Organization">{values.orgSlug || 'Not specified'}</DetailRow>
                </Stack>
            </Paper>

            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Proposal
                        </Title>
                        <Link href={Routes.studyEdit({ orgSlug, studyId })}>Edit</Link>
                    </Group>
                    <Divider c="dimmed" />
                    <Stack gap="sm">
                        <DetailRow label="Study title">{values.title || 'Not specified'}</DetailRow>
                        <DetailRow label="Principal Investigator">{values.piName || 'Not specified'}</DetailRow>
                        <DetailRow label="Study description">
                            <FileLink
                                file={values.descriptionDocument}
                                existingPath={existingFiles?.descriptionDocPath}
                            />
                        </DetailRow>
                        <DetailRow label="IRB document">
                            <FileLink file={values.irbDocument} existingPath={existingFiles?.irbDocPath} />
                        </DetailRow>
                        <DetailRow label="Agreement document">
                            <FileLink file={values.agreementDocument} existingPath={existingFiles?.agreementDocPath} />
                        </DetailRow>
                    </Stack>
                </Stack>
            </Paper>

            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Programming Language
                        </Title>
                    </Group>
                    <Divider c="dimmed" />
                    <DetailRow label="Programming language">{values.language || 'Not specified'}</DetailRow>
                </Stack>
            </Paper>

            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={4} size="xl">
                            Study Code
                        </Title>
                        <Link href={Routes.studyResubmit({ orgSlug, studyId })}>Edit</Link>
                    </Group>
                    <Divider c="dimmed" />
                    <Stack gap="sm">
                        <DetailRow label="Main code file">
                            <FileLink file={values.mainCodeFile} existingPath={existingFiles?.mainCodeFileName} />
                        </DetailRow>
                        {(additionalFiles.length > 0 || (existingFiles?.additionalCodeFileNames?.length ?? 0) > 0) && (
                            <DetailRow label="Additional file(s)">
                                <Group gap="md">
                                    {additionalFiles.length > 0
                                        ? additionalFiles.map((file) => <FileLink key={file.name} file={file} />)
                                        : existingFiles?.additionalCodeFileNames?.map((fileName) => (
                                              <FileLink key={fileName} file={null} existingPath={fileName} />
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
