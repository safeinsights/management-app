import { getDataSourcesForOrg } from './db/queries'

export async function generateDataSourcesContextString(orgId: string): Promise<string> {
    const sources = await getDataSourcesForOrg(orgId)

    const sections: string[] = []
    for (const source of sources) {
        const lines: string[] = [`### ${source.name}`]
        if (source.description) lines.push(source.description)

        for (const url of source.urls) {
            if (url.url !== null) {
                lines.push(`Documentation: ${url.url} (${url.description || 'No description provided'})`)
            }
        }

        sections.push(lines.join('\n'))
    }
    return sections.length > 0 ? sections.join('\n\n') : 'No data sources provided'
}
