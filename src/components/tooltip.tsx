import { Tooltip } from '@mantine/core'
import { InfoIcon } from './icons'

type InfoTooltipProps = {
    text: React.ReactNode
    size?: number
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ text, size }) => (
    <Tooltip multiline withArrow refProp="innerRef" label={text}>
        <InfoIcon size={14} />
    </Tooltip>
)
