export type CoderBaseEntity = {
    id: string
    name: string
}

// Branded string ids so the compiler rejects passing e.g. an AgentId where a BuildId is required.
// The brand is phantom: at runtime these are plain strings.
declare const coderIdBrand: unique symbol
type Brand<T, B extends string> = T & { readonly [coderIdBrand]: B }

export type WorkspaceId = Brand<string, 'WorkspaceId'>
export type BuildId = Brand<string, 'BuildId'>
export type AgentId = Brand<string, 'AgentId'>
export type CoderUsername = Brand<string, 'CoderUsername'>

export type WorkspaceStatus =
    | 'canceled'
    | 'canceling'
    | 'deleted'
    | 'deleting'
    | 'failed'
    | 'pending'
    | 'running'
    | 'starting'
    | 'stopped'
    | 'stopping'
    | 'unknown'

export type JobStatus = 'canceled' | 'canceling' | 'failed' | 'pending' | 'running' | 'succeeded' | 'unknown'

export type BuildTransition = 'start' | 'stop' | 'delete'

export type AgentLifecycleState =
    | 'created'
    | 'starting'
    | 'start_timeout'
    | 'start_error'
    | 'ready'
    | 'shutting_down'
    | 'shutdown_timeout'
    | 'shutdown_error'
    | 'off'

export type AgentStatus = 'connecting' | 'connected' | 'disconnected' | 'timeout'

export type AppHealth = 'disabled' | 'initializing' | 'healthy' | 'unhealthy'

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

export interface CoderWorkspaceEvent {
    latest_build?: {
        id?: BuildId
        resources?: CoderResource[]
        status?: WorkspaceStatus
    }
}

export interface CoderResource {
    agents?: CoderAgent[]
}

export interface CoderAgent {
    id?: AgentId
    lifecycle_state?: AgentLifecycleState
    status?: AgentStatus
    apps?: CoderApp[]
}

export interface CoderWorkspaceBuild {
    status: WorkspaceStatus
    job?: {
        status: JobStatus
        error?: string
    }
}

// The level key differs between the build and agent endpoints, so accept either.
export interface CoderLog {
    id: number
    created_at: string
    output: string
}

// The template provisions exactly one agent; getCoderWorkspaceLaunchStatus throws if Coder reports more.
export interface WorkspaceAgentStatus {
    lifecycle: AgentLifecycleState | null
    status: AgentStatus | null
    codeServer: AppHealth | null
}

export interface WorkspaceLaunchStatus {
    buildStatus: WorkspaceStatus
    buildLogLines: string[]
    agentStatus: WorkspaceAgentStatus | null
    agentLogLines: string[]
    ready: boolean
    failed: boolean
    reason: string
    cursors: { build: number | null; agent: number | null }
    url: string | null
}

export interface CoderApp {
    slug: string
    health?: AppHealth
}

export interface CoderUserQueryResponse {
    users: CoderUser[]
}

export interface CoderUser {
    username: CoderUsername
}

export interface CoderWorkspace {
    id: WorkspaceId
    latest_build?: {
        status: WorkspaceStatus
    }
}
