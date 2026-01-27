import { useState } from "react";
import { Brain, ChevronDown } from "lucide-react";
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
    const [budgetTokens, setBudgetTokens] = useState<string>(
        modelConfig.budgetTokens?.toString() ?? "",
    );
    const [reasoningEffort, setReasoningEffort] = useState<
        "low" | "medium" | "high" | "xhigh" | ""
    >(modelConfig.reasoningEffort ?? "");
    const [thinkingLevel, setThinkingLevel] = useState<"LOW" | "HIGH" | "">(
        modelConfig.thinkingLevel ?? "",
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

    const handleSave = async () => {
        try {
            await updateThinkingParams.mutateAsync({
                modelConfigId: modelConfig.id,
                budgetTokens: budgetTokens ? parseInt(budgetTokens) : null,
                reasoningEffort: reasoningEffort || null,
                thinkingLevel: thinkingLevel || null,
            });
            toast.success("Thinking parameters updated");
            setOpen(false);
        } catch (error) {
            toast.error("Failed to update thinking parameters");
            console.error(error);
        }
    };

    const handleReset = async () => {
        try {
            await updateThinkingParams.mutateAsync({
                modelConfigId: modelConfig.id,
                budgetTokens: null,
                reasoningEffort: null,
                thinkingLevel: null,
            });
            setBudgetTokens("");
            setReasoningEffort("");
            setThinkingLevel("");
            toast.success("Thinking parameters reset");
        } catch (error) {
            toast.error("Failed to reset thinking parameters");
            console.error(error);
        }
    };

    // Show indicator if any thinking params are set
    const hasThinkingParams =
        modelConfig.budgetTokens ||
        modelConfig.reasoningEffort ||
        modelConfig.thinkingLevel;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className={`h-6 px-2 gap-1 ${hasThinkingParams ? "text-accent-600" : "text-muted-foreground"}`}
                >
                    <Brain className="w-3.5 h-3.5" />
                    {hasThinkingParams && (
                        <span className="text-xs">
                            {modelConfig.reasoningEffort ||
                                modelConfig.thinkingLevel ||
                                (modelConfig.budgetTokens
                                    ? `${modelConfig.budgetTokens}t`
                                    : "")}
                        </span>
                    )}
                    <ChevronDown className="w-3 h-3" />
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
                                value={reasoningEffort}
                                onValueChange={(value) =>
                                    setReasoningEffort(
                                        value as
                                            | "low"
                                            | "medium"
                                            | "high"
                                            | "xhigh"
                                            | "",
                                    )
                                }
                            >
                                <SelectTrigger id="reasoning-effort">
                                    <SelectValue placeholder="Default (auto)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">
                                        Default (auto)
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
                                value={budgetTokens}
                                onChange={(e) =>
                                    setBudgetTokens(e.target.value)
                                }
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
                                value={thinkingLevel}
                                onValueChange={(value) =>
                                    setThinkingLevel(
                                        value as "LOW" | "HIGH" | "",
                                    )
                                }
                            >
                                <SelectTrigger id="thinking-level">
                                    <SelectValue placeholder="Default (HIGH)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">
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

                    <div className="flex gap-2 pt-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleReset}
                            className="flex-1"
                        >
                            Reset
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={updateThinkingParams.isPending}
                            className="flex-1"
                        >
                            {updateThinkingParams.isPending
                                ? "Saving..."
                                : "Save"}
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
