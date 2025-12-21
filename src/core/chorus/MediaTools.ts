import { ApiKeys } from "./Models";

type ImageGenerationResult = {
    content: string;
    error?: string;
};

export class MediaTools {
    static async generateImage(
        _prompt: string,
        _apiKeys: ApiKeys,
    ): Promise<ImageGenerationResult> {
        // Image generation is not currently available
        // This will be replaced with motion graphics generation in Ripple
        throw new Error(
            "Image generation is not currently available. This feature will be replaced with motion graphics generation.",
        );
    }
}
