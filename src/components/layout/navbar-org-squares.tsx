import { orgInitials } from '@/lib/string'
import { ActionSuccessType } from '@/lib/types'
import { fetchOrgsWithStatsAction } from '@/server/actions/org.actions'
import { Badge, Flex } from '@mantine/core'
import { SmallMonoColorLogo } from './small-mono-color-logo'
import { ButtonLink, type ButtonLinkProps } from '../links'

type Orgs = ActionSuccessType<typeof fetchOrgsWithStatsAction>

const WIDTH = 60
const SQUARE_SIZE = 48

type SquareProps = ButtonLinkProps & {
    isActive?: boolean
    color: string
    eventCount?: string | number | bigint
    children: React.ReactNode
}

const ActiveStripe = () => (
    <Flex
        pos="absolute"
        left={-4}
        top={6}
        bottom={0}
        w={4}
        h={36}
        bg="blue.8"
        style={{ borderTopLeftRadius: '8px', borderBottomLeftRadius: '8px' }}
    />
)

const Square: React.FC<SquareProps> = ({ color, children, isActive, eventCount, ...props }) => {
    return (
        <ButtonLink
            {...props}
            bg={color}
            w={SQUARE_SIZE}
            h={SQUARE_SIZE}
            p="0"
            c="dark.9"
            style={{ borderRadius: SQUARE_SIZE / 4, overflow: 'visible' }}
            pos="relative"
        >
            {isActive ? <ActiveStripe /> : null}
            {eventCount == null ? null : (
                <Badge size="sm" pos="absolute" right={-4} top={-4} bottom={0} fz="sx" color="red">
                    {eventCount}
                </Badge>
            )}
            {children}
        </ButtonLink>
    )
}

type Props = {
    isMainDashboard: boolean
    orgs: Orgs
}

export const NavbarOrgSquares: React.FC<Props> = ({ isMainDashboard, orgs }) => {
    return (
        <Flex
            direction="column"
            align="center"
            h="100%"
            bg="#7A7485"
            gap="sm"
            w={WIDTH}
            ml={isMainDashboard ? -WIDTH : 0}
            style={{ transition: 'margin 0.3s ease' }}
        >
            <Square color="#100A4C" my="lg" href="/dashboard">
                <SmallMonoColorLogo width={24} />
            </Square>

            {orgs.map((org) => (
                <Square
                    color="white"
                    isActive={org.slug === 'openstax'}
                    key={org.id}
                    href={`/dashboard/${org.slug}`}
                    eventCount={org.eventCount}
                >
                    {orgInitials(org.name, org.type)}
                </Square>
            ))}
        </Flex>
    )
}
