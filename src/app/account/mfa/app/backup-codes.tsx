import { useEffect, useState } from '@/components/common'
import { useSession } from '@/hooks/session'
import { useUser } from '@clerk/nextjs'
import { Box, Button, CopyButton, Group, Stack, Text, Title, useMantineTheme } from '@mantine/core'
import { CheckIcon } from '@phosphor-icons/react'
import { useRouter } from 'next/navigation'

type BackupCodesProps = {
    codes?: string[] | null
}

const BackupCodes = ({ codes: initialCodes }: BackupCodesProps) => {
    const theme = useMantineTheme()
    const { user, isLoaded } = useUser()
    const { isLoaded: isSessionLoaded, session } = useSession()
    const router = useRouter()
    const [codes, setCodes] = useState<string[] | null>(initialCodes || null)

    useEffect(() => {
        if (initialCodes) return
        if (!isLoaded || !user) return

        if (!user.backupCodeEnabled) {
            let cancelled = false
            ;(async () => {
                try {
                    const resource = await user.createBackupCode()
                    if (!cancelled) setCodes(resource.codes || [])
                } catch {
                    setCodes([])
                }
            })()
            return () => {
                cancelled = true
            }
        }
    }, [isLoaded, user, initialCodes])

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
        <Stack gap="md" mb="xxl">
            <Title mb="xs" ta="center" order={3}>
                Multi-factor authentication is set up successfully!
            </Title>
            <Text mb="xs" size="md">
                These are your recovery codes. Please store them in a secure location. You will need one of them to
                access your account if you lose access to your authentication device.
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
                            <Button fullWidth onClick={copy} variant="primary" disabled={!codes || codes.length === 0}>
                                Copy codes
                            </Button>
                            {copied && (
                                <Group gap={6} justify="center" align="center">
                                    <CheckIcon size={16} color={theme.colors.green[9]} />
                                    <Text size="sm" c="green.9">
                                        Copied!
                                    </Text>
                                </Group>
                            )}
                        </Stack>
                    )}
                </CopyButton>

                <Button fullWidth variant="outline" mt="xs" onClick={goToDashboard} disabled={!isSessionLoaded}>
                    Go to dashboard
                </Button>
            </Stack>
        </Stack>
    )
}

export default BackupCodes
