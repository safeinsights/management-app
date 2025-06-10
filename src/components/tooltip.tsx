import { Tooltip } from '@mantine/core'
import { InfoIcon } from './icons'

type InfoTooltipProps = {
    text: React.ReactNode
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ text }) => (
    <Tooltip multiline withArrow refProp="innerRef" label={text}>
        <InfoIcon size={14} />
    </Tooltip>
)
