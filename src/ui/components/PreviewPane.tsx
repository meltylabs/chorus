import { useState } from "react";
import { PlayIcon, PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function PreviewPane() {
    const [isCollapsed, setIsCollapsed] = useState(false);

    if (isCollapsed) {
        return (
            <div className="flex flex-col h-screen bg-background border-l border-border w-12 shrink-0">
                <div className="h-10 flex items-center justify-center border-b border-border">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setIsCollapsed(false)}
                            >
                                <PanelRightOpenIcon className="h-4 w-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                            Expand preview
                        </TooltipContent>
                    </Tooltip>
                </div>
                <div className="flex-1 flex items-center justify-center">
                    <span
                        className="text-xs text-muted-foreground writing-mode-vertical"
                        style={{ writingMode: "vertical-rl" }}
                    >
                        Preview
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-background border-l border-border w-[400px] shrink-0">
            {/* Header */}
            <div className="h-10 flex items-center justify-between px-3 border-b border-border">
                <span className="text-sm font-medium text-foreground/80">
                    Preview
                </span>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setIsCollapsed(true)}
                        >
                            <PanelRightCloseIcon className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">Collapse preview</TooltipContent>
                </Tooltip>
            </div>

            {/* Preview canvas area */}
            <div className="flex-1 flex items-center justify-center bg-muted/20 p-6">
                <div className="text-center space-y-6 text-muted-foreground max-w-[280px]">
                    <div className="w-20 h-20 mx-auto rounded-full bg-muted/50 flex items-center justify-center">
                        <PlayIcon className="w-10 h-10" />
                    </div>
                    <div className="space-y-2">
                        <p className="text-base font-medium">
                            Motion Graphics Preview
                        </p>
                        <p className="text-sm leading-relaxed">
                            Generated animations will appear here
                        </p>
                    </div>
                </div>
            </div>

            {/* Footer with controls placeholder */}
            <div className="h-14 flex items-center justify-center px-4 border-t border-border bg-muted/10">
                <span className="text-xs text-muted-foreground">
                    Timeline controls coming soon
                </span>
            </div>
        </div>
    );
}
