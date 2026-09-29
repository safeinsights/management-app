import type { ReactNode } from 'react'
import { useTimer } from './timer'
import { Text, Flex, Loader } from '@mantine/core'

// The refresher's width varies by state, so a fixed-height row keeps it from shifting the
// other header controls.
export const RefresherSlot: React.FC<{ children: ReactNode }> = ({ children }) => {
    if (!children) return null
    return (
        <Flex justify="flex-end" align="center" mih={24} data-testid="refresher-slot">
            {children}
        </Flex>
    )
}

export const Refresher: React.FC<{ isEnabled: boolean; refresh: () => void; isPending: boolean }> = ({
    isEnabled,
    refresh,
    isPending,
}) => {
    const remainingMs = useTimer({
        isEnabled,
        every: { 90: 'seconds' },
        trigger: refresh,
    })

    if (!isEnabled)
        return (
            <Text fz="sm" className="spy-mode-element">
                Reload inactive, nothing needs refreshing
            </Text>
        )

    if (isPending)
        return (
            <Flex gap="sm" fz="sm">
                <Loader size="sm" className="spy-mode-element" /> refreshing…
            </Flex>
        )

    return (
        <Text fz="sm" className="spy-mode-element">
            {Math.round(remainingMs / 1000)} seconds until refresh
        </Text>
    )
}
