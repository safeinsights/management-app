'use client'

import React, { FC } from 'react'
import { Member } from '@/schema/member'
import { Stack, Title } from '@mantine/core'
import { fetchStudiesForMember } from '@/server/actions/study-actions'
import { useQuery } from '@tanstack/react-query'

export const StudiesTable: FC<{ member: Member }> = ({ member }) => {
    const { data: studies } = useQuery({
        queryKey: ['studiesForMember', member.identifier],
        initialData: [],
        queryFn: () => {
            return fetchStudiesForMember(member.identifier)
        },
    })

    console.log(studies)

    return (
        <Stack px="lg" gap="lg">
            <Title order={4}>Review Studies</Title>
        </Stack>
    )
}
