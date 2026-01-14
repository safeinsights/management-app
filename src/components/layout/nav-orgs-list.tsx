import { orgInitials, orgInitialsTitle } from '@/lib/string'
import { ActionSuccessType } from '@/lib/types'
import { fetchUsersOrgsWithStatsAction } from '@/server/actions/org.actions'
import { Flex, Stack } from '@mantine/core'
import { HouseIcon } from '@phosphor-icons/react'
import { NavbarLink } from './navbar-link'

type Orgs = ActionSuccessType<typeof fetchUsersOrgsWithStatsAction>

const SQUARE_SIZE = 26

type Props = {
    orgs: Orgs
}

export const NavOrgsList: React.FC<Props> = ({ orgs }) => {
    return (
        <Stack>
            <NavbarLink isVisible={true} url="/dashboard" label="My dashboard" icon={<HouseIcon size={16} />} />
            {orgs.map((org) => (
                <NavbarLink
                    key={org.slug}
                    isVisible={true}
                    url={`/${org.slug}/dashboard`}
                    label={orgInitialsTitle(org.name, org.type)}
                    icon={
                        <Flex
                            bg={'white'}
                            c="dark.9"
                            p="0"
                            fz={8}
                            style={{ borderRadius: SQUARE_SIZE / 6 }}
                            align="center"
                            justify="center"
                            w={SQUARE_SIZE}
                            h={SQUARE_SIZE}
                        >
                            {orgInitials(org.name, org.type)}
                        </Flex>
                    }
                />
            ))}
        </Stack>
    )
}
