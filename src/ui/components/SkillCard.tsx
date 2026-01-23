/**
 * SkillCard component for displaying individual skill in settings.
 *
 * Shows skill metadata, enable/disable toggle, and invocation mode selector.
 */

import { ISkill } from "@core/chorus/skills/SkillTypes";
import {
    useSkillState,
    useEnableSkill,
    useDisableSkill,
    useSetSkillInvocationMode,
} from "@core/chorus/api/SkillsAPI";
import { Card, CardContent, CardHeader } from "@ui/components/ui/card";
import { Switch } from "@ui/components/ui/switch";
import { Badge } from "@ui/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@ui/components/ui/select";
import { FolderOpen, User, Globe } from "lucide-react";

interface SkillCardProps {
    skill: ISkill;
}

/**
 * Returns the appropriate icon and label for a skill location.
 */
function getLocationInfo(location: ISkill["location"]): {
    icon: React.ReactNode;
    label: string;
    variant: "default" | "secondary" | "outline";
} {
    switch (location) {
        case "project":
            return {
                icon: <FolderOpen className="w-3 h-3" />,
                label: "Project",
                variant: "default",
            };
        case "user":
            return {
                icon: <User className="w-3 h-3" />,
                label: "User",
                variant: "secondary",
            };
        case "global":
            return {
                icon: <Globe className="w-3 h-3" />,
                label: "Global",
                variant: "outline",
            };
        default:
            return {
                icon: null,
                label: location,
                variant: "outline",
            };
    }
}

export default function SkillCard({ skill }: SkillCardProps) {
    const { data: state } = useSkillState(skill.id);
    const enableSkill = useEnableSkill();
    const disableSkill = useDisableSkill();
    const setMode = useSetSkillInvocationMode();

    const locationInfo = getLocationInfo(skill.location);
    const isEnabled = state?.enabled ?? true;
    const invocationMode = state?.invocationMode ?? "auto";

    const handleToggle = (checked: boolean) => {
        if (checked) {
            enableSkill.mutate(skill.id);
        } else {
            disableSkill.mutate(skill.id);
        }
    };

    const handleModeChange = (mode: string) => {
        setMode.mutate({ id: skill.id, mode: mode as "auto" | "manual" });
    };

    return (
        <Card className="bg-card/50">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                        <h4 className="font-medium text-sm">
                            {skill.metadata.name}
                        </h4>
                        <Badge
                            variant={locationInfo.variant}
                            className="flex items-center gap-1 text-xs"
                        >
                            {locationInfo.icon}
                            {locationInfo.label}
                        </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {skill.metadata.description}
                    </p>
                </div>
                <Switch
                    checked={isEnabled}
                    onCheckedChange={handleToggle}
                    disabled={enableSkill.isPending || disableSkill.isPending}
                />
            </CardHeader>
            <CardContent className="pt-0">
                <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                        Invocation:
                    </span>
                    <Select
                        value={invocationMode}
                        onValueChange={handleModeChange}
                        disabled={!isEnabled || setMode.isPending}
                    >
                        <SelectTrigger className="w-40 h-8 text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="auto">Agent Decides</SelectItem>
                            <SelectItem value="manual">Manual Only</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {skill.scripts.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                        {skill.scripts.length} script
                        {skill.scripts.length !== 1 ? "s" : ""} available
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
