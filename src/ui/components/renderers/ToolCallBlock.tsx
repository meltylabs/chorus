import { ChevronDown as ChevronDownIcon, WrenchIcon } from "lucide-react";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@ui/components/ui/collapsible";
import { useState, useMemo } from "react";
import { CodeBlock } from "./CodeBlock";
import { extractToolSummary } from "./toolCallHelpers";

export const ToolCallBlock = ({
    toolName,
    content,
}: {
    toolName: string;
    content: string;
}) => {
    // Always start collapsed for cleaner UX
    const [isOpen, setIsOpen] = useState(false);

    // Memoize the tool summary extraction
    const { summary, displayContent, isJSON } = useMemo(
        () => extractToolSummary(content),
        [content],
    );

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className="my-2 rounded-lg text-muted-foreground text-xs py-2 px-3 border border-border/30 w-fit max-w-full hover:border-border/50 transition-all bg-muted/10"
            onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                e.stopPropagation(); // prevent message from selecting
            }}
        >
            <CollapsibleTrigger className="group font-mono text-[11px] text-left flex items-center gap-2.5 hover:text-foreground/80">
                <div className="flex items-center gap-2 min-w-0">
                    <WrenchIcon className="w-3 h-3 flex-shrink-0 opacity-50" />
                    <span className="flex-shrink-0 font-medium opacity-70">
                        {toolName}
                    </span>
                    {summary && (
                        <>
                            <span className="opacity-30">·</span>
                            <span className="opacity-50 truncate">
                                {summary}
                            </span>
                        </>
                    )}
                </div>
                <ChevronDownIcon className="w-3 h-3 ml-auto flex-shrink-0 transition-transform group-data-[state=open]:rotate-180 opacity-40" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2.5">
                <div className="max-h-60 overflow-y-auto">
                    <CodeBlock
                        className={isJSON ? "language-json" : undefined}
                        content={displayContent.trim()}
                    />
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
};
