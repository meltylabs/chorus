import { ArrowLeftRightIcon } from "lucide-react";
import { useDifferenceSummary } from "@core/chorus/api/DifferenceSummaryAPI";
import type { DifferenceSummaryResponse } from "@core/chorus/api/DifferenceSummaryAPI";
import type { Message } from "@core/chorus/ChatState";
import type { ModelConfig } from "@core/chorus/Models";

export function responsesFromAiMessages(
    messages: Message[],
    modelConfigs: ModelConfig[] | undefined,
): DifferenceSummaryResponse[] {
    return messages
        .filter(
            (message) =>
                message.model !== "chorus::synthesize" &&
                message.state !== "streaming" &&
                !message.errorMessage,
        )
        .map((message) => {
            const text =
                message.parts.length > 0
                    ? message.parts
                          .map((part) => part.content)
                          .filter(Boolean)
                          .join("\n")
                    : message.text;
            const displayName =
                modelConfigs?.find((config) => config.id === message.model)
                    ?.displayName ?? message.model;
            return {
                displayName,
                modelId: message.model,
                text: text.trim(),
            };
        })
        .filter((response) => response.text.length > 0);
}

export function DifferenceSummary({
    messageSetId,
    responses,
    enabled,
}: {
    messageSetId: string;
    responses: DifferenceSummaryResponse[];
    enabled: boolean;
}) {
    const { summary, isLoading } = useDifferenceSummary({
        messageSetId,
        responses,
        enabled,
    });

    if (!enabled || responses.length < 2) {
        return null;
    }

    if (!summary && !isLoading) {
        return null;
    }

    return (
        <div className="mb-3 mr-2 rounded-md border-[0.090rem] bg-background px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1.5 text-muted-foreground">
                <ArrowLeftRightIcon className="w-3 h-3" />
                <span className="font-geist-mono text-[10px] uppercase tracking-wider">
                    Differences
                </span>
            </div>
            {summary ? (
                <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {summary}
                </div>
            ) : (
                <div className="space-y-1.5">
                    <div className="h-3 w-4/5 rounded bg-muted/70" />
                    <div className="h-3 w-3/5 rounded bg-muted/50" />
                </div>
            )}
        </div>
    );
}
