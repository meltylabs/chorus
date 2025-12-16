import { appDataDir } from "@tauri-apps/api/path";
import { mkdir, readFile } from "@tauri-apps/plugin-fs";
import { allowedExtensions, AttachmentType } from "@core/chorus/Models";
import { v4 as uuidv4 } from "uuid";
import FirecrawlApp from "@mendable/firecrawl-js";
import { fileTypeFromBuffer } from "file-type";
import path from "path";
import mime from "mime-types";
import { invoke } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { Attachment } from "./api/AttachmentsAPI";

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
).href;

export const MAX_ATTACHMENTS = 10;
export const MAX_SCRAPES_PER_MINUTE = 10;
// This should match TARGET_SIZE_BYTES in src-tauri/src/command.rs (3.5MB)
export const TARGET_IMAGE_SIZE_BYTES = 4.5 * 1024 * 1024; // 4.5MB in bytes

// Create FirecrawlApp instance with provided API key
export const createFirecrawlClient = (apiKey: string) =>
    new FirecrawlApp({ apiKey });

// Add rate limiting tracker
export const scrapeTimestamps: number[] = [];

export const canScrape = () => {
    const now = Date.now();
    // Remove timestamps older than 1 minute
    while (scrapeTimestamps.length && scrapeTimestamps[0] < now - 60000) {
        scrapeTimestamps.shift();
    }
    return scrapeTimestamps.length < MAX_SCRAPES_PER_MINUTE;
};

// Core image resizing function that both other functions can use
export async function resizeImageCore(
    fileData: Uint8Array,
    fileName: string,
    targetSizeBytes: number = TARGET_IMAGE_SIZE_BYTES,
): Promise<{ resizedData: Uint8Array; wasResized: boolean }> {
    // Check if file is already smaller than the target size
    const fileSizeMB = fileData.length / (1024 * 1024);
    const targetSizeMB = targetSizeBytes / (1024 * 1024);

    // If the file is already smaller than our target, return it as is
    if (fileSizeMB <= targetSizeMB) {
        console.log(
            `File already under size limit (${fileSizeMB.toFixed(2)}MB). Skipping compression.`,
        );
        return { resizedData: fileData, wasResized: false };
    }

    console.log(
        `Compressing file from ${fileSizeMB.toFixed(2)}MB to target ${targetSizeMB}MB`,
    );

    // Create a temporary file path to store the original image
    const tempDir = await appDataDir();
    const tempFilePath = path.join(tempDir, `temp_${Date.now()}_${fileName}`);

    // Write the file to the temp location
    await invoke("write_file_async", {
        path: tempFilePath,
        content: Array.from(fileData),
    });

    try {
        // Call the Rust function to resize the image
        const resizedPath = await invoke<string>("resize_image", {
            filePath: tempFilePath,
            targetSizeBytes,
        });

        // Read the resized file
        const resizedData = await readFile(resizedPath);

        // Log compression result
        const compressedSizeMB = resizedData.length / (1024 * 1024);
        console.log(
            `Compressed to ${compressedSizeMB.toFixed(2)}MB (${Math.round((compressedSizeMB / fileSizeMB) * 100)}% of original)`,
        );

        return { resizedData, wasResized: true };
    } catch (error) {
        console.error("Error resizing image:", error);
        // If there's an error, return the original data
        return { resizedData: fileData, wasResized: false };
    }
}

// Simplified version that uses the core function
export async function resizeImageCompression(file: File): Promise<File> {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Arr = new Uint8Array(arrayBuffer);

    const { resizedData } = await resizeImageCore(uint8Arr, file.name);

    // Create a new File object from the resized data
    // Cast to BlobPart to satisfy TypeScript's strict type checking
    return new File([resizedData as BlobPart], file.name, { type: file.type });
}

export const fileTypeToAttachmentType = (
    filePath: string,
): AttachmentType | undefined => {
    const ext = path.extname(filePath).toLowerCase();

    // Remove the leading dot if present
    const extension = ext.startsWith(".") ? ext.slice(1) : ext;

    if (!extension) return undefined;

    return Object.entries(allowedExtensions).find(([_, extensions]) =>
        extensions.includes(extension),
    )?.[0] as AttachmentType;
};

export const ensureUploadsOriginalsDirectory = async () => {
    const appDir = await appDataDir();
    const originalsDir = path.join(appDir, "uploads", "originals");
    await mkdir(originalsDir, { recursive: true });
    return originalsDir;
};

export const generateStorePath = async (
    inputFileName: string,
    extension = "",
) => {
    const originalsDir = await ensureUploadsOriginalsDirectory();

    // Get the file extension: either provided, from filename, or default to "bin"
    let ext = extension;
    if (!ext) {
        const fileExt = path.extname(inputFileName);
        ext = fileExt ? fileExt.slice(1) : "bin"; // Remove leading dot or use "bin" if no extension
    }

    // Use uuid library for consistent UUID generation
    const uuid = uuidv4();
    const storedFileName = `${uuid}.${ext}`;
    return path.join(originalsDir, storedFileName);
};

/**
 * Creates a File object from a local file path.
 * Handles both binary and text files appropriately.
 */
export async function getFileFromPath(filePath: string): Promise<File> {
    // Determine MIME type from file extension
    const mimeType = mime.lookup(filePath) || "application/octet-stream";

    // Read the file as binary data
    const fileData = await readFile(filePath);

    // Extract filename from path
    const fileName = path.basename(filePath);

    // Create and return the File object
    // Cast to BlobPart to satisfy TypeScript's strict type checking
    return new File([fileData as BlobPart], fileName, {
        type: mimeType,
        lastModified: Date.now(),
    });
}

export const resizeAndStoreFileData = async (
    file: File,
    storePath?: string, // use if you want to ensure a particular name
) => {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Arr = new Uint8Array(arrayBuffer);
    const typeInfo = await fileTypeFromBuffer(uint8Arr);

    const fileExt = path.extname(file.name).slice(1); // Remove leading dot
    const realExtension = typeInfo?.ext || fileExt || "bin";
    const resolvedStorePath =
        storePath || (await generateStorePath(file.name, realExtension));

    // check if it's an image and if so, resize it
    if (typeInfo?.mime?.startsWith("image/")) {
        console.log("resizing image...");

        const { resizedData } = await resizeImageCore(uint8Arr, file.name);

        // Write the resized data to the final storage path
        await invoke("write_file_async", {
            path: resolvedStorePath,
            content: Array.from(resizedData),
        });

        // print final size in mb
        console.log("final size", resizedData.length / 1024 / 1024);
    } else {
        await invoke("write_file_async", {
            path: resolvedStorePath,
            content: Array.from(uint8Arr),
        });
    }
    return { storedPath: resolvedStorePath, realExtension };
};

// Storage handlers
export const storeFile = async (filePath: string) => {
    console.log("storing file", filePath);
    const storedPath = await generateStorePath(filePath);

    // Check if file is an image that needs resizing
    const fileType = fileTypeToAttachmentType(filePath);
    if (fileType === "image") {
        // For images, we need to read and potentially resize
        const file = await getFileFromPath(filePath);
        await resizeAndStoreFileData(file, storedPath);
    } else {
        // For non-images (PDFs, text files, etc.), copy directly without reading into memory
        await invoke("write_file_async", {
            path: storedPath,
            sourcePath: filePath, // Use camelCase for Tauri
        });
    }

    return { storedPath };
};

export async function convertPdfToPng(filePath: string): Promise<string[]> {
    // Read the PDF file data
    const fileData = await readFile(filePath);

    // Load the PDF document from the file data
    const loadingTask = pdfjsLib.getDocument({ data: fileData });
    const pdf = await loadingTask.promise;

    console.time("convertPdfToPng");

    const pngUrls: string[] = [];

    // Convert each page to PNG
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);

        // Set scale for better quality
        const scale = 2.0;
        const viewport = page.getViewport({ scale });

        // Create canvas
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not get canvas context");

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Render PDF page to canvas
        // Note: pdfjs-dist v5.4+ requires the 'canvas' parameter in RenderParameters
        // In older versions, only canvasContext was required, but the new API
        // makes 'canvas' a required property for improved type safety
        await page.render({
            canvas,
            canvasContext: context,
            viewport: viewport,
        }).promise;

        // Convert canvas to PNG data URL
        const pngUrl = canvas.toDataURL("image/png");
        pngUrls.push(pngUrl);
    }

    console.timeEnd("convertPdfToPng");

    return pngUrls;
}

/**
 * Gives back a screenshot attachment.
 */
export const getScreenshotAttachment = async (
    file: File,
): Promise<Attachment> => {
    // skip attachment limit because we're lenient

    // Create a storage path with the correct extension
    const path = await generateStorePath(
        file.name, // doesn't matter -- file name not used
        "png",
    );

    // skip creating a preview (loading attachment) since
    // we won't actually render it and anyway it's fast
    const { storedPath } = await resizeAndStoreFileData(file, path);

    const attachment: Attachment = {
        id: uuidv4(),
        type: "image",
        originalName: "ch_qc_screenshot",
        path: storedPath,
        isLoading: false,
        ephemeral: true,
    };

    return attachment;
};

export async function scrapeUrlAndWriteToPath(
    url: string,
    path: string,
    firecrawlApiKey?: string,
): Promise<{ success: boolean; error?: string }> {
    if (!firecrawlApiKey) {
        return { success: false, error: "Firecrawl API key not configured" };
    }

    try {
        const firecrawl = createFirecrawlClient(firecrawlApiKey);
        const mockScrapeAPI = false;
        const scrapeResult = mockScrapeAPI
            ? {
                  success: true as const,
                  markdown: `test ${url}`,
              }
            : await firecrawl.scrapeUrl(url, {
                  formats: ["markdown"],
              });

        if (!scrapeResult.success) {
            throw new Error(
                `Failed to scrape: ${"error" in scrapeResult ? scrapeResult.error : "Unknown error"}`,
            );
        }

        const content = new TextEncoder().encode(
            `URL: ${url}\n\n${scrapeResult.markdown}`,
        );
        await invoke("write_file_async", {
            path,
            content: Array.from(content),
        });
        return { success: true };
    } catch (error) {
        console.warn("Error scraping URL:", error);
        const errorMessage =
            error instanceof Error ? error.message : "Unknown error occurred";
        return { success: false, error: errorMessage };
    }
}
