export type CoderBaseEntity = {
    id: string
    name: string
}

// Branded (nominal) string identifiers, so a function signature makes clear which kind of id it
// expects and the compiler rejects passing e.g. an AgentId where a BuildId is required. The brand
// is phantom (type-only) — at runtime these are plain strings; construct them via a typed
// `coderFetch<T>` response or an explicit cast.
declare const coderIdBrand: unique symbol
type Brand<T, B extends string> = T & { readonly [coderIdBrand]: B }

export type WorkspaceId = Brand<string, 'WorkspaceId'>
export type BuildId = Brand<string, 'BuildId'>
export type AgentId = Brand<string, 'AgentId'>
export type CoderUsername = Brand<string, 'CoderUsername'>

// Coder workspace build status (the computed workspace state) and provisioner job status.
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
    | 'unknown' // Not defined as part of Coder API, but used internally

export type JobStatus = 'canceled' | 'canceling' | 'failed' | 'pending' | 'running' | 'succeeded' | 'unknown'

export type BuildTransition = 'start' | 'stop' | 'delete'

// Coder agent lifecycle (provisioning/boot) and connection status.
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
        // workspace_owner_name?: string // unused
        // workspace_name?: string // unused
    }
    // id?: WorkspaceId // unused
    // url?: string // unused
    // message?: string // unused
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
    id: BuildId
    status: WorkspaceStatus
    job?: {
        status: JobStatus
        error?: string
    }
    // transition?: BuildTransition // unused
    // resources?: CoderResource[] // unused
}

// A workspace-scoped rich parameter value, as sent on build creation and returned by
// the build parameters endpoint.
export interface CoderBuildParameter {
    name: string
    value: string
}

// Build (provisioner) and agent logs share the fields we read; the level key differs
// between the two endpoints, so accept either.
export interface CoderLog {
    id: number
    created_at: string
    output: string
    // log_level?: LogLevel // unused
    // level?: LogLevel // unused
}

// The single workspace agent's lifecycle/connection/code-server health. The template provisions
// exactly one agent; getCoderWorkspaceLaunchStatus throws if Coder ever reports more.
export interface WorkspaceAgentStatus {
    lifecycle: AgentLifecycleState | null
    status: AgentStatus | null
    codeServer: AppHealth | null
}

export interface WorkspaceLaunchStatus {
    buildStatus: WorkspaceStatus
    // New log lines fetched this poll (since the cursor); the client accumulates them into a full log.
    buildLogLines: string[]
    agentStatus: WorkspaceAgentStatus | null
    agentLogLines: string[]
    ready: boolean
    failed: boolean
    reason: string
    cursors: { build: number | null; agent: number | null } // last log id seen per stream
    url: string | null
}

export interface CoderApp {
    slug: string // "code-server"
    health?: AppHealth
}

export interface CoderUserQueryResponse {
    users: CoderUser[]
}

export interface CoderUser {
    username: CoderUsername
    // id: string // unused
    // email: string // unused
    // name: string // unused
    // status: string // unused
}

export interface CoderWorkspace {
    id: WorkspaceId
    latest_build?: {
        id?: BuildId
        status: WorkspaceStatus
        // resources?: CoderResource[] // unused
    }
    // name: string // unused
    // owner_id: string // unused
}
