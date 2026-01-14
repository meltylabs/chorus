/**
 * Skill Manager
 *
 * Central coordinator for the skill system. Handles:
 * - Skill discovery and loading
 * - State management (enabled/disabled, invocation mode)
 * - State persistence
 * - Event emission for state changes
 */

import { emit } from "@tauri-apps/api/event";
import { getStore } from "@core/infra/Store";
import { ISkill, ISkillState } from "./SkillTypes";
import { discoverSkills, clearSkillCache } from "./SkillDiscovery";

/**
 * Storage schema for persisted skill states.
 */
export interface ISkillStorageState {
    [skillId: string]: {
        enabled: boolean;
        invocationMode: "auto" | "manual";
        lastUsed?: string;
    };
}

/**
 * Event name for skill changes.
 */
export const SKILLS_CHANGED_EVENT = "skills-changed";

/**
 * Central manager for the skill system.
 * Singleton pattern - use SkillManager.getInstance() to access.
 */
export class SkillManager {
    private static instance: SkillManager;

    /** In-memory skill registry keyed by skill name */
    private skills: Map<string, ISkill> = new Map();

    /** In-memory state registry keyed by skill name */
    private states: Map<string, ISkillState> = new Map();

    /** Store name for persistence */
    private storeName = "skills.dat";

    /** Whether the manager has been initialized */
    private initialized = false;

    /** Current project path for discovery */
    private projectPath?: string;

    /** Private constructor for singleton */
    private constructor() {}

    /**
     * Gets the singleton instance of SkillManager.
     */
    public static getInstance(): SkillManager {
        if (!SkillManager.instance) {
            SkillManager.instance = new SkillManager();
        }
        return SkillManager.instance;
    }

    /**
     * Initializes the skill manager by discovering skills and loading persisted state.
     *
     * @param projectPath - Optional project path for project-level skill discovery
     */
    public async initialize(projectPath?: string): Promise<void> {
        this.projectPath = projectPath;

        // Load persisted states first
        const persistedStates = await this.loadPersistedStates();

        // Discover skills
        const discoveryResult = await discoverSkills(projectPath);

        // Clear existing data
        this.skills.clear();
        this.states.clear();

        // Populate skill registry
        for (const skill of discoveryResult.skills) {
            this.skills.set(skill.metadata.name, skill);

            // Initialize state from persisted data or defaults
            const persisted = persistedStates[skill.metadata.name];
            const state: ISkillState = {
                skillId: skill.metadata.name,
                enabled: persisted?.enabled ?? true, // Default to enabled
                invocationMode: persisted?.invocationMode ?? "auto", // Default to auto
                lastUsed: persisted?.lastUsed,
            };
            this.states.set(skill.metadata.name, state);
        }

        // Log any discovery errors
        if (discoveryResult.errors.length > 0) {
            console.warn(
                "Skill discovery errors:",
                discoveryResult.errors
            );
        }

        this.initialized = true;

        // Emit initial state
        await this.emitSkillsChanged();
    }

    /**
     * Refreshes skills by re-discovering and merging with current state.
     */
    public async refresh(): Promise<void> {
        // Clear discovery cache
        clearSkillCache();

        // Re-initialize
        await this.initialize(this.projectPath);
    }

    /**
     * Gets all discovered skills.
     */
    public getAllSkills(): ISkill[] {
        return Array.from(this.skills.values());
    }

    /**
     * Gets only enabled skills.
     */
    public getEnabledSkills(): ISkill[] {
        return Array.from(this.skills.values()).filter((skill) => {
            const state = this.states.get(skill.metadata.name);
            return state?.enabled ?? true;
        });
    }

    /**
     * Gets skills that are enabled and set to auto invocation mode.
     * These are skills that the AI should automatically consider using.
     */
    public getAutoSkills(): ISkill[] {
        return Array.from(this.skills.values()).filter((skill) => {
            const state = this.states.get(skill.metadata.name);
            return state?.enabled && state?.invocationMode === "auto";
        });
    }

    /**
     * Gets skills that are enabled and set to manual invocation mode.
     * These are skills that the user must explicitly invoke with /skill-name.
     */
    public getManualSkills(): ISkill[] {
        return Array.from(this.skills.values()).filter((skill) => {
            const state = this.states.get(skill.metadata.name);
            return state?.enabled && state?.invocationMode === "manual";
        });
    }

    /**
     * Gets a skill by its ID (name).
     */
    public getSkill(id: string): ISkill | undefined {
        return this.skills.get(id);
    }

    /**
     * Gets the state for a skill.
     */
    public getSkillState(id: string): ISkillState | undefined {
        return this.states.get(id);
    }

    /**
     * Enables a skill.
     */
    public async enableSkill(id: string): Promise<void> {
        const state = this.states.get(id);
        if (state) {
            state.enabled = true;
            await this.persistStates();
            await this.emitSkillsChanged();
        }
    }

    /**
     * Disables a skill.
     */
    public async disableSkill(id: string): Promise<void> {
        const state = this.states.get(id);
        if (state) {
            state.enabled = false;
            await this.persistStates();
            await this.emitSkillsChanged();
        }
    }

    /**
     * Toggles a skill's enabled state.
     */
    public async toggleSkill(id: string): Promise<void> {
        const state = this.states.get(id);
        if (state) {
            state.enabled = !state.enabled;
            await this.persistStates();
            await this.emitSkillsChanged();
        }
    }

    /**
     * Sets the invocation mode for a skill.
     */
    public async setInvocationMode(
        id: string,
        mode: "auto" | "manual"
    ): Promise<void> {
        const state = this.states.get(id);
        if (state) {
            state.invocationMode = mode;
            await this.persistStates();
            await this.emitSkillsChanged();
        }
    }

    /**
     * Records that a skill was used.
     */
    public async recordSkillUsage(id: string): Promise<void> {
        const state = this.states.get(id);
        if (state) {
            state.lastUsed = new Date().toISOString();
            await this.persistStates();
        }
    }

    /**
     * Gets the content (instructions) for a skill.
     */
    public getSkillContent(id: string): string | undefined {
        return this.skills.get(id)?.content;
    }

    /**
     * Gets the scripts for a skill.
     */
    public getSkillScripts(id: string): string[] {
        const skill = this.skills.get(id);
        return skill?.scripts.map((s) => s.absolutePath) ?? [];
    }

    /**
     * Gets the reference files for a skill.
     */
    public getSkillReferences(id: string): string[] {
        return this.skills.get(id)?.references ?? [];
    }

    /**
     * Checks if the manager has been initialized.
     */
    public isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Loads persisted skill states from storage.
     */
    private async loadPersistedStates(): Promise<ISkillStorageState> {
        try {
            const store = await getStore(this.storeName);
            const states = await store.get<ISkillStorageState>("skillStates");
            return states || {};
        } catch (error) {
            console.error("Failed to load skill states:", error);
            return {};
        }
    }

    /**
     * Persists current skill states to storage.
     */
    private async persistStates(): Promise<void> {
        try {
            const store = await getStore(this.storeName);
            const storageState: ISkillStorageState = {};

            for (const [id, state] of this.states) {
                storageState[id] = {
                    enabled: state.enabled,
                    invocationMode: state.invocationMode,
                    lastUsed: state.lastUsed,
                };
            }

            await store.set("skillStates", storageState);
            await store.save();
        } catch (error) {
            console.error("Failed to persist skill states:", error);
        }
    }

    /**
     * Emits a skills-changed event.
     */
    private async emitSkillsChanged(): Promise<void> {
        try {
            const payload = {
                skills: this.getAllSkills(),
                states: Object.fromEntries(this.states),
            };
            await emit(SKILLS_CHANGED_EVENT, payload);
        } catch (error) {
            console.error("Failed to emit skills-changed event:", error);
        }
    }

    /**
     * Resets the singleton instance (for testing).
     */
    public static resetInstance(): void {
        SkillManager.instance = undefined as unknown as SkillManager;
    }
}

/**
 * Convenience function to get the skill manager instance.
 */
export function getSkillManager(): SkillManager {
    return SkillManager.getInstance();
}
