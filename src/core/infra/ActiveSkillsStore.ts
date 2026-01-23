/**
 * ActiveSkillsStore - Manages active skills per conversation.
 *
 * Tracks which skills have been invoked in each chat conversation,
 * allowing users to see and dismiss active skill contexts.
 */

import { create } from "zustand";

/**
 * Information about an actively loaded skill.
 */
export interface IActiveSkill {
    id: string;
    name: string;
    description: string;
    invocationType: "auto" | "manual";
    invokedAt: string;
}

/**
 * Store state for active skills.
 */
interface ActiveSkillsStore {
    /** Map of chatId to list of active skills */
    skillsByChatId: Record<string, IActiveSkill[]>;

    /** Add a skill to a chat's active skills */
    addSkill: (
        chatId: string,
        skill: Omit<IActiveSkill, "invokedAt">
    ) => void;

    /** Remove a skill from a chat's active skills */
    removeSkill: (chatId: string, skillId: string) => void;

    /** Get active skills for a chat */
    getSkills: (chatId: string) => IActiveSkill[];

    /** Clear all skills for a chat */
    clearSkills: (chatId: string) => void;

    /** Check if a skill is active in a chat */
    hasSkill: (chatId: string, skillId: string) => boolean;
}

const useActiveSkillsStore = create<ActiveSkillsStore>((set, get) => ({
    skillsByChatId: {},

    addSkill: (chatId, skill) => {
        const current = get().skillsByChatId[chatId] ?? [];

        // Don't add if already active
        if (current.some((s) => s.id === skill.id)) {
            return;
        }

        const newSkill: IActiveSkill = {
            ...skill,
            invokedAt: new Date().toISOString(),
        };

        set({
            skillsByChatId: {
                ...get().skillsByChatId,
                [chatId]: [...current, newSkill],
            },
        });
    },

    removeSkill: (chatId, skillId) => {
        const current = get().skillsByChatId[chatId] ?? [];
        set({
            skillsByChatId: {
                ...get().skillsByChatId,
                [chatId]: current.filter((s) => s.id !== skillId),
            },
        });
    },

    getSkills: (chatId) => {
        return get().skillsByChatId[chatId] ?? [];
    },

    clearSkills: (chatId) => {
        const newState = { ...get().skillsByChatId };
        delete newState[chatId];
        set({ skillsByChatId: newState });
    },

    hasSkill: (chatId, skillId) => {
        const skills = get().skillsByChatId[chatId] ?? [];
        return skills.some((s) => s.id === skillId);
    },
}));

/** Empty array constant to avoid creating new references */
const EMPTY_SKILLS: IActiveSkill[] = [];

/**
 * Hook to get active skills for a specific chat.
 */
export function useActiveSkills(chatId: string): IActiveSkill[] {
    return useActiveSkillsStore(
        (state) => state.skillsByChatId[chatId] ?? EMPTY_SKILLS
    );
}

/**
 * Hook to check if the chat has any active skills.
 */
export function useHasActiveSkills(chatId: string): boolean {
    return useActiveSkillsStore(
        (state) => (state.skillsByChatId[chatId]?.length ?? 0) > 0
    );
}

/**
 * Export stable actions that won't cause re-renders.
 */
export const activeSkillsActions = {
    addSkill: (chatId: string, skill: Omit<IActiveSkill, "invokedAt">) =>
        useActiveSkillsStore.getState().addSkill(chatId, skill),

    removeSkill: (chatId: string, skillId: string) =>
        useActiveSkillsStore.getState().removeSkill(chatId, skillId),

    clearSkills: (chatId: string) =>
        useActiveSkillsStore.getState().clearSkills(chatId),

    hasSkill: (chatId: string, skillId: string) =>
        useActiveSkillsStore.getState().hasSkill(chatId, skillId),

    getSkills: (chatId: string) =>
        useActiveSkillsStore.getState().getSkills(chatId),
};

export { useActiveSkillsStore };
