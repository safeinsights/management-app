import React from 'react'
import { Alert } from '@mantine/core'
import { IconEyeEdit } from '@tabler/icons-react'

export default async function MemberHome({ params }: { params: { encodedStudyId: string } }) {
    return (
        <Alert w="400" m="auto" variant="filled" color="green" icon={<IconEyeEdit />}>
            displaying study id: {params.encodedStudyId}
        </Alert>
    )
}
