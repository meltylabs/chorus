import { getProviderName, ProviderName } from "@core/chorus/Models";
import { cn } from "@ui/lib/utils";
import { RiAnthropicFill, RiQuestionMark } from "react-icons/ri";

// can pass in either provider or modelId. provider takes precedence over modelId
export type ProviderLogoProps = {
    provider?: ProviderName;
    modelId?: string;
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
            case "claude-code":
                return <RiAnthropicFill className="w-4 h-4" />;
            default: {
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
