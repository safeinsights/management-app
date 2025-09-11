//leveraged from https://github.com/cgfeel/next.v2/blob/master/routing-file/src/components/proxyProvider/index.tsx

'use client'

import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import Script from 'next/script'
import { FC, PropsWithChildren, createContext, useEffect, useState } from 'react'
import { AppModal } from '@/components/modal'
import { Button, Text, Stack, Group } from '@mantine/core'

const ProxyContext = createContext<ProxyInstance>([undefined, () => {}])

const ProxyProvider: FC<PropsWithChildren<{ isDirty: boolean }>> = ({ children, isDirty }) => {
    const router = useRouter()
    const [tips, setTips] = useState<string | undefined>()
    const [isOpen, setIsOpen] = useState(false)
    const msg = tips === undefined ? tips : tips || 'Are you sure want to leave this page?'

    const pathname = usePathname()
    const searchParams = useSearchParams()

    const url = [pathname, searchParams].filter((i) => i).join('?')
    useEffect(() => {
        setTips(undefined)
    }, [url, setTips])

    useEffect(() => {
        // Track the target URL for navigation after confirmation
        const targetUrl = { current: '' }

        // Handle browser reload/close
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (isDirty) {
                event.preventDefault()
                event.returnValue = ''
                return event.returnValue
            }
        }

        // Handle browser back/forward buttons
        const handlePopState = (event: PopStateEvent) => {
            if (isDirty) {
                event.preventDefault()
                setIsOpen(true)
            }
        }

        // Handle in-app navigation
        const handleClick = (event: MouseEvent) => {
            if (!isDirty) return

            // Find the closest anchor element
            const target = event.target as HTMLElement
            const link = target.closest('a')

            // Only process if it's a link and not marked to skip
            if (link && link.tagName === 'A' && !link.hasAttribute('data-skip-navigation')) {
                const href = link.getAttribute('href')
                if (href) {
                    const isExternal = href.startsWith('http') && !href.startsWith(window.location.origin)
                    const isInternal = href.startsWith('/') || href.startsWith('#')

                    if (isInternal || isExternal) {
                        event.preventDefault()
                        event.stopPropagation()
                        event.stopImmediatePropagation()

                        // Store the target URL for later navigation
                        targetUrl.current = isExternal
                            ? href
                            : href.startsWith('http')
                              ? href.replace(window.location.origin, '')
                              : href

                        // Show the modal
                        setIsOpen(true)
                    }
                }
            }
        }

        // Add event listeners with capture phase to ensure we catch the event early
        window.addEventListener('beforeunload', handleBeforeUnload)
        window.addEventListener('popstate', handlePopState)
        document.addEventListener('click', handleClick, { capture: true })

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload)
            window.removeEventListener('popstate', handlePopState)
            document.removeEventListener('click', handleClick, { capture: true })
        }
    }, [isDirty])

    const confirmNavigation = () => {
        setIsOpen(false)
        router.push('/')
    }

    const handleBackToForm = () => {
        setIsOpen(false)
    }

    return (
        <ProxyContext.Provider value={[msg, setTips]}>
            <Script
                strategy="afterInteractive"
                id="proxy-script"
                dangerouslySetInnerHTML={{
                    __html: `
                        (() => {
                            const originalPushState = history.pushState.bind(history);
                            let currentPoint = 0;
                            let point = 0;
                            window.history.pushState = function(state, title, url) {
                                state = state || {};
                                state.point = ++point;
                                currentPoint = point;
                                originalPushState(state, title, url);
                            };
                            const originalReplaceState = history.replaceState.bind(history);
                            window.history.replaceState = function(state, title, url) {
                                state = state || {};
                                state.point = currentPoint;
                                originalReplaceState(state, title, url);
                            };
                        })();
                    `,
                }}
            />
            {children}

            <>
                <AppModal
                    isOpen={isOpen}
                    onClose={handleBackToForm}
                    title="Cancel proposal?"
                    overlayProps={{
                        style: {
                            position: 'fixed',
                            zIndex: 10000,
                            pointerEvents: isOpen ? 'auto' : 'none',
                        },
                    }}
                >
                    <Stack>
                        <Text size="md">
                            You&apos;re about to cancel this study proposal draft. On cancel, the current proposal will
                            be deleted and you won&apos;t be able to retrieve it in the future.
                        </Text>
                        <Text size="md">Do you want to proceed?</Text>
                        <Group>
                            <Button variant="outline" onClick={handleBackToForm}>
                                Back to proposal
                            </Button>
                            <Button variant="filled" color="red.7" onClick={confirmNavigation}>
                                Yes, delete proposal
                            </Button>
                        </Group>
                    </Stack>
                </AppModal>
            </>
        </ProxyContext.Provider>
    )
}

export type ProxyInstance = [string | undefined, (tips?: string) => void]

export { ProxyContext }

export default ProxyProvider
