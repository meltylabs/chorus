import { useState, useCallback, useEffect, useRef } from "react";
import * as DraftAPI from "@core/chorus/api/DraftAPI";
import { llmConversation } from "@core/chorus/ChatState";
import { llmMessageToString } from "@core/chorus/Models";
import { simpleLLM } from "@core/chorus/simpleLLM";
import { Button } from "./ui/button";
import * as ChatAPI from "@core/chorus/api/ChatAPI";
import * as MessageAPI from "@core/chorus/api/MessageAPI";

interface ChatSuggestionsProps {
    chatId: string;
    inputRef: React.RefObject<HTMLTextAreaElement>;
}

export function ChatSuggestions({ chatId, inputRef }: ChatSuggestionsProps) {
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(true); // Start as true to show skeletons immediately
    const hasStartedGenerating = useRef(false);
    const { setDraft } = DraftAPI.useAutoSyncMessageDraft(chatId, 0);

    useEffect(() => {
        if (!hasStartedGenerating.current && suggestions.length === 0) {
            hasStartedGenerating.current = true;

            const generateSuggestions = async () => {
                setIsGenerating(true);
                try {
                    // Get recent chats
                    const recentChats = await ChatAPI.fetchChats();

                    // Take up to 5 recent chats (excluding current)
                    const otherChats = recentChats
                        .filter((chat) => chat.id !== chatId)
                        .filter((chat) => !chat.quickChat)
                        .slice(0, 5);

                    if (otherChats.length < 5) {
                        // If no recent chats, show chorus-focused boilerplate suggestions
                        setSuggestions([
                            "Show me how to give models tool access",
                            "How can I chat with multiple models?",
                        ]);
                        setIsGenerating(false);
                        return;
                    }

                    // Get messages from recent chats
                    const recentConversations = await Promise.all(
                        otherChats.map(async (chat) => {
                            const messageSets =
                                await MessageAPI.fetchMessageSets(chat.id);
                            const messages = llmConversation(messageSets);
                            return {
                                chatTitle: chat.title || "Untitled",
                                messages: messages.slice(0, 6), // First few messages
                            };
                        }),
                    );

                    // Create a prompt to generate suggestions
                    const prompt = `Based on these recent chat conversations, generate 3 specific questions or tasks the user might want to work on next.

Recent conversations:
${recentConversations
    .map(
        (conv) =>
            `Chat: ${conv.chatTitle}
${conv.messages.map((m) => `${m.role}: ${llmMessageToString(m).slice(0, 200)}...`).join("\n")}`,
    )
    .join("\n\n")}

Generate exactly 2 suggestions as a JSON array of strings. Each suggestion should be:

<rules>
- A direct question or task the user would type (e.g., "Help me optimize this SQL query" or "Explain async/await in JavaScript")
- NOT meta-level suggestions about generating ideas or having conversations
- Specific and actionable, or topics the user may be interested in based on the recent chats
- Written from the user's perspective, as if they are typing it
- Even if chat history is limited, come up with 2 suggestions. You should never not try.
</rules>

<example>
["Debug this TypeScript error I'm getting", "Write a unit test for my authentication module", "How do I implement caching in Redis?", "Refactor this function to use functional programming"]
</example>
`;

                    // Use simpleLLM to generate suggestions
                    let response: string;
                    try {
                        response = await simpleLLM(prompt, {
                            maxTokens: 512,
                        });
                    } catch (llmError) {
                        console.error("Error calling simpleLLM:", llmError);
                        // Don't show suggestions if LLM fails
                        setSuggestions([]);
                        setIsGenerating(false);
                        return;
                    }

                    try {
                        const parsed = JSON.parse(response) as string[];
                        setSuggestions(parsed.slice(0, 2));
                    } catch {
                        console.error("Invalid response format", response);
                        setSuggestions([]);
                    }
                } catch (error) {
                    console.error("Error generating suggestions:", error);
                    // Don't show suggestions on error
                    setSuggestions([]);
                } finally {
                    setIsGenerating(false);
                }
            };

            void generateSuggestions();
        }
    }, [chatId, suggestions.length]);

    const handleSuggestionClick = useCallback(
        (suggestion: string) => {
            setDraft(suggestion);
            // Focus the input
            inputRef.current?.focus();
        },
        [setDraft, inputRef],
    );

    return (
        <ChatSuggestionsDisplay
            onSuggestionClick={handleSuggestionClick}
            isGeneratingSuggestions={isGenerating}
            modelSuggestions={suggestions}
        />
    );
}

interface ChatSuggestionsDisplayProps {
    onSuggestionClick?: (suggestion: string) => void;
    isGeneratingSuggestions?: boolean;
    modelSuggestions?: string[];
}

function ChatSuggestionsDisplay({
    onSuggestionClick,
    modelSuggestions,
}: ChatSuggestionsDisplayProps) {
    // display up to 3 suggestions
    const suggestions = Array.from({ length: 3 }, (_, index) =>
        modelSuggestions && modelSuggestions.length > index
            ? modelSuggestions[index]
            : "...",
    );

    suggestions.reverse();

    return (
        <div className="relative flex justify-center w-full">
            <div className="relative w-full overflow-x-auto no-scrollbar py-1">
                {onSuggestionClick && (
                    <div className="flex gap-2 justify-center min-w-max pr-12">
                        {suggestions.map((suggestion, index) => (
                            <div
                                key={index}
                                className={`transition-opacity duration-1000 ${
                                    suggestion === "..."
                                        ? "opacity-0"
                                        : "opacity-100"
                                }`}
                                style={{
                                    transitionDelay: `${index * 250}ms`,
                                }}
                            >
                                <Button
                                    variant="outline"
                                    className="rounded-full text-foreground !border-input-border border-dashed hover:bg-foreground/5 whitespace-nowrap"
                                    size="sm"
                                    onClick={() =>
                                        onSuggestionClick(suggestion)
                                    }
                                >
                                    {suggestion}
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="absolute left-0 top-1 bottom-1 w-8 bg-gradient-to-r from-background to-transparent pointer-events-none z-10" />
            <div className="absolute right-0 top-1 bottom-1 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none z-10" />
        </div>
    );
}
