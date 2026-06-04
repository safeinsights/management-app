export type CoderBaseEntity = {
    id: string
    name: string
}

// Named aliases for the various Coder string identifiers, so a function signature makes clear
// which kind of id it expects (a build id vs an agent id vs a workspace id).
export type WorkspaceId = string
export type BuildId = string
export type AgentId = string
export type CoderUsername = string

// Coder workspace build status (the computed workspace state) and provisioner job status.
export type BuildStatus =
    | 'pending'
    | 'starting'
    | 'running'
    | 'stopping'
    | 'stopped'
    | 'succeeded'
    | 'canceling'
    | 'canceled'
    | 'failed'
    | 'unknown'

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
        status?: BuildStatus
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
    status: BuildStatus
    job?: {
        status: BuildStatus
        error?: string
    }
    // id: BuildId // unused
    // transition?: BuildTransition // unused
    // resources?: CoderResource[] // unused
}

// Build (provisioner) and agent logs share the fields we read; the level key differs
// between the two endpoints, so accept either.
export interface CoderLog {
    id: number
    created_at: string
    // output: string // unused
    // log_level?: LogLevel // unused
    // level?: LogLevel // unused
}

export type WorkspaceLaunchPhase = 'provisioning' | 'starting' | 'ready' | 'failed' | 'stopped' | 'unknown'

export interface WorkspaceLaunchStatus {
    phase: WorkspaceLaunchPhase
    buildStatus: BuildStatus
    ready: boolean
    failed: boolean
    reason: string
    lastLogAt: string | null
    cursors: { build: number | null; agents: Record<AgentId, number | null> }
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
        status: BuildStatus
        // resources?: CoderResource[] // unused
    }
    // name: string // unused
    // owner_id: string // unused
}
