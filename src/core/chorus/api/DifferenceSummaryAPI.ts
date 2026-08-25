import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { db } from "../DB";
import { simpleLLM } from "../simpleLLM";
import { SimpleCompletionMode } from "../ModelProviders/simple/ISimpleCompletionProvider";
import { getDifferenceSummaryPrompt } from "../prompts/prompts";

export type DifferenceSummaryResponse = {
    displayName: string;
    modelId: string;
    text: string;
};

type StoredDifferenceSummary = {
    summary: string;
    contentHash: string;
};

export const differenceSummaryKeys = {
    detail: (messageSetId: string) =>
        ["differenceSummary", messageSetId] as const,
};

function hashResponses(responses: DifferenceSummaryResponse[]): string {
    return responses
        .map((response) => `${response.modelId}\n${response.text}`)
        .sort()
        .join("\n---\n");
}

async function fetchStoredSummary(
    messageSetId: string,
): Promise<StoredDifferenceSummary | undefined> {
    const rows = await db.select<
        { summary: string; content_hash: string }[]
    >(
        `SELECT summary, content_hash FROM message_set_difference_summaries WHERE message_set_id = ?`,
        [messageSetId],
    );
    const row = rows[0];
    if (!row) {
        return undefined;
    }
    return {
        summary: row.summary,
        contentHash: row.content_hash,
    };
}

export function useDifferenceSummary({
    messageSetId,
    responses,
    enabled,
}: {
    messageSetId: string;
    responses: DifferenceSummaryResponse[];
    enabled: boolean;
}) {
    const queryClient = useQueryClient();
    const contentHash = hashResponses(responses);
    const ready = enabled && responses.length >= 2;

    const storedQuery = useQuery({
        queryKey: differenceSummaryKeys.detail(messageSetId),
        queryFn: () => fetchStoredSummary(messageSetId),
        enabled: ready,
    });

    const generate = useMutation({
        mutationFn: async () => {
            const existing = await fetchStoredSummary(messageSetId);
            if (existing?.contentHash === contentHash) {
                return existing;
            }

            const summary = (
                await simpleLLM(getDifferenceSummaryPrompt(responses), {
                    model: SimpleCompletionMode.SUMMARIZER,
                    maxTokens: 280,
                })
            ).trim();

            await db.execute(
                `INSERT OR REPLACE INTO message_set_difference_summaries (message_set_id, summary, content_hash) VALUES (?, ?, ?)`,
                [messageSetId, summary, contentHash],
            );

            return { summary, contentHash };
        },
        onSuccess: async (data) => {
            queryClient.setQueryData(
                differenceSummaryKeys.detail(messageSetId),
                data,
            );
        },
    });

    const storedMatches =
        storedQuery.data?.contentHash === contentHash
            ? storedQuery.data.summary
            : undefined;

    useEffect(() => {
        generate.reset();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contentHash]);

    useEffect(() => {
        if (!ready || storedQuery.isPending || storedMatches) {
            return;
        }
        if (generate.isPending || generate.isError) {
            return;
        }
        generate.mutate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        ready,
        contentHash,
        storedMatches,
        storedQuery.isPending,
        generate.isPending,
        generate.isError,
    ]);

    return {
        summary: storedMatches,
        isLoading: ready && !storedMatches && (storedQuery.isPending || generate.isPending),
    };
}
