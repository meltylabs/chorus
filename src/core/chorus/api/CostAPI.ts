import { db } from "../DB";

/**
 * Calculate cost from token usage and pricing
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
