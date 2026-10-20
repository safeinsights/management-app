import { describe, expect, it } from '@/tests/unit.helpers'
import {
    sentryDeployAttributes,
    sentryDeployOptions,
    sentryDeployOptionsFromDocument,
    sentryDeployOptionsFromEnv,
} from './sentry-deploy'

describe('sentryDeployOptions', () => {
    it('passes deployed values through', () => {
        expect(sentryDeployOptions('staging', 'v1.6.9')).toEqual({ environment: 'staging', release: 'v1.6.9' })
    })

    it('falls back when a value is missing or empty', () => {
        const fallback = { environment: 'development', release: 'unknown' }
        expect(sentryDeployOptions(undefined, null)).toEqual(fallback)
        expect(sentryDeployOptions('', '')).toEqual(fallback)
    })

    it('reads the runtime environment id and release tag', () => {
        expect(sentryDeployOptionsFromEnv({ ENVIRONMENT_ID: 'dev', RELEASE_TAG: 'a6ac032' })).toEqual({
            environment: 'dev',
            release: 'a6ac032',
        })
    })
})

describe('sentry deploy attributes', () => {
    it('renders the runtime values as html attributes', () => {
        expect(sentryDeployAttributes({ ENVIRONMENT_ID: 'dev', RELEASE_TAG: 'a6ac032' })).toEqual({
            'data-sentry-environment': 'dev',
            'data-sentry-release': 'a6ac032',
        })
    })

    it('leaves the attributes unset outside a deployment', () => {
        expect(sentryDeployAttributes({})).toEqual({
            'data-sentry-environment': undefined,
            'data-sentry-release': undefined,
        })
    })

    it('reads back the values the server rendered', () => {
        const root = document.createElement('html')
        const attributes = sentryDeployAttributes({ ENVIRONMENT_ID: 'production', RELEASE_TAG: 'v1.6.8' })
        Object.entries(attributes).forEach(([name, value]) => root.setAttribute(name, value ?? ''))

        expect(sentryDeployOptionsFromDocument(root)).toEqual({ environment: 'production', release: 'v1.6.8' })
    })

    it('falls back when the page carries no attributes', () => {
        expect(sentryDeployOptionsFromDocument(document.createElement('html'))).toEqual({
            environment: 'development',
            release: 'unknown',
        })
    })
})
