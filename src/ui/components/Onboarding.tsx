import { useEffect, useState, useCallback } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SettingsManager } from "@core/utilities/Settings";
import * as AppMetadataAPI from "@core/chorus/api/AppMetadataAPI";
import { useQueryClient } from "@tanstack/react-query";

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
    const onboardingStep = AppMetadataAPI.useOnboardingStep();
    const setOnboardingStep = AppMetadataAPI.useSetOnboardingStep();
    const [openRouterKey, setOpenRouterKey] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const queryClient = useQueryClient();

    const handleNextStep = useCallback(() => {
        setOnboardingStep.mutate({ step: 1 });
    }, [setOnboardingStep]);

    const handleSaveAndComplete = useCallback(async () => {
        if (openRouterKey.trim()) {
            setIsSaving(true);
            const settingsManager = SettingsManager.getInstance();
            const currentSettings = await settingsManager.get();
            const newApiKeys = {
                ...currentSettings.apiKeys,
                openrouter: openRouterKey.trim(),
            };
            await settingsManager.set({
                ...currentSettings,
                apiKeys: newApiKeys,
            });
            await queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
            setIsSaving(false);
        }
        onComplete();
    }, [openRouterKey, queryClient, onComplete]);

    // Allow pressing Enter to continue quickly
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault();
                if (onboardingStep === 0) {
                    handleNextStep();
                } else {
                    void handleSaveAndComplete();
                }
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [onboardingStep, handleNextStep, handleSaveAndComplete]);

    if (onboardingStep === 0) {
        return (
            <div
                data-tauri-drag-region
                className="fixed inset-0 z-50 flex flex-col items-center justify-center min-h-screen bg-background/95 backdrop-blur-sm px-4"
            >
                <div className="text-center space-y-6 max-w-3xl w-full">
                    <div className="space-y-2">
                        <h1 className="text-2xl font-semibold tracking-tight">
                            Welcome to Chorus
                        </h1>
                        <p className="text text-muted-foreground pb-6">
                            All the AI, on your Mac.
                        </p>
                        <img
                            src="https://meltylabs.t3.storage.dev/screenshot_light.png"
                            className="rounded-lg max-w-3xl mx-auto border border-border shadow-sm"
                            alt="Chorus screenshot"
                        />
                    </div>

                    <Button className="mt-4" onClick={handleNextStep}>
                        Get started <span className="text-sm">↵</span>
                    </Button>
                </div>
            </div>
        );
    }

    // Step 2: OpenRouter API key
    return (
        <div
            data-tauri-drag-region
            className="fixed inset-0 z-50 flex flex-col items-center justify-center min-h-screen bg-background/95 backdrop-blur-sm px-4"
        >
            <div className="text-center space-y-6 max-w-md w-full">
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Add an API Key
                    </h1>
                    <p className="text-muted-foreground">
                        Chorus runs on API keys. We recommend{" "}
                        <a
                            href="https://openrouter.ai/keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline underline-offset-4"
                        >
                            OpenRouter
                        </a>{" "}
                        to get started.
                    </p>
                </div>

                <div className="space-y-2 text-left">
                    <Label htmlFor="openrouter-key">OpenRouter API Key</Label>
                    <Input
                        id="openrouter-key"
                        type="password"
                        placeholder="sk-or-..."
                        value={openRouterKey}
                        onChange={(e) => setOpenRouterKey(e.target.value)}
                        autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                        You can add more API keys later in Settings.
                    </p>
                </div>

                <div className="flex flex-col gap-2">
                    <Button
                        className="w-full"
                        onClick={() => void handleSaveAndComplete()}
                        disabled={isSaving}
                    >
                        {openRouterKey.trim()
                            ? "Save and continue"
                            : "Skip for now"}{" "}
                        <span className="text-sm">↵</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
