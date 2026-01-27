import { useState, useEffect, useRef } from "react";
import { Brain } from "lucide-react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Label } from "./ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./ui/select";
import { Input } from "./ui/input";
import { ModelConfig, getProviderName } from "@core/chorus/Models";
import * as ModelsAPI from "@core/chorus/api/ModelsAPI";
import { toast } from "sonner";

interface ThinkingParamsButtonProps {
    modelConfig: ModelConfig;
}

export function ThinkingParamsButton({
    modelConfig,
}: ThinkingParamsButtonProps) {
    const updateThinkingParams = ModelsAPI.useUpdateThinkingParams();
    const [open, setOpen] = useState(false);

    // Local state to avoid stale closure issues
    // These track the current database values
    const [localBudgetTokens, setLocalBudgetTokens] = useState<string>(
        modelConfig.budgetTokens?.toString() ?? "",
    );

    // Sync local state when modelConfig changes from query refetch
    useEffect(() => {
        setLocalBudgetTokens(modelConfig.budgetTokens?.toString() ?? "");
    }, [modelConfig.budgetTokens]);

    // Debounce ref for budget tokens input
    const budgetDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );

    const providerName = getProviderName(modelConfig.modelId);
    const modelName = modelConfig.modelId.split("::")[1];

    // Determine which parameters to show based on provider
    const showReasoningEffort =
        providerName === "openai" || providerName === "grok";
    const showBudgetTokens =
        providerName === "anthropic" || modelName?.includes("gemini-2.5");
    const showThinkingLevel = modelName?.includes("gemini-3");

    // Don't show the button if no thinking parameters are applicable
    if (!showReasoningEffort && !showBudgetTokens && !showThinkingLevel) {
        return null;
    }

    // Show indicator if any thinking params are set
    const hasThinkingParams =
        modelConfig.budgetTokens ||
        modelConfig.reasoningEffort ||
        modelConfig.thinkingLevel;

    // Each handler ONLY updates its own field - avoids stale closure issues
    const handleReasoningEffortChange = async (value: string) => {
        const newEffort =
            value === "default"
                ? null
                : (value as "low" | "medium" | "high" | "xhigh");

        try {
            await updateThinkingParams.mutateAsync({
                modelConfigId: modelConfig.id,
                reasoningEffort: newEffort,
            });
        } catch (error) {
            toast.error("Failed to update reasoning effort");
        }
    };

    const handleThinkingLevelChange = async (value: string) => {
        const newLevel = value === "default" ? null : (value as "LOW" | "HIGH");

        try {
            await updateThinkingParams.mutateAsync({
                modelConfigId: modelConfig.id,
                thinkingLevel: newLevel,
            });
        } catch (error) {
            toast.error("Failed to update thinking level");
        }
    };

    const handleBudgetTokensChange = (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const value = e.target.value;
        setLocalBudgetTokens(value);

        // Clear existing debounce
        if (budgetDebounceRef.current) {
            clearTimeout(budgetDebounceRef.current);
        }

        // Debounce the API call
        budgetDebounceRef.current = setTimeout(async () => {
            const numValue = value === "" ? null : parseInt(value);

            if (value !== "" && isNaN(numValue as number)) {
                return; // Invalid input, don't save
            }

            try {
                await updateThinkingParams.mutateAsync({
                    modelConfigId: modelConfig.id,
                    budgetTokens: numValue,
                });
            } catch (error) {
                toast.error("Failed to update budget tokens");
            }
        }, 500);
    };

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            if (budgetDebounceRef.current) {
                clearTimeout(budgetDebounceRef.current);
            }
        };
    }, []);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className={`h-7 px-2 gap-1 ${hasThinkingParams ? "text-accent-600" : "text-muted-foreground"} hover:bg-muted/50`}
                >
                    <Brain className="w-3.5 h-3.5" />
                    {hasThinkingParams && (
                        <span className="text-xs font-medium">
                            {modelConfig.reasoningEffort ||
                                modelConfig.thinkingLevel ||
                                (modelConfig.budgetTokens
                                    ? `${modelConfig.budgetTokens}t`
                                    : "")}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
                <div className="space-y-4">
                    <div>
                        <h4 className="font-medium text-sm mb-1">
                            Thinking Parameters
                        </h4>
                        <p className="text-xs text-muted-foreground">
                            Control how much the model thinks before responding
                        </p>
                    </div>

                    {showReasoningEffort && (
                        <div className="space-y-2">
                            <Label
                                htmlFor="reasoning-effort"
                                className="text-xs"
                            >
                                Reasoning Effort
                                {providerName === "openai" && (
                                    <span className="text-muted-foreground ml-1">
                                        (OpenAI)
                                    </span>
                                )}
                                {providerName === "grok" && (
                                    <span className="text-muted-foreground ml-1">
                                        (xAI Grok)
                                    </span>
                                )}
                            </Label>
                            <Select
                                value={
                                    modelConfig.reasoningEffort || "default"
                                }
                                onValueChange={handleReasoningEffortChange}
                            >
                                <SelectTrigger id="reasoning-effort">
                                    <SelectValue placeholder="Default (medium)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">
                                        Default (medium)
                                    </SelectItem>
                                    <SelectItem value="low">
                                        Low - Fast & economical
                                    </SelectItem>
                                    <SelectItem value="medium">
                                        Medium - Balanced
                                    </SelectItem>
                                    <SelectItem value="high">
                                        High - More thorough
                                    </SelectItem>
                                    {providerName === "openai" && (
                                        <SelectItem value="xhigh">
                                            Extra High - Maximum reasoning
                                        </SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {showBudgetTokens && (
                        <div className="space-y-2">
                            <Label htmlFor="budget-tokens" className="text-xs">
                                Thinking Budget (tokens)
                                {providerName === "anthropic" && (
                                    <span className="text-muted-foreground ml-1">
                                        (Claude)
                                    </span>
                                )}
                                {modelName?.includes("gemini-2.5") && (
                                    <span className="text-muted-foreground ml-1">
                                        (Gemini 2.5)
                                    </span>
                                )}
                            </Label>
                            <Input
                                id="budget-tokens"
                                type="number"
                                placeholder={
                                    providerName === "anthropic"
                                        ? "1024-20000"
                                        : "0-24576 or -1 for dynamic"
                                }
                                value={localBudgetTokens}
                                onChange={handleBudgetTokensChange}
                                min={providerName === "anthropic" ? 1024 : -1}
                                max={
                                    providerName === "anthropic" ? 20000 : 24576
                                }
                            />
                            <p className="text-xs text-muted-foreground">
                                {providerName === "anthropic"
                                    ? "Min 1024. Higher = more reasoning time & cost"
                                    : "Set to -1 for dynamic budget"}
                            </p>
                        </div>
                    )}

                    {showThinkingLevel && (
                        <div className="space-y-2">
                            <Label htmlFor="thinking-level" className="text-xs">
                                Thinking Level
                                <span className="text-muted-foreground ml-1">
                                    (Gemini 3)
                                </span>
                            </Label>
                            <Select
                                value={modelConfig.thinkingLevel || "default"}
                                onValueChange={handleThinkingLevelChange}
                            >
                                <SelectTrigger id="thinking-level">
                                    <SelectValue placeholder="Default (HIGH)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">
                                        Default (HIGH)
                                    </SelectItem>
                                    <SelectItem value="LOW">
                                        LOW - Simple tasks, faster
                                    </SelectItem>
                                    <SelectItem value="HIGH">
                                        HIGH - Complex tasks, thorough
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
