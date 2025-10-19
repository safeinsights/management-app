import { ENCLAVE_BG, LAB_BG } from '@/lib/constants'
import { orgInitials } from '@/lib/string'
import { ActionSuccessType } from '@/lib/types'
import { fetchUsersOrgsWithStatsAction } from '@/server/actions/org.actions'
import { Badge, Flex } from '@mantine/core'
import { ButtonLink, type ButtonLinkProps } from '../links'
import { SiBulbLogo } from './svg/si-bulb-logo'

type Orgs = ActionSuccessType<typeof fetchUsersOrgsWithStatsAction>

const WIDTH = 70
const SQUARE_SIZE = 48

type SquareProps = ButtonLinkProps & {
    isActive?: boolean
    color: string
    eventCount?: string | number | bigint
    children: React.ReactNode
}

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
    focusedOrgSlug?: string | null
}

export const NavbarOrgSquares: React.FC<Props> = ({ isMainDashboard, focusedOrgSlug, orgs }) => {
    return (
        <Flex
            direction="column"
            align="center"
            h="100%"
            bg="purple.8"
            gap="xs"
            w={WIDTH}
            ml={isMainDashboard ? -WIDTH : 0}
            style={{ transition: 'margin 0.3s ease' }}
        >
            <Square color="white" my="lg" href="/dashboard">
                <SiBulbLogo width={24} />
            </Square>

            {orgs.map((org) => {
                const isActive = org.slug === focusedOrgSlug
                const wrapperBg = isActive ? (org.type === 'enclave' ? ENCLAVE_BG : LAB_BG) : 'purple.8'
                return (
                    <Flex
                        key={org.id}
                        w="100%"
                        justify="center"
                        bg={wrapperBg}
                        style={{ transition: 'background-color 0.2s ease' }}
                        py={8}
                    >
                        <Square
                            color="white"
                            isActive={isActive}
                            href={`/${org.slug}/dashboard`}
                            eventCount={org.eventCount}
                        >
                            {orgInitials(org.name, org.type)}
                        </Square>
                    </Flex>
                )
            })}
        </Flex>
    )
}
