import { ENCLAVE_BG, LAB_BG } from '@/lib/constants'
import { orgInitials } from '@/lib/string'
import { ActionSuccessType } from '@/lib/types'
import { fetchUsersOrgsAction } from '@/server/actions/org.actions'
import { Flex } from '@mantine/core'
import { ButtonLink, type ButtonLinkProps } from '../links'
import { SiBulbLogo } from './svg/si-bulb-logo'
import { Routes } from '@/lib/routes'

type Orgs = ActionSuccessType<typeof fetchUsersOrgsAction>

const WIDTH = 70
const SQUARE_SIZE = 48

type SquareProps = ButtonLinkProps & {
    isActive?: boolean
    color: string
    children: React.ReactNode
}

const Square: React.FC<SquareProps> = ({ color, children, isActive, ...props }) => {
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
            pt={isMainDashboard ? 0 : 'md'}
            ml={isMainDashboard ? -WIDTH : 0}
            style={{ transition: 'margin 0.3s ease, padding 0.3s ease' }}
        >
            <Square color="white" my="lg" href={Routes.dashboard} display={isMainDashboard ? undefined : 'none'}>
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
                        <Square color="white" isActive={isActive} href={Routes.orgDashboard({ orgSlug: org.slug })}>
                            {orgInitials(org.name, org.type)}
                        </Square>
                    </Flex>
                )
            })}
        </Flex>
    )
}
