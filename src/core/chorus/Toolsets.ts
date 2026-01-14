import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
    StdioClientTransportChorus,
    StdioServerParameters,
} from "@core/chorus/MCPStdioTauri";
import {
    GlobeIcon,
    TerminalIcon,
    GithubIcon,
    SlackIcon,
    AppleIcon,
    MessageCircleIcon,
    WrenchIcon,
    CodeIcon,
    ImageIcon,
} from "lucide-react";
import React from "react";
import _ from "lodash";
import { SiElevenlabs, SiStripe, SiSupabase } from "react-icons/si";

/**
 * ### Notes on the Toolsets system
 *
 * -   **Clean Separation**: Clear distinction between user-facing tools (`UserTool`) and server implementation details (`ServerTool`).
 * -   **Configurable Registration**: Toolsets support different registration modes:
 *   -   `all`: Register all tools from a server
 *   -   `none`: Don't register any tools automatically
 *   -   `filter`: Use custom predicate to determine which tools to register
 *   -   `select`: Explicitly include only specific tools
 * -   **Naming Flexibility**: Support for renaming server tools when exposing them in the UI
 * -   **Implementation Independence**: Tool implementations can be backed by MCP servers or custom code
 * -   **Singleton Management**: Toolsets are managed by a central `ToolsetsManager` singleton
 * -   **Stateful Connections**: MCP servers maintain connections and are started/stopped as needed
 * -   **Tool Discovery**: Automatic tool discovery from MCP servers
 * -   **Execution Flow**: LLM tool calls are routed through `ToolsetsManager` to the appropriate toolset
 */

export const TOOL_CALL_INTERRUPTED_MESSAGE = "Tool call interrupted";

// THIS DATA STRUCTURE IS SERIALIZED INTO THE DATABASE. DO NOT EDIT EXISTING FIELDS AND DO NOT ADD NEW REQUIRED FIELDS.
export type UserToolCall = {
    /**
     * A unique identifier for this specific tool call instance.
     * Needed to correlate the call with its response.
     */
    id: string;

    /**
     * The name of the tool to be called.
     */
    namespacedToolName: string;

    /**
     * The arguments for the tool, expected to be a JSON-compatible object
     * conforming to the tool's inputSchema from MCP.
     */
    args: unknown;

    /**
     * Metadata from the tool definition. Same as what the model saw. We save this for posterity/debugging.
     */
    toolMetadata?: {
        description?: string;
        inputSchema?: Record<string, unknown>;
    };
};

// THIS DATA STRUCTURE IS SERIALIZED INTO THE DATABASE. DO NOT EDIT EXISTING FIELDS AND DO NOT ADD NEW REQUIRED FIELDS.
export type UserToolResult = {
    id: string;

    /**
     * DEPRECATED DO NOT USE
     */
    namespacedToolName?: string;

    content: string;
};

/**
 * Tool definition (user- and llm-facing interface)
 */
export interface UserTool {
    toolsetName: string; // e.g., in a tool known to llm as files_read, this is "files"
    displayNameSuffix: string; // e.g., in a tool known to llm as files_read, this is "read"
    description?: string;
    inputSchema: Record<string, unknown>; // JSON schema (https://json-schema.org/understanding-json-schema/basics)
}

/**
 * Server-specific tool definition
 */
export interface ServerTool {
    nameOnServer: string;
    description?: string;
    inputSchema: Record<string, unknown>;
}

/**
 * How tools are executed (implementation detail)
 */
export interface ToolImplementation {
    execute(args: Record<string, unknown>): Promise<string>;
}

export function getUserToolNamespacedName(tool: UserTool): string {
    return `${tool.toolsetName}_${tool.displayNameSuffix}`;
}

export function parseUserToolNamespacedName(name: string): {
    toolsetName: string;
    displayNameSuffix: string;
} {
    const splitIndex = name.indexOf("_");
    const toolsetName = name.slice(0, splitIndex);
    const displayNameSuffix = name.slice(splitIndex + 1);
    return {
        toolsetName,
        displayNameSuffix,
    };
}

export type MCPParameter = {
    id: string;
    displayName: string;
    type: string;
};

/**
 * Controls all toolsets, built-in and custom
 */
export type ToolsetConfig = {
    [toolsetName: string]: Record<string, string>;
};

export type ToolPermissionType = "always_allow" | "always_deny" | "ask";

export type CustomToolsetConfig = {
    name: string;
    command: string;
    args: string;
    env: string;
    defaultPermission?: ToolPermissionType;
};

export type ToolPermission = {
    toolsetName: string;
    toolName: string;
    permissionType: ToolPermissionType;
    lastAskedAt?: Date;
    lastResponse?: "allow" | "deny";
};

export type ToolsetStatus =
    | { status: "running" }
    | { status: "starting" }
    | { status: "stopped" };

function configsEqual(
    a: Record<string, string> | undefined,
    b: Record<string, string> | undefined,
) {
    if (!a || !b) {
        return false;
    }
    return (
        Object.keys(a).every((key) => a[key] === b[key]) &&
        Object.keys(b).every((key) => a[key] === b[key])
    );
}

type MCPContentBlock =
    | { type: "text"; text: string }
    | { type: "image"; image: string }
    | { type: "audio"; audio: string };

export function getToolsetIcon(toolsetName: string): React.ReactNode {
    if (!toolsetName) {
        console.error("Toolset name is undefined");
        return React.createElement(WrenchIcon, {
            className: "w-3 h-3",
        });
    }

    const name = toolsetName.toLowerCase();

    if (name === "web") {
        return React.createElement(GlobeIcon, {
            className: "w-3 h-3",
        });
    }
    if (name === "web_search")
        return React.createElement(GlobeIcon, {
            className: "w-3 h-3",
        });
    if (name === "web_fetch")
        return React.createElement(GlobeIcon, {
            className: "w-3 h-3",
        });
    if (name === "terminal")
        return React.createElement(TerminalIcon, {
            className: "w-3 h-3",
        });
    if (name === "coder")
        return React.createElement(CodeIcon, {
            className: "w-3 h-3",
        });
    if (name === "images")
        return React.createElement(ImageIcon, {
            className: "w-3 h-3",
        });
    if (name === "github")
        return React.createElement(GithubIcon, {
            className: "w-3 h-3",
        });
    if (name === "slack")
        return React.createElement(SlackIcon, {
            className: "w-3 h-3",
        });
    if (name === "mac")
        return React.createElement(AppleIcon, {
            className: "w-3 h-3",
        });
    if (name === "messages")
        return React.createElement(MessageCircleIcon, {
            className: "w-3 h-3",
        });

    if (name === "elevenlabs")
        return React.createElement(SiElevenlabs, {
            className: "w-3 h-3",
        });
    if (name === "stripe")
        return React.createElement(SiStripe, {
            className: "w-3 h-3",
        });
    if (name === "supabase")
        return React.createElement(SiSupabase, {
            className: "w-3 h-3",
        });
    if (name === "replicate")
        return React.createElement("img", {
            src: "/replicate.png",
            className: "w-3 h-3 rounded-md",
            alt: "Replicate logo",
        });
    if (name === "context7")
        return React.createElement("img", {
            src: "/context7.png",
            className: "w-3 h-3 rounded-lg",
            alt: "Context7 logo",
        });
    // Default icon for other tools
    return React.createElement(WrenchIcon, {
        className: "w-3 h-3",
    });
}

/**
 * MCPServer manages the connection to a Model Context Protocol server.
 * It handles establishing the connection, listing available tools, and executing tool calls.
 */
export abstract class MCPServer {
    private mcp: Client;
    private transport: Transport | null = null;
    private _status: ToolsetStatus = { status: "stopped" };
    private _logs: string = ""; // accumulated logs
    private activeConfig?: Record<string, string> = undefined;

    constructor() {
        this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
    }

    async listTools() {
        try {
            const toolsResult = await this.mcp.listTools();
            return toolsResult.tools.map((tool) => ({
                nameOnServer: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
            }));
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            console.error(`Error listing tools: ${errorMessage}`);
            this._logs += `[Error on listTools: ${errorMessage}]\n`;
            return [];
        }
    }

    /**
     * Starts the MCP server with the given configuration.
     * If the server is already running with the same configuration, this is a no-op.
     * @param config The configuration to use
     */
    async ensureStart(config: Record<string, string>): Promise<boolean> {
        if (!configsEqual(this.activeConfig, config)) {
            await this.ensureStop();
        }

        if (this._status.status !== "stopped") {
            // technically, we'd want to wait until it's running, but
            // this is good enough for now
            return true;
        }

        console.info("Starting MCP server", config);
        this._status = { status: "starting" };
        this._logs = ""; // clear any previous logs

        try {
            console.log("starting mcp server");
            const serverParams = this.getExecutionParameters(config);

            this.mcp.onerror = (error: Error) => {
                console.log("[Toolset] MCP server error", error);
                this._logs += error.message + "\n";
            };

            this.mcp.onclose = () => {
                console.log("[Toolset] MCP server closed");
                this._status = {
                    status: "stopped",
                };
            };

            const transport = new StdioClientTransportChorus(serverParams);
            this.transport = transport;
            await this.mcp.connect(this.transport);

            this.activeConfig = config;
            this._status = {
                status: "running",
            };
            return true;
        } catch (e) {
            console.error("Error starting MCP server: ", e);
            void this.transport?.close();
            this._status = {
                status: "stopped",
            };
            return false;
        }
    }

    /**
     * Stops the MCP server if it's running.
     */
    async ensureStop(): Promise<void> {
        if (this._status.status === "stopped") {
            return;
        }

        console.info("Stopping MCP server");
        this._status = { status: "stopped" };

        try {
            await this.mcp.close();
            await this.transport?.close();
        } catch (e) {
            console.error("Error stopping MCP server: ", e);
            this._logs += (e as Error).message + "\n";
        }

        this.transport = null;
        this.activeConfig = undefined;
    }

    /**
     * Executes a tool call using this MCP server.
     * @param toolCall The tool call to execute
     * @returns The result of the tool call
     */
    async executeToolCall(
        originalName: string,
        args: Record<string, unknown>,
    ): Promise<string> {
        if (this._status.status !== "running") {
            throw new Error(`MCP server is not running`);
        }

        const result = await this.mcp.callTool({
            name: originalName,
            arguments: args,
        });

        try {
            // for now, we only support text content getting returned
            return (result.content as MCPContentBlock[])
                .filter((block) => block.type === "text")
                .map((block) => block.text)
                .join("\n");
        } catch {
            return JSON.stringify(result.content);
        }
    }

    /**
     * Returns the current status of the MCP server.
     */
    get status(): ToolsetStatus {
        return this._status;
    }

    /**
     * Returns the accumulated logs from the MCP server.
     */
    get logs(): string {
        return this._logs;
    }

    /**
     * To be implemented by subclasses to provide the execution parameters for the MCP binary.
     * @param config The configuration to use
     */
    protected abstract getExecutionParameters(
        config: Record<string, string>,
    ): StdioServerParameters;
}

/**
 * Implementation that forwards to an MCP server
 */
class ServerToolImplementation implements ToolImplementation {
    constructor(
        private server: MCPServer,
        private nameOnServer: string,
    ) {}

    async execute(args: Record<string, unknown>): Promise<string> {
        return await this.server.executeToolCall(this.nameOnServer, args);
    }
}

/**
 * Implementation that uses a custom function
 */
class CustomToolImplementation implements ToolImplementation {
    constructor(
        private implementFn: (args: Record<string, unknown>) => Promise<string>,
    ) {}

    async execute(args: Record<string, unknown>): Promise<string> {
        return await this.implementFn(args);
    }
}

/**
 * Options for auto-registering tools from a server
 */
export type ToolRegistrationOption =
    | { mode: "all" }
    | { mode: "none" }
    | { mode: "filter"; filter: (tool: ServerTool) => boolean }
    | { mode: "select"; include: string[] };

/**
 * A toolset is a collection of tools that accessible as UserTool.
 */
export class Toolset {
    private toolRegistry = new Map<
        string,
        {
            tool: UserTool;
            implementation: ToolImplementation;
        }
    >();
    private servers: MCPServer[] = [];
    protected _status: ToolsetStatus = { status: "stopped" };

    constructor(
        public readonly name: string, // used to namespace tool names. alphanumeric only, must not contain special characters.
        public readonly displayName: string, // shown to the user in the tools box
        public readonly config: Record<string, MCPParameter> = {},
        public readonly description?: string,
        public readonly link?: string,
        public readonly isBuiltIn = true, // we suppress errors in the UI if it's built in
    ) {}

    // Map to store registration options for each server
    private _serverRegistrationOptions = new Map<
        MCPServer,
        {
            registration: ToolRegistrationOption;
            renameMap?: Record<string, string>;
            descriptionMap?: Record<string, string>;
        }
    >();

    /**
     * Add an MCP server to this toolset with options for auto-registering its tools
     * @param server The MCP server to add
     * @param registration How to register tools from this server:
     *   - "all": Register all tools from the server (default)
     *   - "none": Don't register any tools automatically
     *   - { mode: "filter", filter: fn }: Register tools that pass the filter function
     *   - { mode: "select", include: ["tool1", "tool2"] }: Register only the specified tools
     * @param renameMap Optional mapping of server tool names to toolset tool IDs
     * @param descriptionMap Optional mapping of server tool names to custom descriptions
     */
    addServer(
        server: MCPServer,
        registration: ToolRegistrationOption = { mode: "all" },
        renameMap?: Record<string, string>,
        descriptionMap?: Record<string, string>,
    ): void {
        this.servers.push(server);

        // Store the registration options for this server
        this._serverRegistrationOptions.set(server, {
            registration,
            renameMap,
            descriptionMap,
        });
    }

    /**
     * Import tools from a server with optional filtering, renaming, and description overrides
     */
    importServerTools(
        server: MCPServer,
        serverTools: ServerTool[],
        options?: {
            renameMap?: Record<string, string>;
            descriptionMap?: Record<string, string>;
        },
    ): void {
        for (const serverTool of serverTools) {
            const id =
                options?.renameMap?.[serverTool.nameOnServer] ||
                serverTool.nameOnServer;

            const toolWithOverrides: ServerTool = {
                ...serverTool,
                description:
                    options?.descriptionMap?.[serverTool.nameOnServer] ??
                    serverTool.description,
            };

            this.registerServerTool(id, server, toolWithOverrides);
        }
    }

    /**
     * Register a specific server tool with this toolset
     */
    registerServerTool(
        displayNameSuffix: string,
        server: MCPServer,
        serverTool: ServerTool,
    ): void {
        const tool: UserTool = {
            toolsetName: this.name,
            displayNameSuffix,
            description: serverTool.description,
            inputSchema: serverTool.inputSchema,
        };

        this.toolRegistry.set(displayNameSuffix, {
            tool,
            implementation: new ServerToolImplementation(
                server,
                serverTool.nameOnServer,
            ),
        });
    }

    /**
     * Add a custom tool with custom implementation
     */
    addCustomTool(
        displayNameSuffix: string,
        schema: Record<string, unknown>,
        implementation: (args: Record<string, unknown>) => Promise<string>,
        description?: string,
    ): void {
        const tool: UserTool = {
            toolsetName: this.name,
            displayNameSuffix,
            description,
            inputSchema: schema,
        };

        this.toolRegistry.set(displayNameSuffix, {
            tool,
            implementation: new CustomToolImplementation(implementation),
        });
    }

    /**
     * Execute a tool by ID
     */
    async executeTool(
        userToolDisplayNameSuffix: string,
        args: Record<string, unknown>,
    ): Promise<string> {
        const entry = this.toolRegistry.get(userToolDisplayNameSuffix);
        if (!entry)
            throw new Error(
                `Tool ${userToolDisplayNameSuffix} not found in toolset ${this.name}`,
            );

        return await entry.implementation.execute(args);
    }

    /**
     * Get the status of this toolset
     */
    get status(): ToolsetStatus {
        return this._status;
    }

    get logs(): string {
        return this.servers.map((server) => server.logs).join("\n");
    }

    /**
     * Start all servers with the given configuration and auto-register tools
     * based on registration options
     */
    async ensureStart(config: Record<string, string>): Promise<boolean> {
        if (this._status.status === "running") {
            return true;
        }

        this._status = {
            status: "starting",
        };

        // Start all servers in parallel
        const allStarted = _.every(
            await Promise.all(
                this.servers.map((server) => server.ensureStart(config)),
            ),
            Boolean,
        );

        if (!allStarted) {
            console.error(
                `Failed to start all servers for toolset ${this.name}`,
            );
            return false;
        }

        // Auto-register tools based on registration options
        for (const server of this.servers) {
            const options = this._serverRegistrationOptions.get(server);

            // Skip if no registration options or explicitly set to none
            if (!options || options.registration.mode === "none") {
                continue;
            }

            // Get all tools from the server
            const serverTools = await server.listTools();

            // Apply registration options
            let filteredTools: ServerTool[] = serverTools;

            if (options.registration.mode === "filter") {
                // Filter tools using the provided filter function
                filteredTools = serverTools.filter(options.registration.filter);
            } else if (options.registration.mode === "select") {
                // Only include tools in the include list
                const selectedTools = options.registration.include;
                filteredTools = serverTools.filter((serverTool) =>
                    selectedTools.includes(serverTool.nameOnServer),
                );
            }

            // Import the filtered tools with any rename mappings and description overrides
            this.importServerTools(server, filteredTools, {
                renameMap: options.renameMap,
                descriptionMap: options.descriptionMap,
            });
        }

        this._status = {
            status: "running",
        };

        return true;
    }

    /**
     * Stop all servers
     */
    async ensureStop(): Promise<void> {
        await Promise.all(this.servers.map((server) => server.ensureStop()));
        this._status = {
            status: "stopped",
        };
    }

    /**
     * Get all tools in this toolset
     */
    listTools(): UserTool[] {
        return this.status.status === "running"
            ? Array.from(this.toolRegistry.values()).map((entry) => entry.tool)
            : [];
    }

    public areRequiredParamsFilled(
        configs: ToolsetConfig | undefined,
    ): boolean {
        return Object.values(this.config).every((p: MCPParameter) => {
            const paramValue = configs?.[this.name]?.[p.id];
            return paramValue !== undefined && paramValue !== "";
        });
    }
}

export function getEnvFromJSON(
    json: string | undefined,
): Record<string, string> | { _type: "error"; error: string } {
    const env: Record<string, string> = {};
    try {
        const envConfig: unknown = JSON.parse(json ?? "{}");
        if (typeof envConfig !== "object") {
            return { _type: "error", error: "Env must be an object" };
        }
        if (envConfig === null) {
            return { _type: "error", error: "Env must be not be null" };
        }
        for (const [key, value] of Object.entries(envConfig)) {
            if (typeof value !== "string") {
                return { _type: "error", error: "All values must be strings" };
            }
            env[key] = value;
        }
        return env;
    } catch (e) {
        return { _type: "error", error: (e as Error).message };
    }
}
