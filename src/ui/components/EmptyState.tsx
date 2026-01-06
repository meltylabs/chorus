import { SplitIcon } from "lucide-react";
import { useMemo } from "react";
import { formatQuickChatShortcut } from "@ui/lib/utils";
import { useSettings } from "./hooks/useSettings";

const getTips = (quickChatShortcut: string) => [
    { content: "Press ⌘K to access commands and search." },
    {
        content: "Create a project to share context across related chats.",
    },
    { content: "Press ⌘J to switch models." },
    {
        content:
            "Drag and drop images, documents, or other files into the chat.",
    },
    { content: "Press ⌘⇧S to share your chat as a web page." },
    { content: "Toggle the sidebar with ⌘B." },
    { content: "Open settings with ⌘," },
    { content: "Press ⌘T to give models access to tools." },
    { content: "Paste in a URL and it will be read for you." },
    {
        content: (
            <>
                Click the <SplitIcon className="w-3 h-3 inline-block mx-1" />{" "}
                icon to fork your chat.
            </>
        ),
    },
    {
        content: `Press ${quickChatShortcut} to open an Ambient Chat.`,
    },
];

export function EmptyState() {
    const settings = useSettings();

    // get the tipindex separately so that it doesn't change if the tip text changes
    const tipIndex = useMemo(() => {
        return Math.floor(Math.random() * getTips("").length);
    }, []);
    const randomTip = getTips(
        formatQuickChatShortcut(settings?.quickChat?.shortcut),
    )[tipIndex];

    return (
        <div className="absolute bottom-0 left-0 right-0 pb-8 flex justify-center">
            <div className="space-y-4 max-w-3xl">
                <div className="text-helper space-y-2 font-[350] text-sm">
                    <p className="flex items-center">
                        Tip: {randomTip.content}
                    </p>
                </div>
            </div>
        </div>
    );
}
