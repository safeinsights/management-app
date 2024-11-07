'use client'

import { OrganizationList } from '@clerk/nextjs'
import { Center } from '@mantine/core'

export default function OrgSelection() {
    return (
        <Center h="100vh">
            <OrganizationList 
                afterCreateOrganizationUrl="/"
                afterSelectOrganizationUrl="/"
                hidePersonal={true}
            />
        </Center>
    )
}
