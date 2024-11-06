'use client'

import { Breadcrumbs, Anchor } from '@mantine/core'
import { Link } from 'next/link'
import { Study } from './study'


export const MemberBreadcrumbs: React.FC<{ study?: Study; memberIdentifier: string }> = ({ memberIdentifier, study }) => {
  const memberBreadcrumbs = [
    { title: 'All Studies', href: (memberIdentifier: string) => `/member/${memberIdentifier}/studies/review` },
    { title: study.title, href: (studyIdentifier: string) => `/member/${memberIdentifier}/study/${studyIdentifier}/review` },
  ].map((item, index) => (
    <Anchor component={Link} href={typeof item.href === 'function' ? item.href(memberIdentifier) : item.href} key={index} sx={{ textDecoration: 'underline' }}>
      {item.title}
    </Anchor>
  )); 

  return (
    <Breadcrumbs mb={40} separator=">" separatorMargin="md">{memberBreadcrumbs}</Breadcrumbs>
  )
}

export default MemberBreadcrumbs
