// lightweight wrapper around the Mantine Tooltip component - ensures children are contained in a single element
// reference: https://mantine.dev/core/tooltip/#tooltip-children
import { Tooltip, TooltipProps } from '@mantine/core'

type InfoTooltipProps = TooltipProps & {
    children: React.ReactNode
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ children, ...props }) => (
    <Tooltip {...props}>
        <span>{children}</span>
    </Tooltip>
)
