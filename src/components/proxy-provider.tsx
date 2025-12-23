//leveraged from https://github.com/cgfeel/next.v2/blob/master/routing-file/src/components/proxyProvider/index.tsx

'use client'

import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import Script from 'next/script'
import { FC, PropsWithChildren, createContext, useEffect, useState } from 'react'
import { AppModal } from '@/components/modal'
import { Button, Text, Stack, Group } from '@mantine/core'
import { Routes } from '@/lib/routes'
import type { Route } from 'next'

const ProxyContext = createContext<ProxyInstance>([undefined, () => {}])

type ProxyProviderProps = {
    isDirty: boolean
    onSaveDraft?: () => Promise<void>
    isSavingDraft?: boolean
    onNavigateAway?: () => void
}

const ProxyProvider: FC<PropsWithChildren<ProxyProviderProps>> = ({
    children,
    isDirty,
    onSaveDraft,
    isSavingDraft = false,
    onNavigateAway,
}) => {
    const router = useRouter()
    const [tips, setTips] = useState<string | undefined>()
    const [isOpen, setIsOpen] = useState(false)
    const [targetUrl, setTargetUrl] = useState<string>('')
    const msg = tips === undefined ? tips : tips || 'Are you sure want to leave this page?'

    const pathname = usePathname()
    const searchParams = useSearchParams()

    const url = [pathname, searchParams].filter((i) => i).join('?')
    useEffect(() => {
        // TODO: investigate if this is an issue, disable was added during upgrading eslint which pointed out possible errors
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTips(undefined)
    }, [url, setTips])

    useEffect(() => {
        // Handle browser reload/close
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (isDirty) {
                event.preventDefault()
                event.returnValue = ''
                return event.returnValue
            }
        }

        // Handle browser back/forward buttons
        // Note: event.preventDefault() doesn't work for popstate - it fires AFTER history changes
        // Instead, we push state back to stay on the current URL and show the dialog
        const handlePopState = (_: PopStateEvent) => {
            if (isDirty) {
                // Push the current URL back onto the history stack to "undo" the back/forward
                window.history.pushState(null, '', window.location.href)
                setTargetUrl('')
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
                        const normalizedUrl = isExternal
                            ? href
                            : href.startsWith('http')
                              ? href.replace(window.location.origin, '')
                              : href

                        setTargetUrl(normalizedUrl)
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

    const navigateAway = () => {
        setIsOpen(false)
        onNavigateAway?.()
        if (targetUrl) {
            router.push(targetUrl as Route)
        } else {
            router.push(Routes.home)
        }
    }

    const handleSaveDraft = async () => {
        if (onSaveDraft) {
            await onSaveDraft()
        }
        navigateAway()
    }

    const handleDiscard = () => {
        navigateAway()
    }

    const handleClose = () => {
        setIsOpen(false)
        setTargetUrl('')
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
                    onClose={handleClose}
                    title="Save study as draft"
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
                            You have made changes to this study. Would you like to discard this study or should we save
                            this as a draft for later use? Discarded studies cannot be retrieved.
                        </Text>
                        <Group justify="flex-end">
                            <Button variant="outline" onClick={handleDiscard} disabled={isSavingDraft}>
                                Discard study
                            </Button>
                            <Button variant="filled" onClick={handleSaveDraft} loading={isSavingDraft}>
                                Save as draft
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
