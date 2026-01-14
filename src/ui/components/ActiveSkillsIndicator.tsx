/**
 * ActiveSkillsIndicator - Shows active skills in a conversation.
 *
 * Displays badges for each active skill with options to view details
 * and dismiss skills from the context.
 */

import { useState } from "react";
import {
    useActiveSkills,
    activeSkillsActions,
    IActiveSkill,
} from "@core/infra/ActiveSkillsStore";
import { Badge } from "@ui/components/ui/badge";
import { Button } from "@ui/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@ui/components/ui/popover";
import { Sparkles, X, Info } from "lucide-react";
import { cn } from "@ui/lib/utils";

interface ActiveSkillsIndicatorProps {
    chatId: string;
}

/**
 * Individual badge for an active skill.
 */
function ActiveSkillBadge({
    skill,
    chatId,
}: {
    skill: IActiveSkill;
    chatId: string;
}) {
    const [isOpen, setIsOpen] = useState(false);

    const handleDismiss = (e: React.MouseEvent) => {
        e.stopPropagation();
        activeSkillsActions.removeSkill(chatId, skill.id);
    };

    const formattedTime = new Date(skill.invokedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Badge
                    variant={
                        skill.invocationType === "auto" ? "secondary" : "default"
                    }
                    className={cn(
                        "flex items-center gap-1 cursor-pointer transition-colors",
                        "hover:opacity-80",
                        skill.invocationType === "auto"
                            ? "bg-muted text-muted-foreground border-muted-foreground/20"
                            : "bg-primary/10 text-primary border-primary/20"
                    )}
                >
                    <Sparkles className="w-3 h-3" />
                    <span className="text-xs">{skill.name}</span>
                    <button
                        className="ml-0.5 hover:bg-white/20 rounded-full p-0.5"
                        onClick={handleDismiss}
                        aria-label={`Dismiss ${skill.name} skill`}
                    >
                        <X className="w-3 h-3" />
                    </button>
                </Badge>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="start">
                <div className="space-y-2">
                    <div className="flex items-start gap-2">
                        <Sparkles className="w-4 h-4 mt-0.5 text-primary" />
                        <div className="flex-1">
                            <h4 className="font-medium text-sm">{skill.name}</h4>
                            <p className="text-xs text-muted-foreground">
                                {skill.description}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                        <span className="flex items-center gap-1">
                            <Info className="w-3 h-3" />
                            {skill.invocationType === "auto"
                                ? "Auto-invoked"
                                : "Manually invoked"}
                        </span>
                        <span>{formattedTime}</span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                            activeSkillsActions.removeSkill(chatId, skill.id);
                            setIsOpen(false);
                        }}
                    >
                        <X className="w-3 h-3 mr-1" />
                        Remove from context
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

/**
 * Main indicator component showing all active skills.
 */
export default function ActiveSkillsIndicator({
    chatId,
}: ActiveSkillsIndicatorProps) {
    const activeSkills = useActiveSkills(chatId);

    if (activeSkills.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 bg-muted/30 rounded-lg mb-2">
            <span className="text-xs text-muted-foreground mr-1">
                Active skills:
            </span>
            {activeSkills.map((skill) => (
                <ActiveSkillBadge key={skill.id} skill={skill} chatId={chatId} />
            ))}
        </div>
    );
}
