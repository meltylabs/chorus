import OpenAI from "openai";
import {
    ISimpleCompletionProvider,
    SimpleCompletionParams,
    SimpleCompletionMode,
} from "./ISimpleCompletionProvider";

const DEFAULT_TITLE_MODEL = "gpt-5-mini";
const DEFAULT_SUMMARIZER_MODEL = "gpt-5-mini";

export class SimpleCompletionProviderOpenAI
    implements ISimpleCompletionProvider
{
    constructor(private apiKey: string) {}

    async complete(
        prompt: string,
        params: SimpleCompletionParams,
    ): Promise<string> {
        const client = new OpenAI({
            apiKey: this.apiKey,
            dangerouslyAllowBrowser: true,
        });

        const model = this.getModel(params.model);

        const stream = await client.chat.completions.create({
            model,
            max_tokens: params.maxTokens,
            stream: true,
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
        });

        let fullResponse = "";

        for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content;
            if (typeof delta === "string") {
                fullResponse += delta;
            }
        }

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
