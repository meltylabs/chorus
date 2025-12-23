import { db } from "../DB";

/**
 * OpenRouter generation endpoint response type
 */
interface OpenRouterGenerationResponse {
    data: {
        id: string;
        model: string;
        streamed: boolean;
        generation_time: number;
        created_at: string;
        tokens_prompt: number;
        tokens_completion: number;
        native_tokens_prompt?: number;
        native_tokens_completion?: number;
        num_media_generations?: number;
        usage: number; // cost in USD
        app_id?: number;
        latency?: number;
        moderation_latency?: number;
        total_cost: number; // in USD
    };
}

/**
 * Fetch actual cost from OpenRouter generation endpoint
 * Returns the authoritative cost including tiered pricing, caching, etc.
 */
export async function fetchOpenRouterCost(
    generationId: string,
    apiKey: string,
): Promise<{
    cost: number;
    promptTokens: number;
    completionTokens: number;
} | null> {
    try {
        const response = await fetch(
            `https://openrouter.ai/api/v1/generation?id=${generationId}`,
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "HTTP-Referer": "https://chorus.sh",
                    "X-Title": "Chorus",
                },
            },
        );

        if (!response.ok) {
            console.warn(
                `Failed to fetch OpenRouter generation data: ${response.status}`,
            );
            return null;
        }

        const data = (await response.json()) as OpenRouterGenerationResponse;

        return {
            cost: data.data.total_cost,
            promptTokens:
                data.data.native_tokens_prompt ?? data.data.tokens_prompt,
            completionTokens:
                data.data.native_tokens_completion ??
                data.data.tokens_completion,
        };
    } catch (error) {
        console.error("Error fetching OpenRouter generation cost:", error);
        return null;
    }
}

/**
 * Calculate cost from token usage and pricing (fallback for non-OpenRouter models)
 */
export function calculateCost(
    promptTokens: number,
    completionTokens: number,
    promptPricePerToken: number,
    completionPricePerToken: number,
): number {
    const inputCost = promptTokens * promptPricePerToken;
    const outputCost = completionTokens * completionPricePerToken;
    return inputCost + outputCost;
}

/**
 * Format cost for display
 * Examples: "$0.0023", "$0.50", "$3.20", "$100.00"
 * For very small amounts: "0.2¢"
 */
export function formatCost(costUsd: number | null | undefined): string {
    if (costUsd === null || costUsd === undefined) return "–";
    if (costUsd === 0) return "$0.00";

    // For very small costs (< $0.01), show in cents
    if (costUsd < 0.01) {
        const cents = costUsd * 100;
        return `${cents.toFixed(2)}¢`;
    }

    // For costs >= $0.01 but < $1, show 4 decimal places
    if (costUsd < 1.0) {
        return `$${costUsd.toFixed(4)}`;
    }

    // For costs >= $1, show 2 decimal places
    return `$${costUsd.toFixed(2)}`;
}

/**
 * Calculate total cost for a chat
 */
export async function calculateChatCost(chatId: string): Promise<number> {
    const rows = await db.select<{ total_cost: number }[]>(
        `SELECT COALESCE(SUM(cost_usd), 0) as total_cost
         FROM messages
         WHERE chat_id = ? AND cost_usd IS NOT NULL`,
        [chatId],
    );
    return rows[0]?.total_cost ?? 0;
}

/**
 * Calculate total cost for a project
 */
export async function calculateProjectCost(projectId: string): Promise<number> {
    const rows = await db.select<{ total_cost: number }[]>(
        `SELECT COALESCE(SUM(total_cost_usd), 0) as total_cost
         FROM chats
         WHERE project_id = ? AND total_cost_usd IS NOT NULL`,
        [projectId],
    );
    return rows[0]?.total_cost ?? 0;
}

/**
 * Update chat's total cost
 */
export async function updateChatCost(chatId: string): Promise<void> {
    const totalCost = await calculateChatCost(chatId);
    await db.execute("UPDATE chats SET total_cost_usd = ? WHERE id = ?", [
        totalCost,
        chatId,
    ]);
}

/**
 * Update project's total cost
 */
export async function updateProjectCost(projectId: string): Promise<void> {
    const totalCost = await calculateProjectCost(projectId);
    await db.execute("UPDATE projects SET total_cost_usd = ? WHERE id = ?", [
        totalCost,
        projectId,
    ]);
}

/**
 * Get project ID for a chat without fetching the entire chat object
 */
export async function getProjectIdForChat(
    chatId: string,
): Promise<string | undefined> {
    const rows = await db.select<{ project_id: string | null }[]>(
        "SELECT project_id FROM chats WHERE id = ?",
        [chatId],
    );
    return rows[0]?.project_id ?? undefined;
}

/**
 * Update both chat and project costs efficiently
 * Returns the project ID if it exists, for use in query invalidation
 */
export async function updateChatAndProjectCosts(
    chatId: string,
): Promise<string | undefined> {
    // Update chat cost
    await updateChatCost(chatId);

    // Get project ID and update project cost if it exists
    const projectId = await getProjectIdForChat(chatId);
    if (projectId) {
        await updateProjectCost(projectId);
    }

    return projectId;
}
