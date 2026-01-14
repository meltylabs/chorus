/**
 * Skill Manager
 *
 * Central coordinator for the skill system. Handles:
 * - Skill discovery and loading
 * - State management (enabled/disabled, invocation mode)
 * - State persistence (with debouncing)
 * - Event emission for state changes
 */

import { emit } from "@tauri-apps/api/event";
import { getStore } from "@core/infra/Store";
import debounce from "lodash/debounce";
import { ISkill, ISkillState } from "./SkillTypes";
import { discoverSkills, clearSkillCache } from "./SkillDiscovery";

/**
 * Current storage schema version.
 */
const STORAGE_VERSION = 1;

/**
 * Per-skill storage data.
 */
export interface ISkillStorageEntry {
    enabled: boolean;
    invocationMode: "auto" | "manual";
    lastUsed?: string;
    useCount?: number;
}

/**
 * Storage schema for persisted skill states.
 */
export interface ISkillStorageData {
    version: number;
    skills: {
        [skillId: string]: ISkillStorageEntry;
    };
}

/**
 * Legacy storage format (pre-versioned).
 */
interface ILegacySkillStorageState {
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

    /** Debounced save function for performance */
    private debouncedPersist: () => void;

    /** Private constructor for singleton */
    private constructor() {
        // Debounce saves to avoid excessive writes
        this.debouncedPersist = debounce(() => {
            void this.persistStatesImmediate();
        }, 500);
    }

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
        const storageData = await this.loadStorageData();

        // Discover skills
        const discoveryResult = await discoverSkills(projectPath);

        // Clear existing data
        this.skills.clear();
        this.states.clear();

        // Populate skill registry
        for (const skill of discoveryResult.skills) {
            this.skills.set(skill.metadata.name, skill);

            // Initialize state from persisted data or defaults
            const persisted = storageData.skills[skill.metadata.name];
            const state: ISkillState = {
                skillId: skill.metadata.name,
                enabled: persisted?.enabled ?? true, // Default to enabled
                invocationMode: persisted?.invocationMode ?? "auto", // Default to auto
                lastUsed: persisted?.lastUsed,
                useCount: persisted?.useCount ?? 0,
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
            this.debouncedPersist();
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
            this.debouncedPersist();
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
            this.debouncedPersist();
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
            this.debouncedPersist();
            await this.emitSkillsChanged();
        }
    }

    /**
     * Records that a skill was used.
     * Updates lastUsed timestamp and increments useCount.
     */
    public recordSkillUsage(id: string): void {
        const state = this.states.get(id);
        if (state) {
            state.lastUsed = new Date().toISOString();
            state.useCount = (state.useCount ?? 0) + 1;
            this.debouncedPersist();
        }
    }

    /**
     * Gets the usage count for a skill.
     */
    public getSkillUseCount(id: string): number {
        return this.states.get(id)?.useCount ?? 0;
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
     * Loads storage data, handling migration from legacy formats.
     */
    private async loadStorageData(): Promise<ISkillStorageData> {
        try {
            const store = await getStore(this.storeName);

            // Try loading new versioned format first
            const data = await store.get<ISkillStorageData>("skillData");
            if (data && typeof data.version === "number") {
                return this.migrateStorageData(data);
            }

            // Try loading legacy format (pre-versioned)
            const legacyStates =
                await store.get<ILegacySkillStorageState>("skillStates");
            if (legacyStates && typeof legacyStates === "object") {
                // Migrate legacy format to new format
                const migrated: ISkillStorageData = {
                    version: STORAGE_VERSION,
                    skills: {},
                };
                for (const [id, state] of Object.entries(legacyStates)) {
                    migrated.skills[id] = {
                        enabled: state.enabled,
                        invocationMode: state.invocationMode,
                        lastUsed: state.lastUsed,
                        useCount: 0,
                    };
                }
                // Save migrated data
                await store.set("skillData", migrated);
                await store.delete("skillStates"); // Remove legacy key
                await store.save();
                return migrated;
            }

            // No existing data
            return { version: STORAGE_VERSION, skills: {} };
        } catch (error) {
            console.error("Failed to load skill states:", error);
            return { version: STORAGE_VERSION, skills: {} };
        }
    }

    /**
     * Migrates storage data to current version if needed.
     */
    private migrateStorageData(data: ISkillStorageData): ISkillStorageData {
        // Handle future migrations here
        // Currently at version 1, no migrations needed
        if (data.version < STORAGE_VERSION) {
            // Future: Add migration logic for version upgrades
            data.version = STORAGE_VERSION;
        }
        return data;
    }

    /**
     * Persists current skill states to storage immediately.
     * Called by the debounced persist function.
     */
    private async persistStatesImmediate(): Promise<void> {
        try {
            const store = await getStore(this.storeName);
            const storageData: ISkillStorageData = {
                version: STORAGE_VERSION,
                skills: {},
            };

            for (const [id, state] of this.states) {
                storageData.skills[id] = {
                    enabled: state.enabled,
                    invocationMode: state.invocationMode,
                    lastUsed: state.lastUsed,
                    useCount: state.useCount,
                };
            }

            await store.set("skillData", storageData);
            await store.save();
        } catch (error) {
            console.error("Failed to persist skill states:", error);
        }
    }

    /**
     * Forces an immediate save of skill states.
     * Useful for ensuring data is saved before app close.
     */
    public async flushPersist(): Promise<void> {
        await this.persistStatesImmediate();
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
