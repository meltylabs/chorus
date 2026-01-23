import {
    UserToolCall,
    UserToolResult,
    Toolset,
    parseUserToolNamespacedName,
    CustomToolsetConfig,
    ToolPermissionType,
} from "./Toolsets";
import { CustomToolset } from "./toolsets/custom";
import { checkToolPermission } from "./api/ToolPermissionsAPI";
import { fetchAppMetadata } from "./api/AppMetadataAPI";
import {
    toolPermissionActions,
    ToolPermissionRequest,
} from "@core/infra/ToolPermissionStore";
import { v4 as uuidv4 } from "uuid";
import { ToolsetWeb } from "./toolsets/web";
import { ToolsetMedia } from "./toolsets/media";
// import { ToolsetSlack } from "./toolsets/slack";
import { ToolsetTerminal } from "./toolsets/terminal";
// import { ToolsetCoder } from "./toolsets/coder";
import { ToolsetGithub } from "./toolsets/github";
// import { ToolsetNotion } from "./toolsets/notion";
// import { ToolsetFiles } from "./toolsets/files";
// import { ToolsetMessages } from "./toolsets/messages";
import { ToolsetSkills } from "./toolsets/skills";

export class ToolsetsManager {
    private _builtInToolsets: Toolset[] = [];
    private _customToolsets: CustomToolset[] = [];

    private static _instance: ToolsetsManager | null = null;

    public static get instance() {
        if (!ToolsetsManager._instance) {
            ToolsetsManager._instance = new ToolsetsManager();

            ToolsetsManager._instance._builtInToolsets = [
                new ToolsetWeb(),
                // new ToolsetFiles(),
                new ToolsetTerminal(),
                new ToolsetMedia(),
                new ToolsetGithub(),
                // new ToolsetCoder(),
                // new ToolsetSlack(),
                // new ToolsetMessages(),
                // new ToolsetNotion(),
                new ToolsetSkills(),
            ];
        }

        return ToolsetsManager._instance;
    }

    private get toolsets() {
        return [...this._builtInToolsets, ...this._customToolsets];
    }

    /**
     * Executes a tool call using the appropriate MCP server
     */
    async executeToolCall(
        toolCall: UserToolCall,
        modelName?: string,
    ): Promise<UserToolResult> {
        const { toolsetName, displayNameSuffix } = parseUserToolNamespacedName(
            toolCall.namespacedToolName,
        );

        const toolset = this.listToolsets().find(
            (toolset) => toolset.name === toolsetName,
        );
        if (!toolset) {
            throw new Error(`Toolset ${toolsetName} not found`);
        }

        try {
            // Check if YOLO mode is enabled
            const appMetadata = await fetchAppMetadata();
            const yoloMode = appMetadata?.["yolo_mode"] === "true";

            if (yoloMode) {
                // YOLO mode - execute without asking
                const resultContent = await toolset.executeTool(
                    displayNameSuffix,
                    toolCall.args as Record<string, unknown>,
                );

                return {
                    id: toolCall.id,
                    content: resultContent,
                };
            }

            // Normal permission flow
            const customToolset = this._customToolsets.find(
                (t) => t.name === toolsetName,
            );
            const defaultPermission: ToolPermissionType = customToolset
                ? this.getCustomToolsetDefaultPermission(toolsetName) || "ask"
                : "ask";

            const permissionCheck = await checkToolPermission(
                toolsetName,
                displayNameSuffix,
                defaultPermission,
            );

            if (permissionCheck.shouldAsk) {
                // Create a permission request
                const permissionRequest: ToolPermissionRequest = {
                    id: uuidv4(),
                    toolsetName,
                    toolName: displayNameSuffix,
                    toolDescription: toolCall.toolMetadata?.description,
                    args: toolCall.args as Record<string, unknown>,
                    modelName: modelName || "Unknown Model",
                    timestamp: new Date(),
                };

                // Wait for user permission
                const permission =
                    await this.requestUserPermission(permissionRequest);

                if (!permission) {
                    return {
                        id: toolCall.id,
                        content: `<system_message>Tool execution denied by user</system_message>`,
                    };
                }
            } else if (!permissionCheck.isAllowed) {
                // Permission is always_deny
                return {
                    id: toolCall.id,
                    content: `<system_message>Tool execution denied by saved preference</system_message>`,
                };
            }

            // Permission granted, execute the tool
            const resultContent = await toolset.executeTool(
                displayNameSuffix,
                toolCall.args as Record<string, unknown>,
            );

            return {
                id: toolCall.id,
                content: resultContent,
            };
        } catch (error) {
            console.error("Error executing tool call", error);
            const message =
                error instanceof Error
                    ? error.message
                    : JSON.stringify(error).slice(0, 200);
            return {
                id: toolCall.id,
                content: `<system_message>Error executing tool call: ${message}</system_message>`,
            };
        }
    }

    private getCustomToolsetDefaultPermission(
        toolsetName: string,
    ): ToolPermissionType | null {
        // This would be fetched from the database
        const customConfig = this._customToolsets.find(
            (t) => t.name === toolsetName,
        );
        if (!customConfig) return null;

        // For now, return 'ask' as default
        // TODO: Fetch from database when custom toolset configs include defaultPermission
        return "ask";
    }

    private requestUserPermission(
        request: ToolPermissionRequest,
    ): Promise<boolean> {
        return new Promise((resolve) => {
            // Store the resolver so it can be called when user responds
            const requestWithResolver = {
                ...request,
                _resolver: resolve,
            };

            // Add the request to the store
            toolPermissionActions.addRequest(requestWithResolver);

            // The dialog will handle the user's response
        });
    }

    /**
     * Lists all MCP toolsets, whether enabled or disabled
     */
    listToolsets(): Toolset[] {
        return this.toolsets;
    }

    /**
     * Refreshes running toolsets, starting or stopping servers as needed
     */
    async refreshToolsets(
        toolsetsConfig: Record<string, Record<string, string>>,
        customToolsetConfigs: CustomToolsetConfig[],
    ) {
        // handle builtin toolsets
        await Promise.all(
            Object.entries(toolsetsConfig).map(
                async ([toolsetName, config]) => {
                    const toolset = this._builtInToolsets.find(
                        (t) => t.name === toolsetName,
                    );
                    if (!toolset) {
                        // could be a custom toolset. ignore it.
                        return;
                    }
                    if (config.enabled === "true") {
                        await toolset.ensureStart(config);
                    } else {
                        await toolset.ensureStop();
                    }
                },
            ),
        );

        // Auto-start the skills toolset if not explicitly configured
        // Skills toolset doesn't require external config and should auto-enable
        const skillsToolset = this._builtInToolsets.find(
            (t) => t.name === "skills",
        );
        if (skillsToolset && toolsetsConfig["skills"] === undefined) {
            await skillsToolset.ensureStart({});
        }

        // handle custom toolsets
        const removedToolsetConfigs = this._customToolsets.filter(
            (t) => !customToolsetConfigs.find((c) => c.name === t.name),
        );
        for (const customConfig of removedToolsetConfigs) {
            const existingToolsetIndex = this._customToolsets.findIndex(
                (t) => t.name === customConfig.name,
            );
            if (existingToolsetIndex !== -1) {
                await this._customToolsets[existingToolsetIndex].ensureStop();
                this._customToolsets.splice(existingToolsetIndex, 1);
            }
        }
        await Promise.all(
            customToolsetConfigs.map(async (customConfig) => {
                let toolset = this._customToolsets.find(
                    (t) => t.name === customConfig.name,
                );
                if (!toolset) {
                    toolset = new CustomToolset(customConfig.name);
                    this._customToolsets.push(toolset);
                }
                const config = {
                    command: customConfig.command,
                    args: customConfig.args,
                    env: customConfig.env,
                };
                if (toolsetsConfig[customConfig.name]?.enabled === "true") {
                    console.log("starting custom toolset", config);
                    await toolset.ensureStart(config);
                } else {
                    await toolset.ensureStop();
                }
            }),
        );
    }
}
