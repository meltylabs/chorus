import {
    ArchiveIcon,
    ChevronDownIcon,
    Settings,
    PlusIcon,
    FolderIcon,
    FolderOpenIcon,
    FolderPlusIcon,
    SquarePlusIcon,
    ArrowBigUpIcon,
    EllipsisIcon,
} from "lucide-react";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@ui/components/ui/sidebar";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@ui/components/ui/tooltip";
import { NavigateFunction, useLocation, useNavigate } from "react-router-dom";

import React, {
    useRef,
    useEffect,
    useState,
    useMemo,
    useCallback,
    MutableRefObject,
    forwardRef,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "./ui/button";
import { EditableTitle } from "./EditableTitle";
import { type Chat } from "@core/chorus/api/ChatAPI";
import { useSettings } from "./hooks/useSettings";
import { toast } from "sonner";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "./ui/collapsible";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "./ui/dialog";
import * as ChatAPI from "@core/chorus/api/ChatAPI";
import * as ProjectAPI from "@core/chorus/api/ProjectAPI";
import { formatCost } from "@core/chorus/api/CostAPI";
import RetroSpinner from "./ui/retro-spinner";
import FeedbackButton from "./FeedbackButton";
import { SpeakerLoudIcon } from "@radix-ui/react-icons";
import { emit } from "@tauri-apps/api/event";
import { projectDisplayName } from "@ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
    DndContext,
    DragEndEvent,
    PointerSensor,
    useSensor,
    useSensors,
    useDroppable,
} from "@dnd-kit/core";
import Droppable from "./Droppable";
import Draggable from "./Draggable";
import { dialogActions, useDialogStore } from "@core/infra/DialogStore";
import { projectQueries, useCreateProject } from "@core/chorus/api/ProjectAPI";
import { chatQueries } from "@core/chorus/api/ChatAPI";
import { useToggleProjectIsCollapsed } from "@core/chorus/api/ProjectAPI";

function isToday(date: Date) {
    const today = new Date();
    return date.toDateString() === today.toDateString();
}

function isYesterday(date: Date) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return date.toDateString() === yesterday.toDateString();
}

function isLastWeek(date: Date) {
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);
    return date >= lastWeek && date < today;
}

function groupChatsByDate(chats: Chat[]) {
    const groups: { label: string; chats: Chat[] }[] = [];

    const today: Chat[] = [];
    const yesterday: Chat[] = [];
    const lastWeek: Chat[] = [];
    const older: Chat[] = [];
    chats.forEach((chat) => {
        const utcDate = new Date(chat.updatedAt || 0);
        // Convert to local time
        const date = new Date(
            utcDate.getTime() - utcDate.getTimezoneOffset() * 60000,
        );

        if (isToday(date)) {
            today.push(chat);
        } else if (isYesterday(date)) {
            yesterday.push(chat);
        } else if (isLastWeek(date)) {
            lastWeek.push(chat);
        } else {
            older.push(chat);
        }
    });

    if (today.length) groups.push({ label: "Today", chats: today });
    if (yesterday.length) groups.push({ label: "Yesterday", chats: yesterday });
    if (lastWeek.length) groups.push({ label: "Last Week", chats: lastWeek });
    if (older.length) groups.push({ label: "Older", chats: older });

    return groups;
}

function EmptyProjectState() {
    const createProject = useCreateProject();
    const { isOver, setNodeRef, active } = useDroppable({
        id: "empty-project-state",
    });

    return (
        <div
            ref={setNodeRef}
            className={`px-3 text-base text-muted-foreground border rounded-md p-2 mt-1 transition-all ${
                isOver && active
                    ? "border-sidebar-accent bg-sidebar-accent scale-[1.02]"
                    : "border-muted-foreground/10"
            }`}
        >
            <p className="mb-2 text-sm whitespace-normal break-words">
                Projects allow you to share context between chats.
            </p>

            <button
                className="flex items-center justify-between w-full text-sidebar-muted-foreground hover:text-sidebar-accent-foreground group/create-project"
                onClick={() => {
                    createProject.mutate();
                }}
            >
                <div className="flex items-center">
                    <FolderPlusIcon
                        strokeWidth={1.5}
                        className="w-4 h-4 mr-2 text-muted-foreground group-hover/create-project:text-sidebar-accent-foreground"
                    />
                    <span className="font-[350]">
                        {active
                            ? "Drop to create a project"
                            : "Create a project"}
                    </span>
                </div>
                <span>
                    <kbd className="invisible group-hover/create-project:visible">
                        <span>⌘</span>
                        <ArrowBigUpIcon className="size-3.5" />N
                    </kbd>
                </span>
            </button>
        </div>
    );
}

function EmptyChatState() {
    return (
        <div className="px-3">
            <div className="text-base text-muted-foreground">
                <p className="flex items-center">⌘N to start your first chat</p>
            </div>
        </div>
    );
}

function DevModeIndicator() {
    const [instanceName, setInstanceName] = useState<string>("");

    useEffect(() => {
        if (import.meta.env.DEV) {
            void invoke<string>("get_instance_name").then((name) => {
                setInstanceName(name);
            });
        }
    }, []);

    if (!import.meta.env.DEV) return null;

    return (
        <div className="px-2 py-1 text-[10px] font-medium bg-yellow-500/10 text-yellow-500">
            {instanceName ? `Instance ${instanceName}` : "DEV MODE"}
        </div>
    );
}

export function AppSidebar() {
    return (
        <>
            <Sidebar
                collapsible="offcanvas"
                variant="sidebar"
                className="no-scrollbar group/sidebar"
            >
                <DevModeIndicator />
                <AppSidebarInner />
            </Sidebar>
        </>
    );
}

// This icon references an svg symbol defined in index.html
const PencilOptimized = forwardRef<
    SVGSVGElement,
    React.SVGProps<SVGSVGElement> & { size?: number }
>(({ size = 16, ...props }, ref) => (
    <div>
        <svg ref={ref} width={size} height={size} {...props}>
            <use href="#icon-pencil" />
        </svg>
    </div>
));

// This icon references an svg symbol defined in index.html
const Trash2Optimized = forwardRef<
    SVGSVGElement,
    React.SVGProps<SVGSVGElement> & { size?: number }
>(({ size = 16, ...props }, ref) => (
    <div>
        <svg ref={ref} width={size} height={size} {...props}>
            <use href={`#icon-trash-2`} />
        </svg>
    </div>
));

// This icon references an svg symbol defined in index.html
const SplitOptimized = forwardRef<
    SVGSVGElement,
    React.SVGProps<SVGSVGElement> & { size?: number }
>(({ size = 16, ...props }, ref) => (
    <div>
        <svg ref={ref} width={size} height={size} {...props}>
            <use href={`#icon-split`} />
        </svg>
    </div>
));

function Project({ projectId }: { projectId: string }) {
    const navigate = useNavigate();
    const getOrCreateNewChat = ChatAPI.useGetOrCreateNewChat();
    const toggleProjectIsCollapsed = useToggleProjectIsCollapsed();
    const projectsQuery = useQuery(projectQueries.list());
    const chatsQuery = useQuery(chatQueries.list());
    const settings = useSettings();
    const location = useLocation();
    const currentChatId = location.pathname.split("/").pop()!; // well this is super hacky
    const projectIsActive = location.pathname.includes(projectId);
    const [showAllChats, setShowAllChats] = useState(false);

    const allProjectChats =
        chatsQuery.data?.filter((chat) => chat.projectId === projectId) ?? [];
    const chats = filterChatsForDisplay(allProjectChats, currentChatId);

    const chatToDisplay = useMemo(
        () =>
            showAllChats
                ? chats
                : chats.slice(0, NUM_PROJECT_CHATS_TO_SHOW_BY_DEFAULT),
        [chats, showAllChats],
    );

    if (projectsQuery.isPending) return <RetroSpinner />;
    if (projectsQuery.isError) return null;
    if (chatsQuery.isPending) return <RetroSpinner />;
    if (chatsQuery.isError) return null;

    const projects = projectsQuery.data;
    const project = projects.find((p) => p.id === projectId)!;
    const isCollapsed = project?.isCollapsed || false;
    const showCost = settings?.showCost ?? false;

    const handleToggleCollapse = (e: React.MouseEvent) => {
        e.preventDefault();
        void toggleProjectIsCollapsed.mutateAsync({ projectId });
    };

    const handleProjectClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (isCollapsed) {
            // If collapsed: expand AND navigate
            void toggleProjectIsCollapsed.mutateAsync({ projectId });
        }
        // Always navigate (both collapsed and expanded cases)
        navigate(`/projects/${projectId}`);
    };

    return (
        <SidebarMenuItem>
            <Collapsible open={!isCollapsed} defaultOpen={chats.length > 0}>
                <SidebarMenuButton
                    onClick={handleProjectClick}
                    isActive={location.pathname === `/projects/${projectId}`}
                    className="group/project-toggle flex items-center justify-between mb-0.5 relative"
                >
                    <span className="flex items-center gap-2 flex-1 min-w-0">
                        <CollapsibleTrigger asChild>
                            <div
                                className="text-muted-foreground flex items-center justify-center -ml-1 p-1 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded flex-shrink-0"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void handleToggleCollapse(e);
                                }}
                            >
                                <ChevronDownIcon
                                    className={`size-4  transition-transform ${isCollapsed ? "-rotate-90" : ""}
                                    hidden
                                    group-hover/project-toggle:block
                                    `}
                                />
                                {isCollapsed ? (
                                    <FolderIcon
                                        strokeWidth={1.5}
                                        className="size-4 group-hover/project-toggle:hidden"
                                    />
                                ) : (
                                    <FolderOpenIcon
                                        strokeWidth={1.5}
                                        className="size-4 group-hover/project-toggle:hidden"
                                    />
                                )}
                            </div>
                        </CollapsibleTrigger>
                        <h2
                            className="truncate text-base"
                            onClick={handleProjectClick}
                        >
                            {projectDisplayName(project?.name)}
                        </h2>
                        {showCost &&
                            project?.totalCostUsd !== undefined &&
                            project.totalCostUsd > 0 && (
                                <span className="ml-auto pr-8 text-xs text-muted-foreground font-normal flex-shrink-0">
                                    {formatCost(project.totalCostUsd)}
                                </span>
                            )}
                    </span>

                    {/* Gradient overlay that appears when hovering */}
                    <div className="absolute right-0 w-20 h-full opacity-0 group-hover/project-toggle:opacity-100 transition-opacity bg-gradient-to-l from-sidebar-accent via-sidebar-accent to-transparent pointer-events-none" />

                    {/* Add new chat in project */}
                    <div
                        className={`group-hover/project-toggle:block ${projectIsActive ? "block" : "hidden"} text-muted-foreground hover:text-sidebar-accent-foreground rounded absolute right-3 z-10`}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void getOrCreateNewChat.mutateAsync({
                                projectId,
                            });
                        }}
                    >
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <PlusIcon className="size-3.5" />
                            </TooltipTrigger>
                            <TooltipContent>
                                New chat in {projectDisplayName(project.name)}
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </SidebarMenuButton>
                <CollapsibleContent>
                    {chats.length > 0 && (
                        <div className="relative">
                            {/* Vertical line connecting folder to chats */}
                            <div className="absolute left-[18px] top-0 bottom-1 w-[1px] bg-border" />
                            <div className="pl-[28px]">
                                {chatToDisplay.map((chat) => (
                                    <ChatListItem
                                        key={chat.id + "-sidebar"}
                                        chat={chat}
                                        isActive={currentChatId === chat.id}
                                    />
                                ))}
                                {chats.length >
                                    NUM_PROJECT_CHATS_TO_SHOW_BY_DEFAULT &&
                                    !showAllChats && (
                                        <SidebarMenuItem>
                                            <SidebarMenuButton
                                                onClick={() =>
                                                    setShowAllChats(true)
                                                }
                                                className="text-muted-foreground hover:text-foreground"
                                            >
                                                <EllipsisIcon className="size-4" />
                                                <span className="text-base">
                                                    Show More
                                                </span>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    )}
                            </div>
                        </div>
                    )}
                </CollapsibleContent>
            </Collapsible>
        </SidebarMenuItem>
    );
}

// Include new chats that are currently active
function filterChatsForDisplay(chats: Chat[], currentChatId: string) {
    return chats.filter((chat) => !chat.isNewChat || chat.id === currentChatId);
}

const NUM_DEFAULT_CHATS_TO_SHOW_BY_DEFAULT = 25;
const NUM_PROJECT_CHATS_TO_SHOW_BY_DEFAULT = 10;

export function AppSidebarInner() {
    const projectsQuery = useQuery(ProjectAPI.projectQueries.list());
    const chatsQuery = useQuery(ChatAPI.chatQueries.list());
    const createProject = ProjectAPI.useCreateProject();
    const location = useLocation();
    const currentChatId = location.pathname.split("/").pop()!; // well this is super hacky
    const updateChatProject = ProjectAPI.useSetChatProject();
    const getOrCreateNewChat = ChatAPI.useGetOrCreateNewChat();

    const [showAllChats, setShowAllChats] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
    );
    const chatsByProject = useMemo(
        () =>
            (chatsQuery.data ?? []).reduce(
                (acc: Record<string, Chat[]>, chat) => {
                    const prev = acc[chat.projectId] ?? [];
                    acc[chat.projectId] = [...prev, chat];
                    return acc;
                },
                {} as Record<string, Chat[]>,
            ),
        [chatsQuery.data],
    );
    const defaultChats = useMemo(
        () =>
            filterChatsForDisplay(
                chatsByProject["default"] || [],
                currentChatId,
            ),
        [chatsByProject, currentChatId],
    );
    const groupedChats = useMemo(
        () =>
            groupChatsByDate(
                showAllChats
                    ? defaultChats
                    : defaultChats.slice(
                          0,
                          NUM_DEFAULT_CHATS_TO_SHOW_BY_DEFAULT,
                      ),
            ),
        [defaultChats, showAllChats],
    );
    const quickChats = useMemo(
        () =>
            filterChatsForDisplay(
                chatsByProject["quick-chat"] || [],
                currentChatId,
            ),
        [chatsByProject, currentChatId],
    );
    const projectsToDisplay = useMemo(
        () =>
            (projectsQuery.data ?? [])
                .filter(
                    (project) =>
                        !["default", "quick-chat"].includes(project.id),
                )
                .sort((a, b) => a.name.localeCompare(b.name)),
        [projectsQuery.data],
    );

    if (projectsQuery.isPending || chatsQuery.isPending) {
        return <RetroSpinner />;
    }

    if (projectsQuery.isError) {
        return (
            <div>
                Error loading projects: {JSON.stringify(projectsQuery.error)}
            </div>
        );
    }
    if (chatsQuery.isError) {
        return (
            <div>Error loading chats: {JSON.stringify(chatsQuery.error)}</div>
        );
    }

    const handleDragEnd = async (event: DragEndEvent) => {
        const chatId = event.active.id.toString();
        const dropTargetId = event.over?.id.toString();

        if (!chatId || !dropTargetId) return;

        // Check if dropped on empty project state
        if (dropTargetId === "empty-project-state") {
            // Create new project
            const projectId = await createProject.mutateAsync();
            // Add the chat to the new project
            updateChatProject.mutate({ chatId, projectId });
        } else {
            // Normal project drop
            updateChatProject.mutate({ chatId, projectId: dropTargetId });
        }
    };

    function onNewChatClick() {
        // Always create a default (non-project) chat when clicking "Start New Chat"
        void getOrCreateNewChat.mutateAsync({ projectId: "default" });
    }

    const hasNonQuickChats =
        chatsQuery.data?.filter((chat) => chat.projectId !== "quick-chat")
            .length > 0;

    return (
        <SidebarContent className="relative h-full pt-5">
            <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
                <div className="overflow-y-auto h-full no-scrollbar">
                    <SidebarGroup className="min-h-0">
                        <SidebarGroupContent>
                            <SidebarMenu className="truncate">
                                {/* New Chat button */}
                                <button
                                    className="group/new-chat text-base pl-3 pr-3 py-2 flex items-center justify-between hover:bg-sidebar-accent rounded-md w-full text-sidebar-muted-foreground hover:text-foreground mb-2"
                                    onClick={onNewChatClick}
                                >
                                    <span className="flex items-center gap-2 ">
                                        <SquarePlusIcon
                                            className="size-4 text-muted-foreground group-hover/new-chat:text-foreground"
                                            strokeWidth={1.5}
                                        />
                                        Start New Chat
                                    </span>
                                    <span className="text-xs hidden group-hover/new-chat:block text-muted-foreground">
                                        ⌘N
                                    </span>
                                </button>

                                {/* add new project */}
                                {hasNonQuickChats && (
                                    <>
                                        <div className="pt-2 flex items-center justify-between group/projects">
                                            <div className="sidebar-label flex w-full items-center gap-2 px-3 text-muted-foreground">
                                                Projects
                                            </div>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    {projectsToDisplay.length && (
                                                        <button
                                                            className="text-muted-foreground hover:text-foreground p-1 pr-3 rounded"
                                                            onClick={() =>
                                                                createProject.mutate()
                                                            }
                                                        >
                                                            <FolderPlusIcon
                                                                className="size-3.5"
                                                                strokeWidth={
                                                                    1.5
                                                                }
                                                            />
                                                        </button>
                                                    )}
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    New Project
                                                </TooltipContent>
                                            </Tooltip>
                                        </div>
                                        <div className="flex flex-col">
                                            {projectsToDisplay.length ? (
                                                projectsToDisplay.map(
                                                    (project) => (
                                                        <Droppable
                                                            id={project.id}
                                                            key={project.id}
                                                        >
                                                            <Project
                                                                projectId={
                                                                    project.id
                                                                }
                                                            />
                                                        </Droppable>
                                                    ),
                                                )
                                            ) : (
                                                <EmptyProjectState />
                                            )}
                                        </div>
                                    </>
                                )}
                                {/* Spacer */}
                                <div className="h-3" />

                                <Droppable id="default">
                                    {/* Grouped chats */}
                                    {groupedChats.length > 0 ? (
                                        groupedChats.map(
                                            ({ label, chats: groupChats }) => (
                                                <div
                                                    key={label}
                                                    className="pb-3"
                                                >
                                                    <div className="px-3 mb-1 sidebar-label flex items-center gap-2 text-muted-foreground">
                                                        {label}
                                                    </div>
                                                    {groupChats.map((chat) => (
                                                        <ChatListItem
                                                            key={
                                                                chat.id +
                                                                "-sidebar"
                                                            }
                                                            chat={chat}
                                                            isActive={
                                                                currentChatId ===
                                                                chat.id
                                                            }
                                                        />
                                                    ))}
                                                </div>
                                            ),
                                        )
                                    ) : (
                                        <EmptyChatState />
                                    )}
                                    {defaultChats.length >
                                        NUM_DEFAULT_CHATS_TO_SHOW_BY_DEFAULT &&
                                        !showAllChats && (
                                            <SidebarMenuItem className="w-full">
                                                <SidebarMenuButton
                                                    onClick={() =>
                                                        setShowAllChats(true)
                                                    }
                                                >
                                                    <EllipsisIcon className="size-4 text-muted-foreground" />
                                                    <span className="text-base text-muted-foreground">
                                                        Show More
                                                    </span>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        )}
                                </Droppable>
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                    {/* gradient overlay */}
                    <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-sidebar via-sidebar to-transparent pointer-events-none" />
                </div>
            </DndContext>

            {/* Ambient chats positioned fixed relative to the sidebar */}
            <QuickChats chats={quickChats} />
        </SidebarContent>
    );
}

function QuickChats({ chats }: { chats: Chat[] }) {
    const navigate = useNavigate();
    const settings = useSettings();
    const convertQuickChatToRegularChat =
        ChatAPI.useConvertQuickChatToRegularChat();

    const handleQuickChatConversion = async (
        e: React.MouseEvent,
        chat: Chat,
    ) => {
        e.preventDefault();
        await convertQuickChatToRegularChat.mutateAsync({
            chatId: chat.id,
        });
        navigate(`/chat/${chat.id}`);
    };

    return (
        <div className="relative pb-2 pr-2 bg-sidebar z-10">
            <SidebarMenu>
                <Collapsible className="group/collapsible data-[state=open]/collapsible:border-t pt-2 mb-1 flex items-stretch w-full">
                    <SidebarMenuItem className="w-full">
                        <div className="h-6 w-full flex justify-between">
                            <span className="h-full group-data-[state=open]/collapsible:hidden px-3 flex items-center gap-2">
                                <FeedbackButton className="h-full text-sm flex items-center text-muted-foreground rounded-full px-2 py-1 border border-sidebar-border hover:text-sidebar-accent-foreground">
                                    Feedback
                                    <SpeakerLoudIcon className="inline-block ml-2 h-3 w-3" />
                                </FeedbackButton>
                            </span>
                            <div className="flex items-center gap-2">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <CollapsibleTrigger asChild>
                                            <button className="h-full text-muted-foreground/75 hover:text-foreground p-2 rounded-full flex items-center gap-2 group-data-[state=open]/collapsible:w-full">
                                                <ArchiveIcon
                                                    className="w-4 h-4 group-data-[state=open]/collapsible:hidden block"
                                                    strokeWidth={1.5}
                                                />
                                                <ChevronDownIcon
                                                    className="w-4 h-4 group-data-[state=open]/collapsible:block hidden"
                                                    strokeWidth={1.5}
                                                />

                                                <span className="text-sm hidden group-data-[state=open]/collapsible:block">
                                                    Ambient Chats
                                                </span>
                                            </button>
                                        </CollapsibleTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom">
                                        Ambient Chats
                                    </TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                void emit("open_settings", {
                                                    tab: "general",
                                                });
                                            }}
                                            className="h-full text-muted-foreground/75 hover:text-foreground p-2 rounded-full flex items-center gap-2 group-data-[state=open]/collapsible:hidden"
                                        >
                                            <Settings
                                                className="h-4 w-4"
                                                strokeWidth={1.5}
                                            />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom">
                                        Settings <kbd>⌘,</kbd>
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                        </div>

                        <CollapsibleContent className="max-h-[400px] overflow-y-auto no-scrollbar">
                            <SidebarGroup className="min-h-0">
                                <SidebarGroupContent>
                                    {chats.map((chat) => (
                                        <SidebarMenuItem key={chat.id}>
                                            <SidebarMenuButton
                                                onClick={(e) =>
                                                    void handleQuickChatConversion(
                                                        e,
                                                        chat,
                                                    )
                                                }
                                                className="text-sidebar-accent-foreground truncate group/chat-button flex justify-between"
                                            >
                                                <span className="truncate pr-3 text-sm">
                                                    {chat.title ||
                                                        "Untitled Chat"}
                                                </span>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    ))}
                                </SidebarGroupContent>
                            </SidebarGroup>
                            {!chats.length && (
                                <div className="px-2 py-2 text-sm text-muted-foreground">
                                    Start an Ambient Chat with{" "}
                                    <span className="text-sm">
                                        {settings?.quickChat?.shortcut ||
                                            "⌥Space"}
                                    </span>
                                </div>
                            )}
                        </CollapsibleContent>
                    </SidebarMenuItem>
                </Collapsible>
            </SidebarMenu>
        </div>
    );
}

const deleteChatDialogId = (chatId: string) => `delete-chat-dialog-${chatId}`;

function ChatListItem({ chat, isActive }: { chat: Chat; isActive: boolean }) {
    const isDeleteChatDialogOpen = useDialogStore(
        (state) => state.activeDialogId === deleteChatDialogId(chat.id),
    );
    const deleteConfirmButtonRef = useRef<HTMLButtonElement>(null);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const settings = useSettings();

    // no good very bad, but unfortunately necessary -- see https://github.com/remix-run/react-router/issues/7634#issuecomment-2184999343
    const navigate = useRef(useNavigate());

    const { mutateAsync: renameChatMutateAsync } = ChatAPI.useRenameChat();
    const {
        mutateAsync: deleteChatMutateAsync,
        isPending: deleteChatIsPending,
    } = ChatAPI.useDeleteChat();
    const { data: parentChat } = useQuery(
        ChatAPI.chatQueries.detail(chat.parentChatId ?? undefined),
    );

    const handleOpenDeleteDialog = useCallback(() => {
        dialogActions.openDialog(deleteChatDialogId(chat.id));
    }, [chat.id]);

    const handleConfirmDelete = useCallback(async () => {
        const chatTitle = chat.title || "Untitled Chat";
        await deleteChatMutateAsync({
            chatId: chat.id,
        });
        dialogActions.closeDialog();

        toast(`'${chatTitle}' deleted`);
    }, [chat.id, chat.title, deleteChatMutateAsync]);

    // Handle keyboard navigation in delete dialog
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isDeleteChatDialogOpen) return;

            if (e.key === "Escape") {
                dialogActions.closeDialog();
                e.preventDefault();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isDeleteChatDialogOpen, chat.id]);

    // Focus the confirm button when dialog opens
    useEffect(() => {
        if (isDeleteChatDialogOpen && deleteConfirmButtonRef.current) {
            setTimeout(() => {
                deleteConfirmButtonRef.current?.focus();
            }, 50);
        }
    }, [isDeleteChatDialogOpen, chat.id]);

    const handleStartEdit = useCallback(() => {
        setIsEditingTitle(true);
    }, [setIsEditingTitle]);

    const handleStopEdit = useCallback(() => {
        setIsEditingTitle(false);
    }, [setIsEditingTitle]);

    const handleSubmitEdit = useCallback(
        async (newTitle: string) => {
            await renameChatMutateAsync({
                chatId: chat.id,
                newTitle,
            });
            setIsEditingTitle(false);
        },
        [chat.id, renameChatMutateAsync],
    );
    const showCost = settings?.showCost ?? false;

    return (
        <ChatListItemView
            chatId={chat.id}
            chatTitle={chat.title || ""}
            isNewChat={chat.isNewChat}
            parentChatId={parentChat?.id ?? null}
            parentChatTitle={parentChat?.title || null}
            isActive={isActive}
            isEditingTitle={isEditingTitle}
            onStartEdit={handleStartEdit}
            onStopEdit={handleStopEdit}
            onSubmitEdit={handleSubmitEdit}
            onDelete={handleOpenDeleteDialog}
            onConfirmDelete={handleConfirmDelete}
            deleteIsPending={deleteChatIsPending}
            navigate={navigate}
            deleteConfirmButtonRef={deleteConfirmButtonRef}
            chatCost={chat.totalCostUsd}
            showCost={showCost}
        />
    );
}

type ChatListItemViewProps = {
    chatId: string;
    chatTitle: string;
    isNewChat: boolean;
    parentChatId: string | null;
    parentChatTitle: string | null;
    isActive: boolean;
    isEditingTitle: boolean;
    onStartEdit: () => void;
    onStopEdit: () => void;
    onSubmitEdit: (newTitle: string) => Promise<void>;
    onDelete: () => void;
    onConfirmDelete: () => void;
    deleteIsPending: boolean;
    navigate: MutableRefObject<NavigateFunction>;
    deleteConfirmButtonRef: MutableRefObject<HTMLButtonElement | null>;
    chatCost?: number;
    showCost: boolean;
};

const ChatListItemView = React.memo(
    ({
        chatId,
        chatTitle,
        isNewChat,
        parentChatId,
        parentChatTitle,
        isActive,
        isEditingTitle,
        onStartEdit,
        onStopEdit,
        onSubmitEdit,
        onDelete,
        onConfirmDelete,
        deleteIsPending,
        navigate,
        deleteConfirmButtonRef,
        chatCost,
        showCost,
    }: ChatListItemViewProps) => {
        return (
            <div
                key={chatId + "-sidebar"}
                className={[
                    deleteIsPending ? "opacity-50" : "",
                    // chat.projectContextSummaryIsStale
                    //     ? "border !border-red-500"
                    //     : "", // for debugging
                ].join(" ")}
            >
                <Draggable id={chatId}>
                    <SidebarMenuButton
                        asChild={false}
                        data-active={isActive}
                        onClick={() => {
                            navigate.current(`/chat/${chatId}`);
                        }}
                        className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground text-sidebar-foreground truncate group/chat-button flex justify-between mb-0.5 font-[350] relative"
                    >
                        <div
                            className={`truncate flex items-center text-base w-full ${isNewChat ? "text-muted-foreground" : ""}`}
                        >
                            {parentChatId && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div
                                            className="hover:text-foreground group/parent-chat-button mr-2 flex-shrink-0"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                navigate.current(
                                                    `/chat/${parentChatId}`,
                                                );
                                            }}
                                        >
                                            <span className="flex-shrink-0">
                                                <SplitOptimized className="w-3 h-3 mr-2 text-muted-foreground group-hover/parent-chat-button:text-accent-500" />
                                            </span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        Branched from:{" "}
                                        {parentChatTitle || "Untitled Chat"}
                                    </TooltipContent>
                                </Tooltip>
                            )}
                            <EditableTitle
                                title={chatTitle || ""}
                                onUpdate={async (newTitle) => {
                                    await onSubmitEdit(newTitle);
                                }}
                                className="flex-1 truncate"
                                editClassName={`h-auto text-base px-0 py-0 ${isActive ? "bg-sidebar-accent" : ""} group-hover/chat-button:bg-sidebar-accent border-0 focus:ring-0 focus:outline-none shadow-none`}
                                placeholder="Untitled Chat"
                                showEditIcon={false}
                                clickToEdit={false}
                                isEditing={isEditingTitle}
                                onStartEdit={onStartEdit}
                                onStopEdit={onStopEdit}
                            />
                            <ChatLoadingIndicator chatId={chatId} />
                            {showCost &&
                                chatCost !== undefined &&
                                chatCost > 0 && (
                                    <span className="ml-auto pl-2 text-xs text-muted-foreground flex-shrink-0">
                                        {formatCost(chatCost)}
                                    </span>
                                )}
                        </div>

                        {/* Gradient overlay that appears when hovering */}
                        <div className="absolute right-0 w-20 h-full opacity-0 group-hover/chat-button:opacity-100 transition-opacity bg-gradient-to-l from-sidebar-accent via-sidebar-accent to-transparent pointer-events-none" />

                        {/* chat actions */}
                        <div className="flex items-center gap-2 absolute right-3 z-10">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <PencilOptimized
                                        className="h-[13px] w-[13px] opacity-0 group-hover/chat-button:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                        onClick={(e: React.MouseEvent) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onStartEdit();
                                        }}
                                    />
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                    Rename chat
                                </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div onClick={onDelete}>
                                        <Trash2Optimized className="h-[13px] w-[13px] opacity-0 group-hover/chat-button:opacity-100 transition-opacity text-muted-foreground hover:text-foreground" />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                    Delete chat
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    </SidebarMenuButton>
                </Draggable>

                {/* Delete confirmation dialog */}
                <Dialog id={deleteChatDialogId(chatId)}>
                    <DialogContent className="sm:max-w-md p-5">
                        <DialogHeader>
                            <DialogTitle>
                                Delete &ldquo;
                                {chatTitle || "Untitled Chat"}&rdquo;
                            </DialogTitle>
                            <DialogDescription>
                                Are you sure you want to delete this chat? This
                                action cannot be undone.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => dialogActions.closeDialog()}
                                // for some reason tabIndex=2 or =0 isn't working
                                // so I'm using -1 to ensure the Delete button gets focus
                                tabIndex={-1}
                            >
                                Cancel{" "}
                                <span className="ml-1 text-sm text-muted-foreground/70">
                                    Esc
                                </span>
                            </Button>
                            <Button
                                type="button"
                                variant="default"
                                size="sm"
                                onClick={onConfirmDelete}
                                tabIndex={1}
                                ref={deleteConfirmButtonRef}
                            >
                                Delete <span className="ml-1 text-xs">⌘↵</span>
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        );
    },
);

const ChatLoadingIndicator = React.memo(({ chatId }: { chatId: string }) => {
    const chatIsLoading =
        useQuery(ChatAPI.chatIsLoadingQueries.detail(chatId)).data ?? false;
    return chatIsLoading ? <RetroSpinner className="ml-2" /> : null;
});
