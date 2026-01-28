import { SettingsManager } from "@core/utilities/Settings";
import { StreamResponseParams } from "../Models";
import { IProvider, ModelDisabled } from "./IProvider";
import { ProviderAnthropic } from "./ProviderAnthropic";

function parseCustomProviderModelId(modelId: string): {
    providerId: string;
    modelName: string;
} {
    const parts = modelId.split("::");
    if (parts.length < 3) {
        throw new Error(`Invalid custom provider model id: ${modelId}`);
    }

    const providerId = parts[1] ?? "";
    const modelName = parts.slice(2).join("::");

    if (!providerId || !modelName) {
        throw new Error(`Invalid custom provider model id: ${modelId}`);
    }

    return { providerId, modelName };
}

export class ProviderCustomAnthropic implements IProvider {
    async streamResponse(
        params: StreamResponseParams,
    ): Promise<ModelDisabled | void> {
        const { providerId, modelName } = parseCustomProviderModelId(
            params.modelConfig.modelId,
        );

        const settings = await SettingsManager.getInstance().get();
        const provider = (settings.customProviders ?? []).find(
            (p) => p.id === providerId && p.kind === "anthropic",
        );

        if (!provider) {
            throw new Error(
                "Custom provider not found. Please check your Providers settings.",
            );
        }

        if (!provider.apiBaseUrl.trim()) {
            throw new Error(
                `Please add an API base URL for "${provider.name}" in Settings.`,
            );
        }

        if (!provider.apiKey.trim()) {
            throw new Error(
                `Please add an API key for "${provider.name}" in Settings.`,
            );
        }

        const mappedModelConfig = {
            ...params.modelConfig,
            modelId: `anthropic::${modelName}`,
        };

        const mappedApiKeys = {
            ...params.apiKeys,
            anthropic: provider.apiKey,
        };

        const anthropic = new ProviderAnthropic();
        return anthropic.streamResponse({
            ...params,
            modelConfig: mappedModelConfig,
            apiKeys: mappedApiKeys,
            customBaseUrl: params.customBaseUrl || provider.apiBaseUrl,
        });
    }
}
