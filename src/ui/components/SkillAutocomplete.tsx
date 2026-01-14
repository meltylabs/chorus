/**
 * SkillAutocomplete component for manual skill invocation.
 *
 * Shows a dropdown of available skills when user types "/" in chat input.
 * Supports keyboard navigation with arrow keys, Enter to select, Escape to dismiss.
 */

import { useEffect, useState, useCallback } from "react";
import { useEnabledSkills } from "@core/chorus/api/SkillsAPI";
import { ISkill } from "@core/chorus/skills/SkillTypes";
import { cn } from "@ui/lib/utils";
import { Sparkles, FolderOpen, User, Globe } from "lucide-react";

interface SkillAutocompleteProps {
    /** The query string (text after "/") */
    query: string;
    /** Called when a skill is selected */
    onSelect: (skill: ISkill) => void;
    /** Called when autocomplete should be dismissed */
    onDismiss: () => void;
    /** Whether the autocomplete is visible */
    isVisible: boolean;
}

/**
 * Individual skill suggestion item.
 */
function SkillSuggestion({
    skill,
    isSelected,
    onClick,
}: {
    skill: ISkill;
    isSelected: boolean;
    onClick: () => void;
}) {
    const locationIcon = {
        project: FolderOpen,
        user: User,
        global: Globe,
    }[skill.location];
    const LocationIcon = locationIcon ?? Globe;

    return (
        <button
            className={cn(
                "w-full flex items-start gap-3 px-3 py-2 text-left transition-colors",
                "hover:bg-muted/50",
                isSelected && "bg-muted"
            )}
            onClick={onClick}
            type="button"
        >
            <Sparkles className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                        /{skill.metadata.name}
                    </span>
                    <LocationIcon className="w-3 h-3 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground truncate">
                    {skill.metadata.description}
                </p>
            </div>
        </button>
    );
}

export default function SkillAutocomplete({
    query,
    onSelect,
    onDismiss,
    isVisible,
}: SkillAutocompleteProps) {
    const { data: skills = [] } = useEnabledSkills();
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Filter skills based on query
    // Show all enabled skills when query is empty (just "/")
    // When there's a query, filter by name match
    const filteredSkills = skills.filter((skill) =>
        skill.metadata.name.toLowerCase().includes(query.toLowerCase())
    );

    // Reset selection when filtered list changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    // Handle keyboard navigation
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (!isVisible) return;

            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedIndex((i) =>
                        Math.min(i + 1, filteredSkills.length - 1)
                    );
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedIndex((i) => Math.max(i - 1, 0));
                    break;
                case "Enter":
                    if (filteredSkills[selectedIndex]) {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelect(filteredSkills[selectedIndex]);
                    }
                    break;
                case "Escape":
                    e.preventDefault();
                    e.stopPropagation();
                    onDismiss();
                    break;
                case "Tab":
                    // Tab also selects if there's a match
                    if (filteredSkills[selectedIndex]) {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelect(filteredSkills[selectedIndex]);
                    }
                    break;
            }
        },
        [isVisible, filteredSkills, selectedIndex, onSelect, onDismiss]
    );

    useEffect(() => {
        if (isVisible) {
            window.addEventListener("keydown", handleKeyDown, true);
            return () =>
                window.removeEventListener("keydown", handleKeyDown, true);
        }
    }, [isVisible, handleKeyDown]);

    // Handle click outside to dismiss
    useEffect(() => {
        if (!isVisible) return;

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest(".skill-autocomplete-container")) {
                onDismiss();
            }
        };

        // Use a small delay to avoid immediately dismissing on the click that opens
        const timeoutId = window.setTimeout(() => {
            document.addEventListener("click", handleClickOutside);
        }, 100);

        return () => {
            window.clearTimeout(timeoutId);
            document.removeEventListener("click", handleClickOutside);
        };
    }, [isVisible, onDismiss]);

    if (!isVisible) {
        return null;
    }

    if (filteredSkills.length === 0) {
        return (
            <div className="skill-autocomplete-container absolute bottom-full left-0 right-0 mb-2 z-50">
                <div className="bg-popover border rounded-lg shadow-lg p-3 text-center">
                    <p className="text-sm text-muted-foreground">
                        {query
                            ? `No skills match "/${query}"`
                            : "No skills available"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        Add skills in Settings &gt; Skills
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="skill-autocomplete-container absolute bottom-full left-0 right-0 mb-2 z-50">
            <div className="bg-popover border rounded-lg shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                <div className="px-3 py-2 border-b bg-muted/30">
                    <p className="text-xs text-muted-foreground font-medium">
                        Skills
                    </p>
                </div>
                <div className="py-1">
                    {filteredSkills.map((skill, index) => (
                        <SkillSuggestion
                            key={skill.id}
                            skill={skill}
                            isSelected={index === selectedIndex}
                            onClick={() => onSelect(skill)}
                        />
                    ))}
                </div>
                <div className="px-3 py-2 border-t bg-muted/30">
                    <p className="text-xs text-muted-foreground">
                        <kbd className="px-1 py-0.5 bg-muted rounded text-xs">
                            Enter
                        </kbd>{" "}
                        to select{" "}
                        <kbd className="px-1 py-0.5 bg-muted rounded text-xs ml-2">
                            Esc
                        </kbd>{" "}
                        to dismiss
                    </p>
                </div>
            </div>
        </div>
    );
}
