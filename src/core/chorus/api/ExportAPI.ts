import { db } from "../DB";
import { fetchChat } from "./ChatAPI";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

interface MessageRow {
    message_id: string;
    message_set_id: string;
    model: string;
    text: string;
    created_at: string;
}

interface Turn {
    messageSetId: string;
    user: {
        content: string;
        timestamp: string;
    };
    responses: Array<{
        model: string;
        content: string;
        timestamp: string;
    }>;
}

interface ExportData {
    chatId: string;
    title: string;
    createdAt: string;
    turns: Turn[];
}

async function fetchChatMessages(chatId: string): Promise<MessageRow[]> {
    const messages = await db.select<MessageRow[]>(
        `SELECT
            m.id as message_id,
            m.message_set_id,
            m.model,
            CASE
                WHEN m.model = 'user' THEN COALESCE(m.text, '')
                ELSE COALESCE(NULLIF(m.text, ''), mp.content, '')
            END as text,
            m.created_at
        FROM messages m
        LEFT JOIN message_parts mp ON m.id = mp.message_id AND m.chat_id = mp.chat_id
        WHERE m.chat_id = ?
        ORDER BY m.created_at ASC`,
        [chatId],
    );
    return messages;
}

function groupMessagesByTurns(messages: MessageRow[]): Turn[] {
    const turnMap = new Map<string, Turn>();

    for (const message of messages) {
        if (!turnMap.has(message.message_set_id)) {
            turnMap.set(message.message_set_id, {
                messageSetId: message.message_set_id,
                user: {
                    content: "",
                    timestamp: "",
                },
                responses: [],
            });
        }

        const turn = turnMap.get(message.message_set_id)!;

        if (message.model === "user") {
            turn.user = {
                content: message.text,
                timestamp: message.created_at,
            };
        } else {
            turn.responses.push({
                model: message.model,
                content: message.text,
                timestamp: message.created_at,
            });
        }
    }

    return Array.from(turnMap.values());
}

async function fetchExportData(chatId: string): Promise<ExportData> {
    const chat = await fetchChat(chatId);
    const messages = await fetchChatMessages(chatId);
    const turns = groupMessagesByTurns(messages);

    return {
        chatId: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        turns,
    };
}

function formatAsJSON(data: ExportData): string {
    return JSON.stringify(data, null, 2);
}

function formatAsMarkdown(data: ExportData): string {
    let md = `# ${data.title}\n`;
    md += `Created: ${new Date(data.createdAt).toLocaleDateString()}\n\n`;
    md += `---\n\n`;

    for (const turn of data.turns) {
        // User message
        if (turn.user.content) {
            md += `### You\n${turn.user.content}\n\n`;
        }

        // AI responses
        for (const response of turn.responses) {
            md += `### ${response.model}\n${response.content}\n\n`;
        }

        md += `---\n\n`;
    }

    return md;
}

export async function exportChatAsJSON(chatId: string): Promise<void> {
    const data = await fetchExportData(chatId);
    const jsonContent = formatAsJSON(data);

    const filePath = await save({
        defaultPath: `${data.title || "chat"}.json`,
        filters: [
            {
                name: "JSON",
                extensions: ["json"],
            },
        ],
    });

    if (filePath) {
        await writeTextFile(filePath, jsonContent);
    }
}

export async function exportChatAsMarkdown(chatId: string): Promise<void> {
    const data = await fetchExportData(chatId);
    const mdContent = formatAsMarkdown(data);

    const filePath = await save({
        defaultPath: `${data.title || "chat"}.md`,
        filters: [
            {
                name: "Markdown",
                extensions: ["md"],
            },
        ],
    });

    if (filePath) {
        await writeTextFile(filePath, mdContent);
    }
}
