import { ChevronDown as ChevronDownIcon, WrenchIcon } from "lucide-react";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@ui/components/ui/collapsible";
import { useState, useMemo } from "react";
import React from "react";
import { CodeBlock } from "./CodeBlock";
import { extractToolSummary } from "./toolCallHelpers";

interface ToolCall {
    name: string;
    content: string;
}

interface ToolCallElementProps {
    name?: string;
    "data-input"?: string;
    children?: React.ReactNode;
}

function isToolCallElement(
    child: unknown,
): child is React.ReactElement<ToolCallElementProps> {
    return (
        child !== null &&
        typeof child === "object" &&
        "props" in child &&
        typeof (child as React.ReactElement).props === "object"
    );
}

function extractTextFromChildren(children: React.ReactNode): string {
    return React.Children.toArray(children)
        .map((child) => {
            if (typeof child === "string") return child;
            if (typeof child === "number") return String(child);
            if (child && typeof child === "object" && "props" in child) {
                const props = child.props as { children?: React.ReactNode };
                return extractTextFromChildren(props.children);
            }
            return "";
        })
        .join("");
}

export const ToolCallGroup = ({ children }: { children?: React.ReactNode }) => {
    const [isOpen, setIsOpen] = useState(false);

    // Memoize the expensive parsing operation based on children
    const toolCalls = useMemo(() => {
        const calls: ToolCall[] = [];

        // Extract tool call data from children
        if (children) {
            const childArray = Array.isArray(children) ? children : [children];

            // First, try to extract from properly parsed ToolCall components
            childArray.forEach((child) => {
                if (
                    isToolCallElement(child) &&
                    child.props.name &&
                    child.props["data-input"]
                ) {
                    try {
                        const content = atob(child.props["data-input"]);
                        calls.push({
                            name: child.props.name,
                            content: content,
                        });
                    } catch (e) {
                        console.error(
                            "[ToolCallGroup] Failed to decode tool call:",
                            e,
                        );
                    }
                }
            });

            // This handles cases where react-markdown doesn't parse all <tool-call> tags correctly
            if (
                calls.length === 0 ||
                childArray.some((child) => typeof child === "string")
            ) {
                const htmlContent = extractTextFromChildren(children);

                // Extract tool calls from HTML string
                const toolCallRegex =
                    /<tool-call\s+name="([^"]+)"\s+data-input="([^"]+)"><\/tool-call>/g;
                let match;

                while ((match = toolCallRegex.exec(htmlContent)) !== null) {
                    const [, name, dataInput] = match;
                    try {
                        const content = atob(dataInput);
                        calls.push({
                            name,
                            content,
                        });
                    } catch (e) {
                        console.error(
                            "[ToolCallGroup] Failed to decode tool call from HTML:",
                            e,
                        );
                    }
                }
            }
        }

        return calls;
    }, [children]);

    // Memoize the summary calculation
    const summary = useMemo(() => {
        const toolCounts = toolCalls.reduce(
            (acc, tool) => {
                acc[tool.name] = (acc[tool.name] || 0) + 1;
                return acc;
            },
            {} as Record<string, number>,
        );

        return Object.entries(toolCounts)
            .map(([name, count]) => (count > 1 ? `${name} (${count}×)` : name))
            .join(", ");
    }, [toolCalls]);

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className="my-2 rounded-lg text-muted-foreground text-xs py-2 px-3 border border-border/30 w-fit max-w-full hover:border-border/50 transition-all bg-muted/10"
            onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                e.stopPropagation();
            }}
        >
            <CollapsibleTrigger className="group font-mono text-[11px] text-left flex items-center gap-2.5 hover:text-foreground/80 w-full">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <WrenchIcon className="w-3 h-3 flex-shrink-0 opacity-50" />
                    <span className="flex-shrink-0 font-medium opacity-70">
                        {toolCalls.length} tool
                        {toolCalls.length !== 1 ? "s" : ""}
                    </span>
                    <span className="opacity-30">·</span>
                    <span className="opacity-50 truncate">{summary}</span>
                </div>
                <ChevronDownIcon className="w-3 h-3 flex-shrink-0 transition-transform group-data-[state=open]:rotate-180 opacity-40" />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2.5">
                <div className="space-y-1.5 pl-0.5">
                    {toolCalls.map((tool, idx) => (
                        <ToolCallItem
                            key={idx}
                            name={tool.name}
                            content={tool.content}
                        />
                    ))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
};

function ToolCallItem({ name, content }: { name: string; content: string }) {
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
            className="rounded-md border border-border/20 bg-background/30"
        >
            <CollapsibleTrigger className="group w-full px-2.5 py-1.5 text-left flex items-center gap-2 hover:bg-muted/20 transition-colors">
                <span className="font-mono text-[11px] font-medium opacity-70">
                    {name}
                </span>
                {summary && (
                    <>
                        <span className="opacity-25 text-[11px]">·</span>
                        <span className="opacity-50 truncate text-[11px] flex-1 font-mono">
                            {summary}
                        </span>
                    </>
                )}
                <ChevronDownIcon className="w-2.5 h-2.5 flex-shrink-0 transition-transform group-data-[state=open]:rotate-180 opacity-30" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2.5 pb-2">
                <div className="mt-1.5 max-h-48 overflow-y-auto">
                    <CodeBlock
                        className={isJSON ? "language-json" : undefined}
                        content={displayContent.trim()}
                    />
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
