import { ApiKeys } from "../../Models";
import { canProceedWithProvider } from "@core/utilities/ProxyUtils";
import { ISimpleCompletionProvider } from "./ISimpleCompletionProvider";
import { SimpleCompletionProviderAnthropic } from "./SimpleCompletionProviderAnthropic";

/**
 * Factory function that returns the Anthropic simple completion provider.
 *
 * @param apiKeys The API keys object from settings
 * @returns An ISimpleCompletionProvider instance
 * @throws Error if Anthropic API key is not configured
 */
export function getSimpleCompletionProvider(
    apiKeys: ApiKeys,
): ISimpleCompletionProvider {
    const check = canProceedWithProvider("anthropic", apiKeys);
    const apiKey = apiKeys.anthropic;

    if (check.canProceed && apiKey) {
        return new SimpleCompletionProviderAnthropic(apiKey);
    }

    throw new Error(
        `Please add an Anthropic API key in Settings to generate chat titles. ${check.reason ?? ""}`,
    );
}
