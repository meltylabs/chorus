import React from "react";
import type { ReactNode } from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { CodeBlock } from "./CodeBlock";
import { LatexBlock } from "./LatexBlock";
import { WebPreview } from "./WebPreview";
import { ThinkBlock } from "./ThinkBlock";
import { ToolCallBlock } from "./ToolCallBlock";
import { ToolCallGroup } from "./ToolCallGroup";
import { MermaidPreview } from "./Mermaid";
import { SVGPreview } from "./SVG";
import { ImagePreview } from "./ImagePreview";
import { encode } from "html-entities";

interface ParsedData {
    number: number;
    url: string;
    filename: string;
}

function parseLine(line: string): ParsedData | null {
    const regex = /(\d+)\.\s*\[(.*?)\]\((.*?)\)/;
    const match = line.match(regex);

    if (!match) {
        return null; // Return null if the line doesn't match the pattern
    }

    const number = parseInt(match[1], 10);
    const filename = match[2];
    const url = match[3];

    return { number, url, filename };
}

function extractTextFromChildren(children: ReactNode): string {
    return React.Children.toArray(children)
        .map((child) => {
            if (typeof child === "string") return child;
            if (typeof child === "number") return String(child);
            if (child && "props" in child && "children" in child.props) {
                const props = child.props as { children: ReactNode };
                return extractTextFromChildren(props.children);
            }
            return "";
        })
        .join("");
}

const rehypePlugins = [rehypeHighlight, rehypeRaw];
const remarkPlugins = [remarkGfm, remarkBreaks];

const Code = ({
    className,
    children,
}: {
    className?: string;
    children?: ReactNode;
}) => {
    if (!children) return null;
    if (className?.includes("latex")) {
        return <LatexBlock>{children}</LatexBlock>;
    }
    if (className?.includes("math-inline")) {
        return <LatexBlock inline>{children}</LatexBlock>;
    }
    const content = extractTextFromChildren(children);

    // Check for Mermaid diagrams
    if (className?.includes("language-mermaid")) {
        return <MermaidPreview content={content} />;
    }

    // Check for SVG content
    if (className?.includes("language-svg")) {
        return <SVGPreview content={content} />;
    }

    return content.includes("\n") ? (
        <CodeBlock className={className} content={content} />
    ) : (
        <code className={className}>{children}</code>
    );
};

const Sup = ({ children }: { children?: ReactNode }) => {
    return (
        <sup className="text-sm text-muted-foreground hover:text-blue-300">
            {children}
        </sup>
    );
};

const A = ({ href, children }: { href?: string; children?: ReactNode }) => {
    if (!href) return <>{children}</>;
    return <WebPreview url={href}>{children}</WebPreview>;
};

const Table = ({ children }: { children?: ReactNode }) => {
    return (
        <div className="overflow-x-auto">
            <table className="border-collapse table-auto w-full text-sm">
                {children}
            </table>
        </div>
    );
};

const Thead = ({ children }: { children?: ReactNode }) => {
    return <thead className="bg-muted/50">{children}</thead>;
};

const Th = ({ children }: { children?: ReactNode }) => {
    return (
        <th className="border border-border p-2 text-left font-semibold">
            {children}
        </th>
    );
};

const Td = ({ children }: { children?: ReactNode }) => {
    return <td className="border border-border p-2">{children}</td>;
};

const Think = ({
    children,
    complete,
}: {
    children?: React.ReactNode;
    complete?: string;
}) => {
    const content = extractTextFromChildren(children);
    return <ThinkBlock content={content} isComplete={complete === "true"} />;
};

const ToolCall = ({
    children,
    name,
    "data-input": dataInput,
}: {
    children?: React.ReactNode;
    name?: string;
    "data-input"?: string;
}) => {
    // Decode base64 content if present, otherwise use children
    let content = "";
    if (dataInput) {
        try {
            content = atob(dataInput);
        } catch (e) {
            console.error("[ToolCall] Failed to decode data-input:", e);
            content = extractTextFromChildren(children);
        }
    } else {
        content = extractTextFromChildren(children);
    }

    return <ToolCallBlock toolName={name || "Unknown"} content={content} />;
};

export const Img = ({ src, alt }: { src?: string; alt?: string }) => {
    if (!src) return null;
    return <ImagePreview src={src} alt={alt || "Generated image"} />;
};

const ToolCallGroupWrapper = ({ children }: { children?: React.ReactNode }) => {
    return <ToolCallGroup>{children}</ToolCallGroup>;
};

const components = {
    code: Code,
    sup: Sup,
    a: A,
    table: Table,
    thead: Thead,
    th: Th,
    td: Td,
    think: Think,
    "tool-call": ToolCall,
    "tool-call-group": ToolCallGroupWrapper,
    img: Img,
};

/**
 * Input: markdown that may contain HTML elements not intended for rendering.
 * Encodes any HTML elements that otherwise would be rendered (i.e., outside
 * the code blocks).
 */
function safeEncodeMarkdown(text: string): string {
    // TODO: there's an exception for code blocks only, but it should
    // also do an exception for indented blocks (4 spaces or 1 tab)
    // since those get rendered as code blocks by remark.

    const codeBlocks: string[] = [];
    let codeBlockIndex = 0;
    const codePlaceholderPrefix = "MELTY_CODE_PLACEHOLDER_START_";
    const codePlaceholderSuffix = "_MELTY_CODE_PLACEHOLDER_END";

    const preBlocks: string[] = [];
    let preBlockIndex = 0;
    const prePlaceholderPrefix = "MELTY_PRE_PLACEHOLDER_START_";
    const prePlaceholderSuffix = "_MELTY_PRE_PLACEHOLDER_END";

    const contentWithoutPre = text
        .split("\n")
        .map((line) => {
            if (line.startsWith("    ") || line.startsWith("\t")) {
                preBlocks.push(line);
                return `${prePlaceholderPrefix}${preBlockIndex++}${prePlaceholderSuffix}`;
            }
            return line;
        })
        .join("\n");

    const contentWithoutCode = contentWithoutPre.replace(
        /(```[\s\S]*?```|`[^`]*`)/g,
        (match) => {
            codeBlocks.push(match);
            return `${codePlaceholderPrefix}${codeBlockIndex++}${codePlaceholderSuffix}`;
        },
    );

    let encodedText = encode(contentWithoutCode);

    // Restore code blocks.
    encodedText = encodedText
        .replace(
            new RegExp(
                `${codePlaceholderPrefix}(\\d+)${codePlaceholderSuffix}`,
                "g",
            ),
            (_match, index) => {
                return codeBlocks[Number(index)];
            },
        )
        .replace(
            new RegExp(
                `${prePlaceholderPrefix}(\\d+)${prePlaceholderSuffix}`,
                "g",
            ),
            (_match, index) => {
                return preBlocks[Number(index)];
            },
        );

    return encodedText;
}

export const MessageMarkdown = ({ text }: { text: string }) => {
    // encode any html that would otherwise be rendered
    const encodedText = safeEncodeMarkdown(text);

    const [mainText, sourcesSection] = encodedText.split(/\n\nSources:\n/i);

    // Re-encode think tags, since we do want to render those
    // Also, change <thought> to <think>, since Google uses <thought> (apparently)
    const processedMainText = mainText
        .replace(
            /&lt;think&gt;([\s\S]*?)(?:&lt;\/think&gt;|$)/g,
            (_match, content) => {
                const isComplete = _match.endsWith("&lt;/think&gt;");
                // we have to surround <think> with newlines to appease the Markdown parser, which is apparently sensitive to whitespace
                return `<think complete="${isComplete}">\n${content}\n</think>\n\n`;
            },
        )
        .replace(
            /&lt;thought&gt;([\s\S]*?)(?:&lt;\/thought&gt;|$)/g,
            (_match, content) => {
                // see comment above re the newlines
                const isComplete = _match.endsWith("&lt;/think&gt;");
                return `<think complete="${isComplete}">\n${content}\n</think>\n\n`;
            },
        )
        // Decode tool-call tags so they can be rendered
        .replace(
            /&lt;tool-call\s+name=&quot;([^&]+)&quot;\s+data-input=&quot;([^&]+)&quot;&gt;&lt;\/tool-call&gt;/g,
            (_match, name, dataInput) => {
                return `<tool-call name="${name}" data-input="${dataInput}"></tool-call>`;
            },
        )
        // Group consecutive tool-call tags together
        .replace(/(<tool-call[^>]*><\/tool-call>\s*)+/g, (match) => {
            return `\n<tool-call-group>\n${match}\n</tool-call-group>\n\n`;
        });

    const finalProcessedText = processedMainText;

    const sourceReferences =
        sourcesSection?.split("\n").reduce(
            (acc, line) => {
                const parsed = parseLine(line);
                if (parsed) {
                    acc[parsed.number] = parsed.url;
                }
                return acc;
            },
            {} as Record<string, string>,
        ) || {};

    // Process citation links in the text
    const processedText = finalProcessedText.replace(
        /\[(\d+)\]/g,
        (match, num: string) => {
            const url = sourceReferences[num];
            if (url) {
                return `<sup><a href="${encodeURI(url)}" target="_blank" rel="noopener noreferrer">${num}</a></sup>`;
            }
            return match;
        },
    );

    const sources = sourcesSection?.split("\n").map((line) => {
        const parsed = parseLine(line);
        if (!parsed) return null;
        return `${parsed.number}. [${parsed.filename}](${encodeURI(parsed.url)})`;
    });

    const finalText =
        processedText +
        (sourcesSection ? "\n\nSources:\n" + sources.join("\n") : "");

    return (
        <Markdown
            rehypePlugins={rehypePlugins}
            remarkPlugins={remarkPlugins}
            className={`prose prose-invert select-text text-base`}
            urlTransform={(url) => url} // Allow all URLs to pass through
            components={components}
        >
            {finalText}
        </Markdown>
    );
};
