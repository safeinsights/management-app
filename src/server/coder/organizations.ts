import { coderOrgsPath, coderTemplateId } from '@/lib/paths'
import { getConfigValue } from '../config'
import { coderFetch } from './client'
import { CoderBaseEntity } from './types'

export async function getCoderOrganizationId(): Promise<string> {
    const responseJson = await coderFetch<unknown>(coderOrgsPath(), {
        errorMessage: 'Failed to fetch organization data from Coder API',
    })

    // Coder API returns inconsistent response structures
    let organizations = responseJson

    if (typeof responseJson === 'object' && responseJson !== null && 'data' in responseJson) {
        organizations = (responseJson as { data: unknown }).data
    } else if (typeof responseJson === 'object' && responseJson !== null && 'organizations' in responseJson) {
        organizations = (responseJson as { organizations: unknown }).organizations
    }

    if (!Array.isArray(organizations)) {
        if (typeof responseJson === 'object' && responseJson !== null) {
            const arrayValues = Object.values(responseJson).filter(Array.isArray)
            if (arrayValues.length > 0) {
                organizations = arrayValues[0]
            } else {
                if (typeof responseJson === 'object') {
                    organizations = [responseJson]
                } else {
                    throw new Error('Failed to extract organizations array from response')
                }
            }
        } else {
            throw new Error('Failed to extract organizations array from response')
        }
    }

    const foundOrg = (organizations as CoderBaseEntity[]).find((org) => org.name === 'coder')
    if (!foundOrg) {
        throw new Error('Coder organization not found')
    }
    return foundOrg.id
}

export async function getCoderTemplateId(): Promise<string> {
    const coderTemplate = await getConfigValue('CODER_TEMPLATE')

    const responseJson = await coderFetch<unknown>(coderTemplateId(), {
        errorMessage: 'Failed to fetch templates data from Coder API',
    })

    const templates = Array.isArray(responseJson)
        ? responseJson
        : (responseJson as { data?: unknown }).data || responseJson

    if (!Array.isArray(templates)) {
        throw new Error('Failed to extract templates array from response')
    }

    const foundTemplate = templates.find((template: CoderBaseEntity) => template.name === coderTemplate)
    if (!foundTemplate) {
        throw new Error(`Template with name '${coderTemplate}' not found`)
    }
    return foundTemplate.id
}
