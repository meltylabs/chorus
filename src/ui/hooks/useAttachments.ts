import { allowedExtensions } from "@core/chorus/Models";
import {
    fileTypeToAttachmentType,
    generateStorePath,
    resizeAndStoreFileData,
    canScrape,
    scrapeTimestamps,
    scrapeUrlAndWriteToPath,
    getScreenshotAttachment,
} from "@core/chorus/AttachmentsHelpers";
import { useMutation } from "@tanstack/react-query";
import { storeFile } from "@core/chorus/AttachmentsHelpers";
import * as AttachmentsAPI from "@core/chorus/api/AttachmentsAPI";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { captureWholeScreenCompressed } from "@core/chorus/screenshot";
import * as ProjectAPI from "@core/chorus/api/ProjectAPI";
import * as DraftAPI from "@core/chorus/api/DraftAPI";
import { invoke } from "@tauri-apps/api/core";

export function useFilePaste({
    association,
}: {
    association: AttachmentsAPI.AttachmentAssociation;
}) {
    const createAttachment = AttachmentsAPI.useCreateAttachment();
    const finalizeAttachmentForProject =
        ProjectAPI.useFinalizeAttachmentForProject();
    const finalizeAttachmentForDraft = DraftAPI.useFinalizeAttachmentForDraft();

    return useMutation({
        mutationKey: ["filePaste"] as const,
        mutationFn: async (files: File[]) => {
            const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB

            // possible issue: if one attachment fails to save, others may get cut off as well
            await Promise.all(
                files.map(async (file) => {
                    // Check file size
                    if (file.size > MAX_FILE_SIZE) {
                        toast.error(`File "${file.name}" is too large`, {
                            description: `Size: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum size is 30MB.`,
                        });
                        return;
                    }

                    // 1. create attachment
                    const attachmentId = await createAttachment.mutateAsync({
                        type: fileTypeToAttachmentType(file.name) || "text",
                        originalName: file.name,
                        path: file.name,
                        association,
                    });

                    // 2. store
                    const { storedPath, realExtension } =
                        await resizeAndStoreFileData(file); // storeFile handles generating a new path

                    // 3. finalize
                    if (association.type === "project") {
                        await finalizeAttachmentForProject.mutateAsync({
                            attachmentId,
                            storedPath,
                            projectId: association.projectId,
                            type:
                                fileTypeToAttachmentType(realExtension) ||
                                "text",
                        });
                    } else if (association.type === "draft") {
                        await finalizeAttachmentForDraft.mutateAsync({
                            attachmentId,
                            storedPath,
                            chatId: association.chatId,
                        });
                    } else {
                        console.error("message association not supported"); // only create message associations by copying from drafts
                    }
                }),
            );
        },
    });
}

export function useFileDrop({
    association,
}: {
    association: AttachmentsAPI.AttachmentAssociation;
}) {
    const createAttachment = AttachmentsAPI.useCreateAttachment();
    const finalizeAttachmentForProject =
        ProjectAPI.useFinalizeAttachmentForProject();
    const finalizeAttachmentForDraft = DraftAPI.useFinalizeAttachmentForDraft();

    return useMutation({
        mutationKey: ["fileDrop"] as const,
        mutationFn: async (paths: string[]) => {
            const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB

            // possible issue: if one attachment fails to save, others may get cut off as well
            await Promise.all(
                paths.map(async (path) => {
                    // Check file size using Tauri command
                    try {
                        const metadata = await invoke<{
                            size: number;
                            isFile: boolean;
                            isDirectory: boolean;
                        }>("get_file_metadata", { path });

                        if (metadata.size > MAX_FILE_SIZE) {
                            const fileName = path.split("/").pop() || path;
                            toast.error(`File "${fileName}" is too large`, {
                                description: `Size: ${(metadata.size / 1024 / 1024).toFixed(1)}MB. Maximum size is 30MB.`,
                            });
                            return;
                        }
                    } catch (error) {
                        console.error("Failed to get file metadata:", error);
                        // Continue without size check if metadata fails
                    }

                    // 1. create attachment
                    const attachmentId = await createAttachment.mutateAsync({
                        type: fileTypeToAttachmentType(path) || "text",
                        originalName: path.split("/").pop() || path,
                        path,
                        association,
                    });

                    // 2. store
                    const { storedPath } = await storeFile(path); // storeFile handles generating a new path

                    // 3. finalize
                    if (association.type === "project") {
                        await finalizeAttachmentForProject.mutateAsync({
                            attachmentId,
                            storedPath,
                            projectId: association.projectId,
                        });
                    } else if (association.type === "draft") {
                        await finalizeAttachmentForDraft.mutateAsync({
                            attachmentId,
                            storedPath,
                            chatId: association.chatId,
                        });
                    } else {
                        console.error("message association not supported"); // only create message associations by copying from drafts
                    }
                }),
            );
        },
    });
}

export function useFileSelect({
    association,
}: {
    association: AttachmentsAPI.AttachmentAssociation;
}) {
    const fileDrop = useFileDrop({ association });

    return useMutation({
        mutationKey: ["fileSelect"] as const,
        mutationFn: async () => {
            const selected = await open({
                multiple: true,
                filters: [
                    {
                        name: "Images, pdfs, and text",
                        extensions: Object.values(allowedExtensions).flat(),
                    },
                ],
            });

            if (selected) {
                await fileDrop.mutateAsync(selected);
            }
        },
    });
}

export function useAttachUrl({
    association,
}: {
    association:
        | AttachmentsAPI.AttachmentAssociationDraft
        | AttachmentsAPI.AttachmentAssociationProject;
}) {
    const createAttachment = AttachmentsAPI.useCreateAttachment();
    const finalizeAttachmentForDraft = DraftAPI.useFinalizeAttachmentForDraft();
    const deleteDraftAttachment = DraftAPI.useDeleteDraftAttachment();
    const deleteAttachmentForProject =
        ProjectAPI.useDeleteAttachmentFromProject();
    const finalizeAttachmentForProject =
        ProjectAPI.useFinalizeAttachmentForProject();

    return useMutation({
        mutationKey: ["attachUrl"] as const,
        mutationFn: async ({ url }: { url: string }) => {
            const path = await generateStorePath(url, "md");

            // Check rate limit
            if (!canScrape()) {
                console.warn("Scrape rate limit exceeded. Please wait.");
                toast("Web scrape rate limit exceeded", {
                    description:
                        "Some URLs in your message may not be attached. Try again in 60 seconds.",
                });
                return;
            }
            // Add timestamp for rate limiting
            scrapeTimestamps.push(Date.now());

            const attachmentId = await createAttachment.mutateAsync({
                type: "webpage",
                originalName: url,
                path,
                association,
            });

            const result = await scrapeUrlAndWriteToPath(url, path);

            if (!result.success) {
                toast.error("Failed to scrape URL", {
                    description: result.error || "Please try again later.",
                });
                if (association.type === "draft") {
                    await deleteDraftAttachment.mutateAsync({
                        attachmentId,
                        association,
                    });
                } else if (association.type === "project") {
                    await deleteAttachmentForProject.mutateAsync({
                        attachmentId,
                        projectId: association.projectId,
                    });
                }
                return;
            }

            // finalize
            if (association.type === "draft") {
                await finalizeAttachmentForDraft.mutateAsync({
                    attachmentId,
                    storedPath: path,
                    chatId: association.chatId,
                });
            } else if (association.type === "project") {
                await finalizeAttachmentForProject.mutateAsync({
                    attachmentId,
                    storedPath: path,
                    projectId: association.projectId,
                });
            }
        },
    });
}

export function useAttachScreenshotEphemeral({
    association,
}: {
    association: AttachmentsAPI.AttachmentAssociation;
}) {
    if (association.type !== "draft") {
        throw new Error(
            "screenshot ephemeral attachments only supported for draft associations",
        );
    }

    // since we won't render anything during loading, we'll just wait to get the screenshot
    // and then create the attachment with isLoading = false (rather than using `finalize`)

    const createAttachment = AttachmentsAPI.useCreateAttachment();

    return useMutation({
        mutationKey: ["attachScreenshotEphemeral"] as const,
        mutationFn: async () => {
            const screenshot = await getScreenshotAttachment(
                await captureWholeScreenCompressed(),
            );

            const attachmentId = await createAttachment.mutateAsync({
                type: "image",
                originalName: "screenshot",
                path: screenshot.path,
                association,
                isLoading: false,
                ephemeral: true,
            });

            return attachmentId;
        },
    });
}
