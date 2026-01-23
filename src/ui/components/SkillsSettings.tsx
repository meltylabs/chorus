/**
 * SkillsSettings component for the Settings panel.
 *
 * Displays all discovered skills with controls for enabling/disabling
 * and setting invocation modes.
 */

import { useSkills, useRefreshSkills } from "@core/chorus/api/SkillsAPI";
import { Button } from "@ui/components/ui/button";
import { Separator } from "@ui/components/ui/separator";
import { RefreshCw, FolderOpen, ExternalLink } from "lucide-react";
import SkillCard from "./SkillCard";
import { Skeleton } from "@ui/components/ui/skeleton";
import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Empty state shown when no skills are discovered.
 */
function SkillsEmptyState() {
    return (
        <div className="text-center py-8 px-4 border border-dashed rounded-lg bg-muted/20">
            <FolderOpen className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-medium mb-2">No Skills Found</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                Skills extend AI capabilities with specialized instructions and
                scripts. Add a skill by creating a folder with a SKILL.md file.
            </p>
            <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                    Skills can be placed in:
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                    <li>
                        <code className="bg-muted px-1 rounded">
                            .chorus/skills/
                        </code>{" "}
                        in your project
                    </li>
                    <li>
                        <code className="bg-muted px-1 rounded">
                            ~/.chorus/skills/
                        </code>{" "}
                        for user-wide skills
                    </li>
                </ul>
            </div>
            <Button
                variant="link"
                size="sm"
                className="mt-4"
                onClick={() =>
                    void openUrl("https://agentskills.io")
                }
            >
                Learn more about Agent Skills
                <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
        </div>
    );
}

/**
 * Loading skeleton for skills list.
 */
function SkillsLoadingSkeleton() {
    return (
        <div className="space-y-3">
            {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-start">
                        <div className="space-y-2 flex-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-48" />
                        </div>
                        <Skeleton className="h-5 w-9" />
                    </div>
                    <Skeleton className="h-8 w-40" />
                </div>
            ))}
        </div>
    );
}

export default function SkillsSettings() {
    const { data: skills, isLoading, error } = useSkills();
    const refreshSkills = useRefreshSkills();

    return (
        <div className="space-y-6 max-w-2xl">
            <div className="flex items-start justify-between">
                <div>
                    <h2 className="text-2xl font-semibold mb-2">Skills</h2>
                    <p className="text-sm text-muted-foreground">
                        Extend AI capabilities with specialized skills. Skills
                        provide domain-specific instructions and scripts.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refreshSkills.mutate()}
                    disabled={refreshSkills.isPending}
                >
                    <RefreshCw
                        className={`w-4 h-4 mr-2 ${refreshSkills.isPending ? "animate-spin" : ""}`}
                    />
                    Refresh
                </Button>
            </div>

            <Separator />

            {error && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                    Failed to load skills: {error.message}
                </div>
            )}

            {isLoading ? (
                <SkillsLoadingSkeleton />
            ) : skills?.length === 0 ? (
                <SkillsEmptyState />
            ) : (
                <div className="space-y-3">
                    {skills?.map((skill) => (
                        <SkillCard key={skill.id} skill={skill} />
                    ))}
                </div>
            )}

            <Separator />

            <div className="text-xs text-muted-foreground space-y-2">
                <p>
                    <strong>Agent Decides:</strong> The AI can invoke this skill
                    automatically when relevant.
                </p>
                <p>
                    <strong>Manual Only:</strong> Use{" "}
                    <code className="bg-muted px-1 rounded">/skill-name</code>{" "}
                    to invoke manually.
                </p>
            </div>
        </div>
    );
}
