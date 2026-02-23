'use client'

import {
    Stack,
    Title,
    Divider,
    Paper,
    Text,
    Button,
    Group,
    ActionIcon,
    Tooltip,
    Collapse,
    Grid,
    GridCol,
    Badge,
    Box,
} from '@mantine/core'
import { useQuery, useQueryClient, useMutation } from '@/common'
import { useParams } from 'next/navigation'
import { useDisclosure } from '@mantine/hooks'
import { AppModal } from '@/components/modal'
import { CodeEnvForm } from './code-env-form'
import {
    TrashIcon,
    PlusCircleIcon,
    PencilIcon,
    FileMagnifyingGlassIcon,
    CaretDownIcon,
} from '@phosphor-icons/react/dist/ssr'
import { deleteOrgCodeEnvAction, fetchOrgCodeEnvsAction, fetchStarterCodeAction } from './code-envs.actions'
import { SuretyGuard } from '@/components/surety-guard'
import { reportMutationError, reportError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { ErrorPanel } from '@/components/panel'
import { LoadingMessage } from '@/components/loading'
import { ActionSuccessType, SAMPLE_DATA_FORMATS, type SampleDataFormat } from '@/lib/types'
import { basename } from '@/lib/paths'
import { CodeViewer } from '@/components/code-viewer'
import { useState } from 'react'
import { isActionError } from '@/lib/errors'
import type { OrgCodeEnvSettings, ScanStatus } from '@/database/types'

type CodeEnv = ActionSuccessType<typeof fetchOrgCodeEnvsAction>[number]

const SCAN_BADGE_CONFIG: Record<ScanStatus, { color: string; label: string }> = {
    'SCAN-PENDING': { color: 'gray', label: 'Scan Pending' },
    'SCAN-RUNNING': { color: 'blue', label: 'Scanning...' },
    'SCAN-COMPLETE': { color: 'green', label: 'Scan Complete' },
    'SCAN-FAILED': { color: 'red', label: 'Scan Failed' },
}

const ScanStatusBadge: React.FC<{ status: string | null }> = ({ status }) => {
    if (!status) return null
    const config = SCAN_BADGE_CONFIG[status as ScanStatus]
    if (!config) return null

    return (
        <Badge variant="light" size="sm" color={config.color}>
            {config.label}
        </Badge>
    )
}

const LABEL_SPAN = { base: 12, sm: 3 }
const VALUE_SPAN = { base: 12, sm: 9 }

const DetailRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <Grid align="flex-start">
        <GridCol span={LABEL_SPAN}>
            <Text fw="bold" c="dimmed" size="sm">
                {label}
            </Text>
        </GridCol>
        <GridCol span={VALUE_SPAN}>
            <Text size="sm" component="div">
                {children}
            </Text>
        </GridCol>
    </Grid>
)

const CodeEnvDetailPanel: React.FC<{ image: CodeEnv; onViewCode: () => void; isLoadingCode: boolean }> = ({
    image,
    onViewCode,
    isLoadingCode,
}) => {
    const envVars =
        ((image.settings as OrgCodeEnvSettings)?.environment || []).map((v) => `${v.name}=${v.value}`).join(', ') || '-'

    return (
        <Box p="md" bg="gray.0">
            <Stack gap="xs">
                <DetailRow label="URL">{image.url}</DetailRow>
                <DetailRow label="Command Line">{image.cmdLine}</DetailRow>
                <DetailRow label="Starter Code">
                    <Group gap="sm">
                        <span>{basename(image.starterCodePath)}</span>
                        <Tooltip label="View Starter Code" withArrow>
                            <ActionIcon
                                size="sm"
                                variant="subtle"
                                color="blue"
                                onClick={onViewCode}
                                loading={isLoadingCode}
                            >
                                <FileMagnifyingGlassIcon />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </DetailRow>
                <DetailRow label="Sample Data Path">{image.sampleDataPath || '-'}</DetailRow>
                <DetailRow label="File Format">
                    {SAMPLE_DATA_FORMATS[image.sampleDataFormat as SampleDataFormat] || '-'}
                </DetailRow>
                <DetailRow label="Env Vars">{envVars}</DetailRow>
                <DetailRow label="Created At">{new Date(image.createdAt).toISOString()}</DetailRow>
            </Stack>
        </Box>
    )
}

const CodeEnvRow: React.FC<{ image: CodeEnv; canDelete: boolean }> = ({ image, canDelete }) => {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const queryClient = useQueryClient()
    const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false)
    const [codeViewerOpened, { open: openCodeViewer, close: closeCodeViewer }] = useDisclosure(false)
    const [detailOpened, { toggle: toggleDetail }] = useDisclosure(false)
    const [starterCode, setStarterCode] = useState<string | null>(null)
    const [isLoadingCode, setIsLoadingCode] = useState(false)

    const deleteMutation = useMutation({
        mutationFn: deleteOrgCodeEnvAction,
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ['orgCodeEnvs', orgSlug],
            })
            reportSuccess('Code environment was deleted successfully')
        },
        onError: reportMutationError('Failed to delete code environment'),
    })

    const handleEditComplete = () => {
        closeEditModal()
        queryClient.invalidateQueries({ queryKey: ['orgCodeEnvs', orgSlug] })
    }

    const handleViewCode = async () => {
        setIsLoadingCode(true)
        try {
            const result = await fetchStarterCodeAction({
                orgSlug,
                imageId: image.id,
            })
            if (isActionError(result)) {
                reportError(result)
            } else {
                setStarterCode(result.content)
                openCodeViewer()
            }
        } catch (error) {
            reportError(error)
        } finally {
            setIsLoadingCode(false)
        }
    }

    const DeleteCodeEnv = () => {
        if (!canDelete) return null

        return (
            <SuretyGuard
                onConfirmed={() => deleteMutation.mutate({ imageId: image.id, orgSlug })}
                message="Are you sure you want to delete this code environment? This cannot be undone."
            >
                <TrashIcon />
            </SuretyGuard>
        )
    }

    return (
        <Box style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
            <Group justify="space-between" p="sm" wrap="nowrap">
                <Group gap="sm" wrap="nowrap">
                    <ActionIcon size="sm" variant="subtle" onClick={toggleDetail}>
                        <CaretDownIcon
                            style={{
                                transform: detailOpened ? 'rotate(0deg)' : 'rotate(-90deg)',
                                transition: 'transform 200ms',
                            }}
                        />
                    </ActionIcon>
                    <Text fw={500}>{image.name}</Text>
                    <Badge variant="light" size="sm" style={{ cursor: 'pointer' }} onClick={handleViewCode}>
                        {image.language}
                    </Badge>
                    {image.isTesting && (
                        <Badge variant="light" size="sm" color="orange">
                            Testing
                        </Badge>
                    )}
                    <ScanStatusBadge status={image.latestScanStatus} />
                </Group>
                <Group gap={4} wrap="nowrap">
                    <Tooltip label="Edit" withArrow>
                        <ActionIcon size="sm" variant="subtle" color="green" onClick={openEditModal}>
                            <PencilIcon />
                        </ActionIcon>
                    </Tooltip>
                    <DeleteCodeEnv />
                </Group>
            </Group>

            <Collapse in={detailOpened}>
                <CodeEnvDetailPanel image={image} onViewCode={handleViewCode} isLoadingCode={isLoadingCode} />
            </Collapse>

            <AppModal isOpen={editModalOpened} onClose={closeEditModal} title="Edit Code Environment">
                <CodeEnvForm image={image} onCompleteAction={handleEditComplete} />
            </AppModal>
            <AppModal
                isOpen={codeViewerOpened}
                onClose={closeCodeViewer}
                title={`Starter Code: ${basename(image.starterCodePath)}`}
                size="xl"
            >
                {starterCode ? (
                    <CodeViewer
                        code={starterCode}
                        language={image.language.toLowerCase() as 'python' | 'r'}
                        fileName={basename(image.starterCodePath)}
                    />
                ) : (
                    <LoadingMessage message="Loading starter code..." />
                )}
            </AppModal>
        </Box>
    )
}

const CodeEnvsTable: React.FC<{ images: CodeEnv[] }> = ({ images }) => {
    if (!images.length) {
        return (
            <Text fz="sm" c="dimmed" ta="center" p="md">
                No code environments available.
            </Text>
        )
    }

    const canDelete = images.length > 1

    return (
        <Stack gap={0}>
            {images.map((image, key) => (
                <CodeEnvRow key={key} image={image} canDelete={canDelete} />
            ))}
        </Stack>
    )
}

export const CodeEnvs: React.FC = () => {
    const { orgSlug } = useParams<{ orgSlug: string }>()

    const queryClient = useQueryClient()

    const [addModalOpened, { open: openAddModal, close: closeAddModal }] = useDisclosure(false)

    const {
        data: codeEnvs,
        isLoading,
        isError,
        error,
        refetch,
    } = useQuery({
        queryKey: ['orgCodeEnvs', orgSlug],
        queryFn: async () => await fetchOrgCodeEnvsAction({ orgSlug }),
    })

    const handleFormComplete = () => {
        closeAddModal()
        queryClient.invalidateQueries({ queryKey: ['orgCodeEnvs', orgSlug] })
    }

    return (
        <Paper bg="white" p="xxl">
            <Stack>
                <Group justify="space-between" align="center">
                    <Title order={3} size="lg">
                        Code Environments
                    </Title>
                    <Button leftSection={<PlusCircleIcon size={16} />} onClick={openAddModal}>
                        Add Code Environment
                    </Button>
                </Group>
                <Divider c="dimmed" />

                {isLoading && <LoadingMessage message="Loading code environments" />}

                {isError && (
                    <ErrorPanel
                        title={`Failed to load code environments: ${error?.message || 'Unknown error'}`}
                        onContinue={refetch}
                    >
                        Retry
                    </ErrorPanel>
                )}

                {!isLoading && !isError && <CodeEnvsTable images={codeEnvs || []} />}
            </Stack>

            <AppModal isOpen={addModalOpened} onClose={closeAddModal} title="Add Code Environment">
                <CodeEnvForm onCompleteAction={handleFormComplete} />
            </AppModal>
        </Paper>
    )
}
