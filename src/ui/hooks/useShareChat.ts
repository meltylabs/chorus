import { toast } from "sonner";
import { fetch } from "@tauri-apps/plugin-http";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import * as ChatAPI from "@core/chorus/api/ChatAPI";
import { config } from "@core/config";

export function useShareChat(chatId: string) {
    const chatQuery = ChatAPI.useChat(chatId);

    const [isGeneratingShareLink, setIsGeneratingShareLink] = useState(false);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [copiedUrl, setCopiedUrl] = useState(false);

    const doShareChat = async (html: string) => {
        if (!chatQuery.isSuccess) {
            console.warn("Can't share chat", chatQuery.status);
            return;
        }
        setIsGeneratingShareLink(true);
        try {
            // Create a full HTML document with necessary styles
            const fullHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Ripple - ${chatQuery.data.title}</title>
                    <style>
                        ${Array.from(document.styleSheets)
                            .map((sheet) => {
                                try {
                                    return Array.from(sheet.cssRules)
                                        .map((rule) => rule.cssText)
                                        .join("\n");
                                } catch (_) {
                                    // Skip external stylesheets
                                    return "";
                                }
                            })
                            .join("\n")}
                    </style>
                    <style>
                        article {
                            padding: 3rem;
                        }
                        button, .no-print {
                            display: none !important;
                        }
                        .print-model-name {
                            background-color: white;
                            padding: 0.5rem;
                        }
                        header {
                            position: fixed;
                            top: 0; left: 0; right: 0;
                            background: white;
                            border-bottom: 1px solid #e2e8f0;
                            z-index: 10;
                        }
                        article {
                            margin-top: 3rem;
                        }
                    </style>
                </head>
                <body>
                 <header class="px-4 py-3 border-b border-zinc-200 font-geist">
                    <div class="flex w-full justify-between items-center">
                    <div class="flex items-center gap-2">
                        <img src="/images/ripple-logo.png" class="h-8 shadow-sm w-auto rounded-md border border-zinc-200" alt="Ripple Logo" />
                        <span class="text font-medium text-zinc-900">Ripple</span>
                    </div>
                    <p class="text-sm text-zinc-600">
                        <a href="https://chorus.sh" class="bg-zinc-800 text-white px-2.5 py-2 font-medium rounded-md hover:bg-zinc-700">
                        Download &rarr;
                        </a>
                    </p>
                    </div>
                </header>

                <article>
                    ${html}
                </article>
                </body>
                </html>
            `;

            try {
                const response = await fetch(
                    `${config.meltyProxyUrl}/chats/read-only/`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ chatId, html: fullHtml }),
                    },
                );

                if (!response.ok) {
                    toast.error("Error", {
                        description: "Failed to share chat",
                    });
                    return;
                }

                const url = `${config.meltyProxyUrl}/chats/read-only/${chatId}`;
                setShareUrl(url);
            } catch (error) {
                console.error("Error sharing chat:", error);
                toast.error("Error", {
                    description: "Failed to share chat",
                });
            }
        } catch (error) {
            console.error("Error sharing chat:", error);
            toast.error("Error", {
                description: "Failed to share chat",
            });
        } finally {
            setIsGeneratingShareLink(false);
        }
    };

    const handleCopyShareUrl = async () => {
        if (!shareUrl) return;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopiedUrl(true);
            setTimeout(() => setCopiedUrl(false), 2000);
        } catch (error) {
            console.error("Error copying share URL:", error);
            toast.error("Failed to copy to clipboard");
        }
    };

    const handleOpenShareUrl = async () => {
        if (!shareUrl) return;
        await openUrl(shareUrl);
        setShareUrl(null);
    };

    const handleDeleteShare = async () => {
        if (!shareUrl) return;

        try {
            // Extract the ID from the URL
            const match = shareUrl.match(/\/chats\/read-only\/([^/]+)$/);
            if (!match || !match[1]) {
                throw new Error("Invalid share URL format");
            }
            const shareId = match[1];

            const response = await fetch(
                `${config.meltyProxyUrl}/chats/read-only/${shareId}`,
                {
                    method: "DELETE",
                    headers: {
                        "Content-Type": "application/json",
                    },
                },
            );

            if (!response.ok) {
                throw new Error("Failed to delete shared chat");
            }

            setShareUrl(null);
            toast.success("Share link deleted", {
                description: "The chat is no longer publicly accessible",
            });
        } catch (error) {
            console.error("Error deleting share:", error);
            toast.error("Error", {
                description: "Failed to delete share link",
            });
        }
    };

    return {
        isGeneratingShareLink,
        shareUrl,
        copiedUrl,
        doShareChat,
        handleCopyShareUrl,
        handleOpenShareUrl,
        handleDeleteShare,
        setShareUrl,
    };
}
