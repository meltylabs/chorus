/**
 * This file copied out of @modelcontextprotocol/sdk
 * and modified to work with Tauri.
 */

import {
    ReadBuffer,
    serializeMessage,
} from "@modelcontextprotocol/sdk/shared/stdio.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { Child, Command } from "@tauri-apps/plugin-shell";

export type StdioServerParameters =
    | {
          type: "sidecar";
          sidecarBinary: string; // like "binaries/mcp-desktopcommander"
          args?: string[];
          env?: Record<string, string>;
      }
    | {
          type: "custom";
          command: string; // command to run
          args?: string[];
          env?: Record<string, string>;
      };

/**
 * Environment variables to inherit by default, if an environment is not explicitly given.
 */
export const DEFAULT_INHERITED_ENV_VARS =
    process.platform === "win32"
        ? [
              "APPDATA",
              "HOMEDRIVE",
              "HOMEPATH",
              "LOCALAPPDATA",
              "PATH",
              "PROCESSOR_ARCHITECTURE",
              "SYSTEMDRIVE",
              "SYSTEMROOT",
              "TEMP",
              "USERNAME",
              "USERPROFILE",
          ]
        : /* list inspired by the default env inheritance of sudo */
          ["HOME", "LOGNAME", "PATH", "SHELL", "TERM", "USER"];

/**
 * Returns a default environment object including only environment variables deemed safe to inherit.
 */
export function getDefaultEnvironment(): Record<string, string> {
    const env: Record<string, string> = {};

    for (const key of DEFAULT_INHERITED_ENV_VARS) {
        const value = process.env[key];
        if (value === undefined) {
            continue;
        }

        if (value.startsWith("()")) {
            // Skip functions, which are a security risk.
            continue;
        }

        env[key] = value;
    }

    return env;
}

/**
 * Client transport for stdio: this will connect to a server by spawning a process and communicating with it over stdin/stdout.
 *
 * This transport is only available in Node.js environments.
 */
export class StdioClientTransportChorus implements Transport {
    private _process?: Child; // changed from ChildProcess to Child
    private _command?: Command<string>;
    private _abortController: AbortController = new AbortController();
    private _readBuffer: ReadBuffer = new ReadBuffer();
    private _serverParams: StdioServerParameters;

    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (message: JSONRPCMessage) => void;
    onstderr?: (data: string) => void;

    constructor(server: StdioServerParameters) {
        this._serverParams = server;
    }

    /**
     * Starts the server process and prepares to communicate with it.
     */
    async start(): Promise<void> {
        if (this._process) {
            throw new Error(
                "StdioClientTransport already started! If using Client class, note that connect() calls start() automatically.",
            );
        }

        const env = {
            ...getDefaultEnvironment(),
            ...(this._serverParams.env ?? {}),
        };

        this._command =
            this._serverParams.type === "sidecar"
                ? Command.sidecar(
                      this._serverParams.sidecarBinary,
                      this._serverParams.args ?? [],
                      {
                          env,
                      },
                  )
                : Command.sidecar(
                      "binaries/run-mcp",
                      [
                          this._serverParams.command,
                          ...(this._serverParams.args ?? []),
                      ],
                      {
                          env,
                      },
                  );

        // this._process = spawn(
        //     this._serverParams.command,
        //     this._serverParams.args ?? [],
        //     {
        //         env: this._serverParams.env ?? getDefaultEnvironment(),
        //         stdio: [
        //             "pipe",
        //             "pipe",
        //             this._serverParams.stderr ?? "inherit",
        //         ],
        //         shell: false,
        //         signal: this._abortController.signal,
        //         windowsHide: process.platform === "win32" && isElectron(),
        //         cwd: this._serverParams.cwd,
        //     },
        // );

        this._command.on("error", (error) => {
            const err = new Error(error);
            this.onerror?.(err);
        });

        this._command.on("close", (_code) => {
            this._process = undefined;
            this.onclose?.();
        });

        // this._process.stdin?.on("error", (error) => {
        //     this.onerror?.(error);
        // });

        this._command.stdout?.on("data", (chunk) => {
            this._readBuffer.append(Buffer.from(chunk));
            this.processReadBuffer();
        });

        this._command.stderr?.on("data", (chunk) => {
            this.onstderr?.(chunk);
        });

        // this._command.stdout?.on("error", (error) => {
        //     this.onerror?.(error);
        // });

        this._process = await this._command.spawn();

        console.log("[MCPStdioTauri] Started server");
    }

    private processReadBuffer() {
        while (true) {
            try {
                const message = this._readBuffer.readMessage();
                if (message === null) {
                    break;
                }
                console.log("Received message:", message);
                this.onmessage?.(message);
            } catch (error) {
                this.onerror?.(error as Error);
            }
        }
    }

    async close(): Promise<void> {
        this._abortController.abort();

        try {
            await this._process?.kill();
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            this.onerror?.(
                new Error(`Failed to kill MCP process: ${errorMessage}`),
            );
        }

        this._process = undefined;
        this._command = undefined;
        this._readBuffer.clear();
        return Promise.resolve();
    }

    async send(message: JSONRPCMessage): Promise<void> {
        console.log("Sending message:", message);
        const json = serializeMessage(message);
        await this._process?.write(json);
    }
}
