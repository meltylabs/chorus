import { formatCost } from "@core/chorus/api/CostAPI";
import { useSettings } from "./hooks/useSettings";

interface MessageCostDisplayProps {
    costUsd?: number;
    promptTokens?: number;
    completionTokens?: number;
    isStreaming: boolean;
    isQuickChatWindow: boolean;
}

export function MessageCostDisplay({
    costUsd,
    promptTokens,
    completionTokens,
    isStreaming,
    isQuickChatWindow,
}: MessageCostDisplayProps) {
    const settings = useSettings();
    const showCost = settings?.showCost ?? false;

    // Don't show cost in quick chat or while streaming
    if (
        !showCost ||
        isQuickChatWindow ||
        isStreaming ||
        costUsd === undefined
    ) {
        return null;
    }

    return (
        <div className="absolute bottom-1 right-4 text-[10px] text-muted-foreground font-mono tabular-nums text-right">
            {formatCost(costUsd)}
            {promptTokens !== undefined && completionTokens !== undefined && (
                <span className="ml-2 opacity-70">
                    ({promptTokens.toLocaleString()} →{" "}
                    {completionTokens.toLocaleString()} tokens)
                </span>
            )}
        </div>
    );
}
