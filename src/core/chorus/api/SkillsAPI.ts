/**
 * Skills API - TanStack Query hooks for skill management
 *
 * Provides reactive data access for UI components to display and manage skills.
 * Follows existing patterns from ModelsAPI.ts and other API modules.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSkillManager } from "../skills/SkillManager";
import { ISkill, ISkillState } from "../skills/SkillTypes";

/**
 * Query keys for skills-related queries.
 */
export const skillKeys = {
    all: () => ["skills"] as const,
    enabled: () => ["skills", "enabled"] as const,
    auto: () => ["skills", "auto"] as const,
    manual: () => ["skills", "manual"] as const,
    state: (id: string) => ["skills", "state", id] as const,
};

/**
 * Query definitions for skills.
 */
export const skillQueries = {
    list: () => ({
        queryKey: skillKeys.all(),
        queryFn: async (): Promise<ISkill[]> => {
            const manager = getSkillManager();
            if (!manager.isInitialized()) {
                return [];
            }
            return manager.getAllSkills();
        },
    }),
    enabled: () => ({
        queryKey: skillKeys.enabled(),
        queryFn: async (): Promise<ISkill[]> => {
            const manager = getSkillManager();
            if (!manager.isInitialized()) {
                return [];
            }
            return manager.getEnabledSkills();
        },
    }),
    auto: () => ({
        queryKey: skillKeys.auto(),
        queryFn: async (): Promise<ISkill[]> => {
            const manager = getSkillManager();
            if (!manager.isInitialized()) {
                return [];
            }
            return manager.getAutoSkills();
        },
    }),
    manual: () => ({
        queryKey: skillKeys.manual(),
        queryFn: async (): Promise<ISkill[]> => {
            const manager = getSkillManager();
            if (!manager.isInitialized()) {
                return [];
            }
            return manager.getManualSkills();
        },
    }),
    state: (id: string) => ({
        queryKey: skillKeys.state(id),
        queryFn: async (): Promise<ISkillState | undefined> => {
            const manager = getSkillManager();
            if (!manager.isInitialized()) {
                return undefined;
            }
            return manager.getSkillState(id);
        },
    }),
};

/**
 * Hook to get all discovered skills.
 */
export function useSkills() {
    return useQuery(skillQueries.list());
}

/**
 * Hook to get only enabled skills.
 */
export function useEnabledSkills() {
    return useQuery(skillQueries.enabled());
}

/**
 * Hook to get skills set to auto invocation mode.
 */
export function useAutoSkills() {
    return useQuery(skillQueries.auto());
}

/**
 * Hook to get skills set to manual invocation mode.
 */
export function useManualSkills() {
    return useQuery(skillQueries.manual());
}

/**
 * Hook to get the state of a specific skill.
 */
export function useSkillState(id: string) {
    return useQuery({
        ...skillQueries.state(id),
        enabled: !!id, // Only run when id is provided
    });
}

/**
 * Hook to get a single skill by ID.
 */
export function useSkill(id: string) {
    const { data: skills, ...rest } = useSkills();
    const skill = skills?.find((s) => s.metadata.name === id);
    return { data: skill, ...rest };
}

/**
 * Hook to enable a skill.
 */
export function useEnableSkill() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["enableSkill"] as const,
        mutationFn: async (id: string) => {
            const manager = getSkillManager();
            await manager.enableSkill(id);
        },
        onSuccess: async (_data, id) => {
            // Invalidate all skill-related queries
            await queryClient.invalidateQueries({ queryKey: skillKeys.all() });
            await queryClient.invalidateQueries({
                queryKey: skillKeys.enabled(),
            });
            await queryClient.invalidateQueries({ queryKey: skillKeys.auto() });
            await queryClient.invalidateQueries({
                queryKey: skillKeys.manual(),
            });
            await queryClient.invalidateQueries({
                queryKey: skillKeys.state(id),
            });
        },
    });
}

/**
 * Hook to disable a skill.
 */
export function useDisableSkill() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["disableSkill"] as const,
        mutationFn: async (id: string) => {
            const manager = getSkillManager();
            await manager.disableSkill(id);
        },
        onSuccess: async (_data, id) => {
            await queryClient.invalidateQueries({ queryKey: skillKeys.all() });
            await queryClient.invalidateQueries({
                queryKey: skillKeys.enabled(),
            });
            await queryClient.invalidateQueries({ queryKey: skillKeys.auto() });
            await queryClient.invalidateQueries({
                queryKey: skillKeys.manual(),
            });
            await queryClient.invalidateQueries({
                queryKey: skillKeys.state(id),
            });
        },
    });
}

/**
 * Hook to toggle a skill's enabled state.
 */
export function useToggleSkill() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["toggleSkill"] as const,
        mutationFn: async (id: string) => {
            const manager = getSkillManager();
            await manager.toggleSkill(id);
        },
        onSuccess: async (_data, id) => {
            await queryClient.invalidateQueries({ queryKey: skillKeys.all() });
            await queryClient.invalidateQueries({
                queryKey: skillKeys.enabled(),
            });
            await queryClient.invalidateQueries({ queryKey: skillKeys.auto() });
            await queryClient.invalidateQueries({
                queryKey: skillKeys.manual(),
            });
            await queryClient.invalidateQueries({
                queryKey: skillKeys.state(id),
            });
        },
    });
}

/**
 * Hook to set a skill's invocation mode.
 */
export function useSetSkillInvocationMode() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["setSkillInvocationMode"] as const,
        mutationFn: async ({
            id,
            mode,
        }: {
            id: string;
            mode: "auto" | "manual";
        }) => {
            const manager = getSkillManager();
            await manager.setInvocationMode(id, mode);
        },
        onSuccess: async (_data, { id }) => {
            await queryClient.invalidateQueries({ queryKey: skillKeys.all() });
            await queryClient.invalidateQueries({ queryKey: skillKeys.auto() });
            await queryClient.invalidateQueries({
                queryKey: skillKeys.manual(),
            });
            await queryClient.invalidateQueries({
                queryKey: skillKeys.state(id),
            });
        },
    });
}

/**
 * Hook to refresh skills by re-discovering from disk.
 */
export function useRefreshSkills() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["refreshSkills"] as const,
        mutationFn: async () => {
            const manager = getSkillManager();
            await manager.refresh();
        },
        onSuccess: async () => {
            // Invalidate all skill queries
            await queryClient.invalidateQueries({ queryKey: ["skills"] });
        },
    });
}

/**
 * Hook to initialize skills if not already initialized.
 */
export function useInitializeSkills() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationKey: ["initializeSkills"] as const,
        mutationFn: async (projectPath?: string) => {
            const manager = getSkillManager();
            if (!manager.isInitialized()) {
                await manager.initialize(projectPath);
            }
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["skills"] });
        },
    });
}
