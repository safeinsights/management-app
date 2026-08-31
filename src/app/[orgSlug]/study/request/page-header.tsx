'use client'

import { FC } from 'react'
import { Title } from '@mantine/core'

interface ProposalHeaderProps {
    title: string
}

export const ProposalHeader: FC<ProposalHeaderProps> = ({ title }) => {
    return <Title order={1}>{title}</Title>
}

export const StudyRequestPageHeader: FC = () => {
    return <ProposalHeader title="Request data use" />
}
