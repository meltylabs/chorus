import { getProviderName, ProviderName } from "@core/chorus/Models";
import { OPENROUTER_CUSTOM_PROVIDER_LOGOS } from "@ui/lib/models";
import { cn } from "@ui/lib/utils";
import { BoxIcon } from "lucide-react";
import {
    RiAnthropicFill,
    RiOpenaiFill,
    RiGoogleFill,
    RiPerplexityFill,
    RiQuestionMark,
    RiMetaFill,
} from "react-icons/ri";

// can pass in either provider or modelId. provider takes precedence over modelId
export type ProviderLogoProps = {
    provider?: ProviderName;
    modelId?: string; // full model ID, which is useful for default openrouter model logo handling
    className?: string;
    size?: "xs" | "sm" | "md" | "lg";
};

export function ProviderLogo({
    provider,
    modelId,
    className,
    size = "md",
}: ProviderLogoProps) {
    // if neither are provided, will be handled in getLogoComponent
    let finalProvider = provider;
    if (!finalProvider && modelId) {
        finalProvider = getProviderName(modelId);
    }

    const sizeClasses = {
        xs: "w-3 h-3",
        sm: "w-4 h-4",
        md: "w-6 h-6",
        lg: "w-8 h-8",
    };

    const getLogoComponent = (provider: ProviderName | undefined) => {
        switch (provider) {
            case "anthropic":
                return <RiAnthropicFill className="w-4 h-4" />;
            case "openai":
                return <RiOpenaiFill className="w-4 h-4" />;
            case "google":
                return <RiGoogleFill className="w-4 h-4" />;
            case "vertex":
                return <RiGoogleFill className="w-4 h-4" />;
            case "perplexity":
                return <RiPerplexityFill className="w-4 h-4" />;
            case "meta":
                return <RiMetaFill className="w-4 h-4" />;
            case "grok":
                return (
                    <img
                        src="/xai_light.svg"
                        alt="Grok"
                        className="w-4 h-4 dark:invert"
                    />
                );
            case "groq":
                return <img src="/groq.png" alt="Groq" className="w-4 h-4" />;
            case "mistral":
                return (
                    <img src="/mistral.png" alt="Mistral" className="w-4 h-4" />
                );
            case "cerebras":
                return (
                    <img
                        src="/cerebras.png"
                        alt="Cerebras"
                        className="w-4 h-4"
                    />
                );
            case "fireworks":
                return (
                    <img
                        src="/fireworks.png"
                        alt="Fireworks"
                        className="w-4 h-4"
                    />
                );
            case "together":
                return (
                    <img
                        src="/together.png"
                        alt="Together.ai"
                        className="w-4 h-4"
                    />
                );
            case "nvidia":
                return (
                    <img src="/nvidia.png" alt="Nvidia" className="w-4 h-4" />
                );
            case "openrouter":
                if (modelId && modelId in OPENROUTER_CUSTOM_PROVIDER_LOGOS) {
                    return getLogoComponent(
                        OPENROUTER_CUSTOM_PROVIDER_LOGOS[modelId],
                    );
                }
                return (
                    <img
                        src="/openrouter_dark.svg"
                        alt="OpenRouter"
                        className="w-4 h-4 invert dark:invert-0"
                    />
                );
            case "custom_openai":
            case "custom_anthropic":
                return <BoxIcon className="w-4 h-4" />;
            default: {
                // @ts-expect-error: creating unused variable to provide exhaustiveness check
                const _unused: never = provider;
                console.warn(
                    `Unknown provider: ${(provider ?? "unknown") as string}`,
                );
                return <RiQuestionMark className="w-4 h-4" />;
            }
        }
    };

    return (
        <div
            className={cn(
                "flex items-center justify-center rounded-full",
                sizeClasses[size],
                className,
            )}
        >
            {getLogoComponent(finalProvider)}
        </div>
    );
}
