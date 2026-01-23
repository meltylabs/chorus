/**
 * Skill Discovery System
 *
 * Discovers and loads skills from multiple locations:
 * - Project directories (.chorus/skills/, .claude/skills/)
 * - User directories (~/.chorus/skills/, ~/.claude/skills/)
 *
 * Following the Agent Skills specification for standardized paths.
 */

import { homeDir, join } from "@tauri-apps/api/path";
import { exists, readDir, readTextFile } from "@tauri-apps/plugin-fs";
import {
    ISkill,
    ISkillLocation,
    ISkillScript,
    INTERPRETER_MAP,
} from "./SkillTypes";
import { parseSkillFile } from "./SkillParser";

/**
 * Error encountered during skill discovery.
 */
export interface ISkillDiscoveryError {
    skillPath: string;
    error: string;
}

/**
 * Result of skill discovery operation.
 */
export interface ISkillDiscoveryResult {
    skills: ISkill[];
    errors: ISkillDiscoveryError[];
}

/**
 * Discovery paths for each location type.
 */
const PROJECT_SKILL_DIRS = [".chorus/skills", ".claude/skills", ".agent/skills"];
const USER_SKILL_DIRS = [".chorus/skills", ".claude/skills", ".agent/skills"];

/**
 * In-memory cache for discovered skills.
 */
let skillCache: ISkillDiscoveryResult | undefined;
let lastProjectPath: string | undefined;

/**
 * Gets the user home directory path.
 */
async function getUserHome(): Promise<string> {
    return await homeDir();
}

/**
 * Checks if a path exists.
 */
async function pathExists(path: string): Promise<boolean> {
    try {
        return await exists(path);
    } catch {
        return false;
    }
}

/**
 * Lists directories in a path.
 * Returns empty array if path doesn't exist or can't be read.
 * Follows symlinks to directories.
 */
async function listDirectories(basePath: string): Promise<string[]> {
    try {
        if (!(await pathExists(basePath))) {
            return [];
        }

        const entries = await readDir(basePath);
        const dirs: string[] = [];

        for (const entry of entries) {
            if (!entry.name) continue;

            // Include directories and symlinks (symlinks might point to directories)
            if (entry.isDirectory || entry.isSymlink) {
                // For symlinks, verify the target exists and is accessible
                if (entry.isSymlink) {
                    const targetPath = await join(basePath, entry.name);
                    // Check if the symlink target exists (readDir will work if it's a dir)
                    if (await pathExists(targetPath)) {
                        dirs.push(entry.name);
                    }
                } else {
                    dirs.push(entry.name);
                }
            }
        }

        return dirs;
    } catch {
        return [];
    }
}

/**
 * Reads file content, returns null if file doesn't exist or can't be read.
 */
async function readFileContent(path: string): Promise<string | null> {
    try {
        return await readTextFile(path);
    } catch {
        return null;
    }
}

/**
 * Detects the interpreter for a script based on file extension.
 */
function detectInterpreter(filename: string): string | undefined {
    const ext = filename.slice(filename.lastIndexOf("."));
    return INTERPRETER_MAP[ext];
}

/**
 * Discovers scripts in a skill's scripts/ directory.
 */
async function discoverScripts(
    skillFolderPath: string
): Promise<ISkillScript[]> {
    const scriptsDir = await join(skillFolderPath, "scripts");
    const scripts: ISkillScript[] = [];

    try {
        if (!(await pathExists(scriptsDir))) {
            return [];
        }

        const entries = await readDir(scriptsDir);

        for (const entry of entries) {
            if (entry.isFile && entry.name) {
                const relativePath = `scripts/${entry.name}`;
                const absolutePath = await join(scriptsDir, entry.name);

                scripts.push({
                    name: entry.name,
                    relativePath,
                    absolutePath,
                    interpreter: detectInterpreter(entry.name),
                });
            }
        }
    } catch {
        // Ignore errors reading scripts directory
    }

    return scripts;
}

/**
 * Discovers reference files in a skill folder (excluding SKILL.md and scripts/).
 */
async function discoverReferences(skillFolderPath: string): Promise<string[]> {
    const references: string[] = [];

    try {
        const entries = await readDir(skillFolderPath);

        for (const entry of entries) {
            if (entry.isFile && entry.name && entry.name !== "SKILL.md") {
                const absolutePath = await join(skillFolderPath, entry.name);
                references.push(absolutePath);
            }
        }
    } catch {
        // Ignore errors
    }

    return references;
}

/**
 * Loads a single skill from a folder path.
 */
async function loadSkill(
    skillFolderPath: string,
    location: ISkillLocation
): Promise<{ skill?: ISkill; error?: ISkillDiscoveryError }> {
    const skillFilePath = await join(skillFolderPath, "SKILL.md");

    // Check if SKILL.md exists
    if (!(await pathExists(skillFilePath))) {
        return {
            error: {
                skillPath: skillFolderPath,
                error: "SKILL.md not found",
            },
        };
    }

    // Read SKILL.md content
    const content = await readFileContent(skillFilePath);
    if (content === null) {
        return {
            error: {
                skillPath: skillFolderPath,
                error: "Failed to read SKILL.md",
            },
        };
    }

    // Parse the skill file
    const parseResult = parseSkillFile(content);
    if (!parseResult.success) {
        return {
            error: {
                skillPath: skillFolderPath,
                error: parseResult.error,
            },
        };
    }

    // Extract folder name as ID
    const pathParts = skillFolderPath.split("/");
    const id = pathParts[pathParts.length - 1];

    // Discover scripts and references
    const [scripts, references] = await Promise.all([
        discoverScripts(skillFolderPath),
        discoverReferences(skillFolderPath),
    ]);

    const skill: ISkill = {
        id,
        metadata: parseResult.data.metadata,
        content: parseResult.data.body,
        location,
        filePath: skillFilePath,
        folderPath: skillFolderPath,
        scripts,
        references,
    };

    return { skill };
}

/**
 * Discovers skills in a base directory.
 */
async function discoverSkillsInDirectory(
    baseDir: string,
    location: ISkillLocation
): Promise<{ skills: ISkill[]; errors: ISkillDiscoveryError[] }> {
    const skills: ISkill[] = [];
    const errors: ISkillDiscoveryError[] = [];

    // List skill folders in the directory
    const skillFolders = await listDirectories(baseDir);

    // Load each skill in parallel
    const results = await Promise.all(
        skillFolders.map(async (folderName) => {
            const skillFolderPath = await join(baseDir, folderName);
            return loadSkill(skillFolderPath, location);
        })
    );

    for (const result of results) {
        if (result.skill) {
            skills.push(result.skill);
        }
        if (result.error) {
            errors.push(result.error);
        }
    }

    return { skills, errors };
}

/**
 * Discovers all skills from all configured locations.
 *
 * @param projectPath - Optional project directory path. If provided, project-level skills will be discovered.
 * @returns Discovery result with skills and any errors encountered.
 */
export async function discoverSkills(
    projectPath?: string
): Promise<ISkillDiscoveryResult> {
    const allSkills: ISkill[] = [];
    const allErrors: ISkillDiscoveryError[] = [];
    const skillsByName = new Map<string, ISkill>();

    // Discover user-level skills first (lower priority)
    const userHome = await getUserHome();

    for (const dir of USER_SKILL_DIRS) {
        const userSkillsDir = await join(userHome, dir);
        const { skills, errors } = await discoverSkillsInDirectory(
            userSkillsDir,
            "user"
        );

        for (const skill of skills) {
            skillsByName.set(skill.metadata.name, skill);
        }
        allErrors.push(...errors);
    }

    // Discover project-level skills (higher priority - overrides user skills)
    if (projectPath) {
        for (const dir of PROJECT_SKILL_DIRS) {
            const projectSkillsDir = await join(projectPath, dir);
            const { skills, errors } = await discoverSkillsInDirectory(
                projectSkillsDir,
                "project"
            );

            // Project skills override user skills with the same name
            for (const skill of skills) {
                skillsByName.set(skill.metadata.name, skill);
            }
            allErrors.push(...errors);
        }
    }

    // Convert map values to array
    allSkills.push(...skillsByName.values());

    // Sort skills by name for consistent ordering
    allSkills.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));

    return {
        skills: allSkills,
        errors: allErrors,
    };
}

/**
 * Refreshes the skill cache by re-discovering all skills.
 *
 * @param projectPath - Optional project directory path.
 * @returns Fresh discovery result.
 */
export async function refreshSkills(
    projectPath?: string
): Promise<ISkillDiscoveryResult> {
    // Clear the cache
    skillCache = undefined;
    lastProjectPath = projectPath;

    // Re-discover
    const result = await discoverSkills(projectPath);

    // Update cache
    skillCache = result;

    return result;
}

/**
 * Gets cached skills or discovers them if not cached.
 *
 * @param projectPath - Optional project directory path.
 * @returns Cached or freshly discovered skills.
 */
export async function getCachedSkills(
    projectPath?: string
): Promise<ISkillDiscoveryResult> {
    // Invalidate cache if project path changed
    if (projectPath !== lastProjectPath) {
        skillCache = undefined;
        lastProjectPath = projectPath;
    }

    if (skillCache) {
        return skillCache;
    }

    const result = await discoverSkills(projectPath);
    skillCache = result;
    return result;
}

/**
 * Clears the skill cache.
 */
export function clearSkillCache(): void {
    skillCache = undefined;
    lastProjectPath = undefined;
}

/**
 * Gets a single skill by name from the cache.
 *
 * @param name - Skill name to find.
 * @param projectPath - Optional project directory path.
 * @returns The skill if found, undefined otherwise.
 */
export async function getSkillByName(
    name: string,
    projectPath?: string
): Promise<ISkill | undefined> {
    const { skills } = await getCachedSkills(projectPath);
    return skills.find((s) => s.metadata.name === name);
}
