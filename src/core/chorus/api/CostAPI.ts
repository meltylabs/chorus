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
    if (costUsd === null || costUsd === undefined) return "—";
    if (costUsd === 0) return "$0.00";

    // For very small costs (< $0.01), show in cents with precision
    if (costUsd < 0.01) {
        const cents = costUsd * 100;
        if (cents < 0.01) {
            return `${cents.toFixed(3)}¢`;
        }
        return `${cents.toFixed(2)}¢`;
    }

    // For costs >= $0.01, show in dollars
    if (costUsd < 1.0) {
        return `$${costUsd.toFixed(4)}`;
    }

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
