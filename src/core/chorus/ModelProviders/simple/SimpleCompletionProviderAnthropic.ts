import Anthropic from "@anthropic-ai/sdk";
import {
    ISimpleCompletionProvider,
    SimpleCompletionParams,
    SimpleCompletionMode,
} from "./ISimpleCompletionProvider";

const DEFAULT_TITLE_MODEL = "claude-haiku-4-5";
const DEFAULT_SUMMARIZER_MODEL = "claude-haiku-4-5";

export class SimpleCompletionProviderAnthropic
    implements ISimpleCompletionProvider
{
    constructor(private apiKey: string) {}

    async complete(
        prompt: string,
        params: SimpleCompletionParams,
    ): Promise<string> {
        const client = new Anthropic({
            apiKey: this.apiKey,
            dangerouslyAllowBrowser: true,
        });

        const model = this.getModel(params.model);

        const stream = client.messages.stream({
            model,
            max_tokens: params.maxTokens,
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
        });

        let fullResponse = "";

        stream.on("text", (text: string) => {
            fullResponse += text;
        });

        await stream.finalMessage();

        return fullResponse;
    }

    private getModel(model: SimpleCompletionMode | string | undefined): string {
        if (model === SimpleCompletionMode.SUMMARIZER) {
            return DEFAULT_SUMMARIZER_MODEL;
        }
        if (model === SimpleCompletionMode.TITLE_GENERATION) {
            return DEFAULT_TITLE_MODEL;
        }
        if (typeof model === "string") {
            return model;
        }
        return DEFAULT_TITLE_MODEL;
    }
}
