import { useTimer } from "./timer"
import { Text, Flex, Loader } from '@mantine/core'

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
                Reload inactive, nothing needs refreshed
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
