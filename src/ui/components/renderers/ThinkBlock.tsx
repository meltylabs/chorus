import {
    ChevronDown as ChevronDownIcon,
    BrainIcon,
    Loader2,
} from "lucide-react";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@ui/components/ui/collapsible";
import { useEffect, useMemo, useState } from "react";

export const ThinkBlock = ({
    content,
    isComplete,
    seconds,
}: {
    content: string;
    isComplete: boolean;
    seconds?: string;
}) => {
    const trimmedContent = typeof content === "string" ? content.trim() : "";
    const [isOpen, setIsOpen] = useState(!isComplete);
    const [sawComplete, setSawComplete] = useState(isComplete);

    useEffect(() => {
        if (!sawComplete && isComplete) {
            setIsOpen(false);
            setSawComplete(true);
        }
    }, [isComplete, sawComplete]);

    const durationSeconds = useMemo(() => {
        if (!seconds) return undefined;
        const parsed = Number.parseInt(seconds, 10);
        return Number.isFinite(parsed) ? parsed : undefined;
    }, [seconds]);

    const label = isComplete
        ? durationSeconds !== undefined
            ? `Thought for ${durationSeconds} seconds`
            : "Thought"
        : "Thinking";

    // Don't render anything if content is empty
    if (!trimmedContent) {
        return null;
    }

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className="my-4 max-w-full"
            onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                e.stopPropagation(); // prevent message from selecting
            }}
        >
            <CollapsibleTrigger className="group inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-left font-geist-mono text-xs font-[350] text-muted-foreground hover:text-foreground">
                {!isComplete ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                    <BrainIcon className="h-3 w-3" />
                )}
                <span className="truncate">{label}</span>
                <ChevronDownIcon className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="">
                <div className="mt-2 rounded-md border px-3 py-3 text-sm text-muted-foreground whitespace-pre-wrap">
                    {trimmedContent}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
};
