import { useState, type FC } from '@/components/common'
import { AppModal } from '@/components/modal'
import { useSession } from '@/hooks/session'
import { useUser } from '@clerk/nextjs'
import { Box, Button, CopyButton, Group, Stack, Text, Title, useMantineTheme } from '@mantine/core'
import { CheckIcon } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'

type ConfirmationModalProps = {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    isLoading?: boolean
}

type BackupCodesProps = {
    codes?: string[] | null
}

const BackupCodes = ({ codes }: BackupCodesProps) => {
    const theme = useMantineTheme()
    const { isLoaded } = useUser()
    const { isLoaded: isSessionLoaded, session } = useSession()
    const router = useRouter()
    const [hasCopied, setHasCopied] = useState(false)
    const [modalOpened, setModalOpened] = useState(false)
    const [isRedirecting, setIsRedirecting] = useState(false)

    const codesAsText = codes && codes.length ? codes.join('\n') : ''

    const goToDashboard = () => {
        if (!isSessionLoaded || !session) return
        if (session.team.isResearcher) {
            router.push('/researcher/dashboard')
            return
        }
        if (session.team.isReviewer) {
            router.push(`/reviewer/${session.team.slug}/dashboard`)
            return
        }
        router.push('/')
    }

    if (!isLoaded) return null

    return (
        <>
            <Stack gap="md" mb="xxl">
                <Title mb="xs" ta="center" order={3}>
                    Multi-factor authentication is set up successfully!
                </Title>
                <Text mb="xs" size="md">
                    These are your recovery codes. Please store them in a secure location. You will need one of them to
                    access your account <b>if you lose access</b> to your authentication device.
                </Text>

                <Box
                    bg="gray.0"
                    py="md"
                    px="lg"
                    style={{ border: `1px solid ${theme.colors?.grey[2]}`, maxHeight: 130, overflowY: 'auto' }}
                >
                    {codes && codes.length ? (
                        <Stack gap={2} style={{ overflowY: 'auto' }}>
                            {codes.map((code, index) => (
                                <Text key={index} size="sm">
                                    {code}
                                </Text>
                            ))}
                        </Stack>
                    ) : (
                        <Text size="sm" c="dimmed">
                            Generating recovery codes...
                        </Text>
                    )}
                </Box>

                <Stack gap="md" mt="xs">
                    <CopyButton value={codesAsText} timeout={1000}>
                        {({ copied, copy }) => (
                            <Stack gap={4}>
                                <Button
                                    fullWidth
                                    size="lg"
                                    onClick={() => {
                                        copy()
                                        setHasCopied(true)
                                    }}
                                    variant="primary"
                                    disabled={!codes || codes.length === 0}
                                >
                                    Copy codes
                                </Button>
                                {copied && (
                                    <Group gap={6} justify="center" align="center">
                                        <CheckIcon size={16} color={theme.colors.green[9]} />
                                        <Text size="sm" c="green.9" fw={600}>
                                            Copied!
                                        </Text>
                                    </Group>
                                )}
                            </Stack>
                        )}
                    </CopyButton>

                    <Button
                        loading={isRedirecting}
                        fullWidth
                        variant="outline"
                        mt="xs"
                        size="lg"
                        onClick={() => {
                            if (!hasCopied) {
                                setModalOpened(true)
                            } else {
                                setIsRedirecting(true)
                                goToDashboard()
                            }
                        }}
                        disabled={!isSessionLoaded}
                    >
                        Go to SafeInsights
                    </Button>
                </Stack>
            </Stack>

            <ConfirmationModal
                isOpen={modalOpened}
                onClose={() => setModalOpened(false)}
                onConfirm={() => {
                    setModalOpened(false)
                    setIsRedirecting(true)
                    goToDashboard()
                }}
                isLoading={isRedirecting}
            />
        </>
    )
}

const ConfirmationModal: FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, isLoading = false }) => (
    <AppModal isOpen={isOpen} onClose={onClose} title="Have you stored your MFA recovery codes?">
        <Stack>
            <Text size="md">Make sure you have securely saved your MFA recovery codes.</Text>
            <Text size="sm" c="red.9">
                <b>Note:</b> Each code can be used once. We will not show these codes again.
            </Text>
            <Text size="md" mb="md">
                Do you want to proceed?
            </Text>
            <Group>
                <Button variant="outline" onClick={onClose} size="md">
                    Back
                </Button>
                <Button loading={isLoading} onClick={onConfirm} size="md">
                    Go to SafeInsights
                </Button>
            </Group>
        </Stack>
    </AppModal>
)

export default BackupCodes
