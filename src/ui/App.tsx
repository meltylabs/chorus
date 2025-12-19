import { scan } from "react-scan"; // must import before react
import {
    BrowserRouter as Router,
    Route,
    Routes,
    useNavigate,
    useLocation,
} from "react-router-dom";
import { useCallback, useEffect, useState, useRef } from "react";
import "./App.css";
import { AppProvider } from "./providers/AppProvider";
import { useAppContext } from "@ui/hooks/useAppContext";
import { useDialogStore, dialogActions } from "@core/infra/DialogStore";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import { check, DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { toast } from "sonner";
import { Toaster } from "sonner";
import { useTheme } from "@ui/hooks/useTheme";
import Settings, {
    SETTINGS_DIALOG_ID,
    type SettingsTabId,
} from "./components/Settings";
import { SidebarProvider } from "./providers/SidebarProvider";
import { AppSidebar } from "./components/AppSidebar";
import { ThemeProvider } from "@ui/themes/theme-provider";
import { COMMAND_MENU_DIALOG_ID, CommandMenu } from "./components/CommandMenu";
import Home from "./components/Home";
import MultiChat from "./components/MultiChat";
import NewPrompt from "./components/NewPrompt";
import ListPrompts from "./components/ListPrompts";
import Onboarding from "./components/Onboarding";
import ProjectView from "./components/ProjectView";
import {
    onOpenUrl,
    getCurrent as getCurrentDeepLink,
} from "@tauri-apps/plugin-deep-link";
import { config } from "@core/config";
import Database from "@tauri-apps/plugin-sql";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Progress } from "./components/ui/progress";
import RetroSpinner from "./components/ui/retro-spinner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "./components/ui/alert-dialog";
import { openUrl, openPath } from "@tauri-apps/plugin-opener";
import { useDatabase } from "./hooks/useDatabase";
import { stopAllStreamingMessages } from "@core/chorus/api/MessageAPI";
import { X } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { platform, arch, version } from "@tauri-apps/plugin-os";
import { confirm } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { resourceDir, homeDir } from "@tauri-apps/api/path";
import { v4 as uuidv4 } from "uuid";
import {
    MutationCache,
    QueryClient,
    QueryClientProvider,
    useQuery,
} from "@tanstack/react-query";
import { AppMetadataProvider } from "@ui/providers/AppMetadataProvider";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useShortcut } from "./hooks/useShortcut";
import { Button } from "./components/ui/button";
import { DatabaseProvider } from "./providers/DatabaseProvider";
import { Alert, AlertTitle, AlertDescription } from "./components/ui/alert";
import { relaunch } from "@tauri-apps/plugin-process";
import { ToolPermissionDialog } from "./components/ToolPermissionDialog";
import * as AppMetadataAPI from "@core/chorus/api/AppMetadataAPI";
import * as ToolsetsAPI from "@core/chorus/api/ToolsetsAPI";
import * as ChatAPI from "@core/chorus/api/ChatAPI";
import * as ProjectAPI from "@core/chorus/api/ProjectAPI";

scan({
    enabled: true,
    log: true, // logs render info to console (default: false)
    clearLog: false, // clears the console per group of renders (default: false)
});

const mutationCache = new MutationCache({
    onError: (error, variables, context) => {
        console.error("Mutation error:", error, variables, context); // default error handler. makes sure we don't miss errors in mutations
    },
});

const queryClient = new QueryClient({
    mutationCache,
    defaultOptions: {
        queries: {
            retry: false,
            networkMode: "always",
            refetchOnWindowFocus: false,
            staleTime: Infinity,
        },
    },
});

// function DeeplinkTester({ onTest }: { onTest: (urls: string[]) => void }) {
//     const [testUrl, setTestUrl] = useState("");

//     const handleTestDeeplink = () => {
//         if (testUrl.trim()) {
//             onTest([testUrl]);
//         }
//     };

//     return (
//         <div className="fixed bottom-12 right-4 z-50 flex gap-2 bg-card p-2 rounded-md border shadow-md">
//             <input
//                 type="text"
//                 value={testUrl}
//                 onChange={(e) => setTestUrl(e.target.value)}
//                 placeholder="chorus://..."
//                 className="px-2 py-1 text-sm border rounded"
//             />
//             <button
//                 onClick={handleTestDeeplink}
//                 className="px-2 py-1 text-sm bg-primary text-primary-foreground rounded"
//             >
//                 Open deep link
//             </button>
//         </div>
//     );
// }

function AppContent() {
    const navigate = useNavigate();
    const location = useLocation();
    const { mode } = useTheme();
    const hasDismissedOnboarding = AppMetadataAPI.useHasDismissedOnboarding();
    const dismissedAlertVersion = AppMetadataAPI.useDismissedAlertVersion();
    const setDismissedAlertVersion =
        AppMetadataAPI.useSetDismissedAlertVersion();
    const [currentAppVersion, setCurrentAppVersion] = useState<string | null>(
        null,
    );

    // Load app version once on mount
    useEffect(() => {
        void getVersion().then(setCurrentAppVersion);
    }, []);

    // Get all chats to determine if user is new
    const { data: chats } = useQuery(ChatAPI.chatQueries.list());

    // We want to auto-dismiss educational tooltip when someone opens
    // the app for the first time. As a hack for something similar,
    // we equate "opens the app for the first time" with "has no non-empty chats"
    useEffect(() => {
        if (
            hasDismissedOnboarding &&
            chats !== undefined &&
            chats.filter((chat) => !chat.isNewChat).length === 0 &&
            currentAppVersion !== null &&
            dismissedAlertVersion !== currentAppVersion
        ) {
            // New user with no chats - auto-dismiss the educational tooltip
            console.log("auto-dismissing educational tooltip for new user");
            setDismissedAlertVersion.mutate({ version: currentAppVersion });
        }
    }, [
        hasDismissedOnboarding,
        chats,
        currentAppVersion,
        dismissedAlertVersion,
        setDismissedAlertVersion,
    ]);

    // Calculate if educational tooltip should be shown
    const showEducationalTooltip =
        hasDismissedOnboarding &&
        currentAppVersion !== null &&
        dismissedAlertVersion !== currentAppVersion;

    const [reviewsDialogOpen, setReviewsDialogOpen] = useState(false);
    const [_waitlistDialogOpen, _setWaitlistDialogOpen] = useState(false);
    const [defaultSettingsTab, setDefaultSettingsTab] =
        useState<SettingsTabId>("general");
    const { db } = useDatabase();

    const { isQuickChatWindow, zoomLevel, setZoomLevel } = useAppContext();
    const isSettingsDialogOpen = useDialogStore(
        (state) => state.activeDialogId === SETTINGS_DIALOG_ID,
    );
    const isCommandMenuDialogOpen = useDialogStore(
        (state) => state.activeDialogId === COMMAND_MENU_DIALOG_ID,
    );
    const isDialogOpen = useDialogStore(
        (state) => state.activeDialogId !== null,
    );

    const updateToolsetsConfig = ToolsetsAPI.useUpdateToolsetsConfig();

    // Get current chat info for cmd+n shortcut logic. note that this is all hacky, we're doing it in AppSidebar too
    const currentChatId = location.pathname.match(/^\/chat\/(.+)$/)?.[1];
    const currentChatQuery = ChatAPI.useChat(currentChatId ?? "");
    const currentChat = currentChatQuery.data;

    // Check if we're on a project view page
    const currentProjectId = location.pathname.match(/^\/projects\/(.+)$/)?.[1];

    useShortcut(
        ["meta", "k"],
        () => {
            if (isCommandMenuDialogOpen) {
                dialogActions.closeDialog();
            } else {
                dialogActions.openDialog(COMMAND_MENU_DIALOG_ID);
            }
        },
        {
            isGlobal: true,
        },
    );

    useShortcut(
        ["meta", "="],
        () => {
            if (!isQuickChatWindow) {
                const newZoomLevel = zoomLevel + 10;
                setZoomLevel(newZoomLevel);
            }
        },
        {
            isGlobal: true,
        },
    );

    useShortcut(
        ["meta", "-"],
        () => {
            if (!isQuickChatWindow) {
                const newZoomLevel = Math.max(10, zoomLevel - 10);
                setZoomLevel(newZoomLevel);
            }
        },
        {
            isGlobal: true,
        },
    );

    useShortcut(
        ["meta", "0"],
        () => {
            if (!isQuickChatWindow) {
                setZoomLevel(100);
            }
        },
        {
            isGlobal: true,
        },
    );

    // these are not global since they're navigation based
    // and we should block these out when a dialog is opened
    useShortcut(["meta", "["], () => {
        if (!isQuickChatWindow) {
            navigate(-1);
        }
    });

    useShortcut(["meta", "]"], () => {
        if (!isQuickChatWindow) {
            navigate(1);
        }
    });

    useShortcut(["meta", "p"], () => {
        if (!isQuickChatWindow) {
            navigate("/prompts");
        }
    });

    const createGroupChat = ChatAPI.useCreateGroupChat();
    useShortcut(["meta", "shift", "g"], () => {
        if (!isQuickChatWindow && !isDialogOpen) {
            createGroupChat.mutate();
        }
    });

    const handleDeepLink = useCallback(
        (urls: string[]) => {
            const url = urls[0];
            console.log("handleDeepLink", url);
            try {
                const urlObj = new URL(url);
                if (urlObj.protocol === "chorus:") {
                    if (urlObj.hostname === "slack") {
                        const accessToken =
                            urlObj.searchParams.get("access_token");
                        const teamId = urlObj.searchParams.get("team_id");
                        if (accessToken && teamId) {
                            updateToolsetsConfig.mutate({
                                toolsetName: "slack",
                                parameterId: "apiToken",
                                value: accessToken,
                            });
                            updateToolsetsConfig.mutate({
                                toolsetName: "slack",
                                parameterId: "teamId",
                                value: teamId,
                            });
                            updateToolsetsConfig.mutate({
                                toolsetName: "slack",
                                parameterId: "enabled",
                                value: "true",
                            });
                        }
                    } else if (urlObj.hostname === "github_integration") {
                        const accessToken =
                            urlObj.searchParams.get("access_token");
                        if (accessToken) {
                            updateToolsetsConfig.mutate({
                                toolsetName: "github",
                                parameterId: "personalAccessToken",
                                value: accessToken,
                            });
                            updateToolsetsConfig.mutate({
                                toolsetName: "github",
                                parameterId: "enabled",
                                value: "true",
                            });
                            toast.success("GitHub successfully connected", {
                                description:
                                    "You can now manage repos, code, issues, and PRs from Chorus",
                            });
                        }
                    } else if (urlObj.hostname === "chat") {
                        const chatId = urlObj.pathname.split("/")[1];
                        if (chatId) {
                            navigate(`/chat/${chatId}`);
                        }
                    } else {
                        throw new Error(`Unrecognized deep link ${url}`);
                    }
                }
            } catch (error) {
                console.error("Failed to parse deep link URL:", error);
                toast.error("Invalid Deep Link", {
                    description: `The URL format is invalid — ${url}`,
                });
            }
        },
        [updateToolsetsConfig, navigate],
    );

    // Check for deep link on app load
    useEffect(() => {
        const checkDeepLink = async () => {
            const urls = await getCurrentDeepLink();
            if (urls) {
                handleDeepLink(urls);
            }
        };

        void checkDeepLink().catch(console.error);
        // TODO figure out a safe solution for this (we want it to run only on app load)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Deep link listener for when app is already running
    useEffect(() => {
        const unlistenPromise = onOpenUrl((urls) => {
            console.log("Deep link received:", urls);
            void handleDeepLink(urls);
        });

        return () => {
            void unlistenPromise.then((fn) => fn()).catch(console.error);
        };
    }, [handleDeepLink]);

    const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
    const isDownloadingRef = useRef(false);

    // Helper function to show the update ready toast
    const showUpdateReadyToast = useCallback(() => {
        toast("New update available", {
            description: `Restart to use the latest.`,
            action: (
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            void openUrl("https://chorus.sh/changelog");
                        }}
                    >
                        See changes
                    </Button>
                    <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                            localStorage.removeItem("pendingUpdateVersion");
                            void relaunch().catch(console.error);
                        }}
                    >
                        Restart
                    </Button>
                </div>
            ),
            duration: Number.POSITIVE_INFINITY,
        });
    }, []);

    const downloadUpdate = useCallback(
        async (update: Update, showProgress = true) => {
            // Check if already downloading using ref to prevent race conditions
            if (isDownloadingRef.current) {
                console.log("Already downloading update, skipping");
                return;
            }

            console.log("Downloading update:", update);
            isDownloadingRef.current = true;
            setIsDownloadingUpdate(true);
            let totalSize = 0;
            let progressToastId: string | number | undefined;

            const updateToast = (progress: number) => {
                if (!showProgress) return;

                const content = {
                    id: "update-toast",
                    title: "Downloading update in background",
                    action: (
                        <>
                            <div className="w-full inline-flex items-center justify-center">
                                <RetroSpinner />
                                <Progress
                                    value={progress}
                                    className="w-full ml-2"
                                />
                                <span className="text-sm text-muted-foreground text-center ml-2">
                                    {Math.round(progress)}%
                                </span>
                            </div>
                        </>
                    ),
                    duration: Number.POSITIVE_INFINITY,
                };

                if (!progressToastId) {
                    progressToastId = toast(content.title, {
                        description: content.action,
                        duration: content.duration,
                        id: content.id,
                    });
                } else {
                    // Sonner doesn't have toast.update, so dismiss and recreate
                    toast.dismiss(progressToastId);
                    progressToastId = toast(content.title, {
                        description: content.action,
                        duration: content.duration,
                        id: content.id,
                    });
                }
            };

            try {
                // Start with 0%
                updateToast(0);

                // Listen for download progress
                await update.downloadAndInstall((event: DownloadEvent) => {
                    if (event.event === "Started") {
                        console.log("Download started");
                        totalSize = 0;
                    } else if (event.event === "Progress") {
                        // Update total downloaded
                        totalSize += event.data.chunkLength;
                        // Show progress as chunks received
                        updateToast(Math.min(99, totalSize / 1000000)); // Estimate progress based on MB downloaded
                    } else if (event.event === "Finished") {
                        console.log("Download finished");
                        updateToast(100);
                        // Dismiss the progress toast after a short delay
                        setTimeout(() => {
                            if (progressToastId) {
                                toast.dismiss(progressToastId);
                            }
                        }, 500);
                    }
                });

                // Mark update as downloaded
                setIsDownloadingUpdate(false);
                isDownloadingRef.current = false;

                // Store version in localStorage
                localStorage.setItem("pendingUpdateVersion", update.version);

                // Show ready toast
                showUpdateReadyToast();
            } catch (error) {
                setIsDownloadingUpdate(false);
                isDownloadingRef.current = false;
                if (progressToastId) {
                    toast.dismiss(progressToastId);
                }
                toast.error("Update download failed", {
                    description: error as string,
                });
            }
        },
        [showUpdateReadyToast, isDownloadingRef],
    );

    const checkForUpdates = useCallback(async () => {
        const update = await check();

        if (update && !isQuickChatWindow && !isDownloadingUpdate) {
            // Check if we already have this update downloaded
            const pendingVersion = localStorage.getItem("pendingUpdateVersion");
            if (pendingVersion === update.version) {
                // Update already downloaded, don't re-download
                // Don't show toast again - user likely dismissed it
                return;
            }

            // Automatically start downloading in the background
            console.log("Auto-downloading update in background");
            void downloadUpdate(update, false).catch(console.error);
        }
    }, [isQuickChatWindow, downloadUpdate, isDownloadingUpdate]);

    // Clear pending update info on startup since if we're running,
    // any staged update has already been applied by Tauri
    useEffect(() => {
        localStorage.removeItem("pendingUpdateVersion");
    }, []);

    useEffect(() => {
        // Don't check for updates in dev mode
        if (import.meta.env.DEV) {
            return;
        }

        void checkForUpdates().catch(console.error);

        const updatesTimeout = setInterval(() => {
            void checkForUpdates().catch(console.error);
        }, 300000);

        return () => clearInterval(updatesTimeout);
    }, [checkForUpdates]);

    const getOrCreateNewChat = ChatAPI.useGetOrCreateNewChat();
    const getOrCreateNewQuickChat = ChatAPI.useGetOrCreateNewQuickChat();
    const createProject = ProjectAPI.useCreateProject();

    // Listen for menu events from Rust
    useEffect(() => {
        const unlistenNewChat = listen("menu-new-chat", () => {
            void (async () => {
                // Check if this window is focused before processing
                const currentWindow = getCurrentWindow();
                const isFocused = await currentWindow.isFocused();
                if (!isFocused) {
                    console.log(
                        "Menu new chat event received but window not focused, ignoring",
                    );
                    return;
                }
                console.log("Menu new chat event received");
                if (isDialogOpen) {
                    dialogActions.closeDialog();
                }

                // Use the appropriate function based on window type
                if (isQuickChatWindow) {
                    getOrCreateNewQuickChat.mutate();
                } else {
                    // Always create a default (non-project) chat when using Cmd+N
                    getOrCreateNewChat.mutate({
                        projectId: "default",
                    });
                }
            })();
        });

        const unlistenNewProject = listen("menu-new-project", () => {
            void (async () => {
                const currentWindow = getCurrentWindow();
                const isFocused = await currentWindow.isFocused();
                if (!isFocused) {
                    console.log(
                        "Menu new project event received but window not focused, ignoring",
                    );
                    return;
                }
                // Don't create projects from quick chat window
                if (isQuickChatWindow) {
                    console.log(
                        "Menu new project event received in quick chat window, ignoring",
                    );
                    return;
                }
                console.log("Menu new project event received");
                if (isDialogOpen) {
                    dialogActions.closeDialog();
                }
                createProject.mutate();
            })();
        });

        const unlistenSettings = listen("menu-settings", () => {
            void (async () => {
                const currentWindow = getCurrentWindow();
                const isFocused = await currentWindow.isFocused();
                if (!isFocused) {
                    console.log(
                        "Menu settings event received but window not focused, ignoring",
                    );
                    return;
                }
                console.log("Menu settings event received");
                if (isQuickChatWindow) {
                    return;
                }
                if (isSettingsDialogOpen) {
                    dialogActions.closeDialog();
                } else {
                    dialogActions.openDialog(SETTINGS_DIALOG_ID);
                }
            })();
        });

        const unlistenChangelog = listen("menu-changelog", () => {
            void (async () => {
                const currentWindow = getCurrentWindow();
                const isFocused = await currentWindow.isFocused();
                if (!isFocused) {
                    console.log(
                        "Menu changelog event received but window not focused, ignoring",
                    );
                    return;
                }
                void openUrl("https://chorus.sh/changelog").catch(
                    console.error,
                );
            })();
        });

        const unlistenAbout = listen("menu-about", () => {
            void (async () => {
                const currentWindow = getCurrentWindow();
                const isFocused = await currentWindow.isFocused();
                if (!isFocused) {
                    console.log(
                        "Menu about event received but window not focused, ignoring",
                    );
                    return;
                }
                const appVersion = await getVersion();
                const plat = platform();
                const architecture = arch();
                const osVer = version();

                const info = `Version: ${appVersion}\nPlatform: ${plat}\nArchitecture: ${architecture}\nOS Version: ${osVer}\n\n`;

                const shouldCopy = await confirm(info, {
                    title: "Chorus",
                    okLabel: "Copy",
                    cancelLabel: "Close",
                });

                if (shouldCopy) {
                    await writeText(info);
                    toast("Copied", {
                        description: "System information copied to clipboard",
                    });
                }
            })();
        });

        return () => {
            void unlistenNewChat.then((fn) => fn());
            void unlistenNewProject.then((fn) => fn());
            void unlistenSettings.then((fn) => fn());
            void unlistenChangelog.then((fn) => fn());
            void unlistenAbout.then((fn) => fn());
        };
    }, [
        createProject,
        navigate,
        getOrCreateNewChat,
        getOrCreateNewQuickChat,
        currentChat,
        currentProjectId,
        isDialogOpen,
        isQuickChatWindow,
        isSettingsDialogOpen,
    ]);

    const convertQuickChatToRegularChat =
        ChatAPI.useConvertQuickChatToRegularChat();

    useEffect(() => {
        const listenNav = listen(
            "open_quick_chat_in_main_window",
            (event: { payload: string }) => {
                console.log(
                    "open_quick_chat_in_main_window event received",
                    event,
                );

                void (async () => {
                    const chatId = event.payload;
                    try {
                        await convertQuickChatToRegularChat.mutateAsync({
                            chatId,
                        });
                        navigate(`/chat/${event.payload}`);
                    } catch (error) {
                        console.error("Error navigating to chat", error);
                    }
                })();
            },
        );

        return () => {
            void listenNav
                .then((fn) => fn())
                .catch((err) => {
                    console.error("Failed to unsubscribe:", err);
                });
        };
    }, [db, navigate, convertQuickChatToRegularChat]);

    const skipOnboarding = AppMetadataAPI.useSkipOnboarding();
    const onCompleteOnboarding = () => {
        skipOnboarding.mutate();
    };

    // Check if we should show the reviews dialog
    useEffect(() => {
        const checkReviewsDialog = async () => {
            const result = await db.select<{ value: string }[]>(
                "SELECT value FROM app_metadata WHERE key = 'needs_reviews_primer'",
            );

            if (result.length > 0 && result[0].value === "true") {
                setReviewsDialogOpen(true);
            }
        };

        void checkReviewsDialog();
    }, [db]);

    // Listen for events to open API keys settings
    useEffect(() => {
        const unlisten = listen(
            "open_settings",
            (event: {
                payload: {
                    tab: SettingsTabId;
                };
            }) => {
                setDefaultSettingsTab(event.payload.tab);
                dialogActions.openDialog(SETTINGS_DIALOG_ID);
            },
        );

        return () => {
            void unlisten.then((fn) => fn()).catch(console.error);
        };
    }, []);

    const dismissEducationalTooltip = () => {
        if (currentAppVersion) {
            setDismissedAlertVersion.mutate({ version: currentAppVersion });
        }
    };

    return (
        <>
            {showEducationalTooltip && !isQuickChatWindow && (
                <div className="fixed bottom-4 right-4 z-50 max-w-sm">
                    <Alert className="relative shadow-lg">
                        <button
                            onClick={() => void dismissEducationalTooltip()}
                            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                            aria-label="Dismiss alert"
                        >
                            <X className="h-4 w-4" />
                        </button>

                        <AlertTitle className="flex items-center gap-2">
                            Open Source
                        </AlertTitle>
                        <AlertDescription>
                            Chorus is now Open Source! It now runs on your own
                            API keys. Add them in Settings → API Keys.
                            <br />
                            <br />
                            <div className="gap-4 mt-2">
                                <button
                                    className="text-sm text-muted-foreground hover:text-foreground"
                                    onClick={() =>
                                        void openUrl(
                                            "https://github.com/meltylabs/chorus",
                                        )
                                    }
                                >
                                    Learn more
                                </button>
                            </div>
                        </AlertDescription>
                    </Alert>
                </div>
            )}

            <AlertDialog open={_waitlistDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            You're on the waitlist!
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Thanks for signing up! You've been added to our
                            waitlist. We'll email you as soon as your account is
                            activated with full access to Chorus.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                </AlertDialogContent>
            </AlertDialog>

            {!hasDismissedOnboarding && !isQuickChatWindow && (
                <Onboarding onComplete={onCompleteOnboarding} />
            )}

            <AlertDialog
                open={reviewsDialogOpen}
                onOpenChange={setReviewsDialogOpen}
            >
                <AlertDialogContent className="max-w-2xl">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Introducing Reviews</AlertDialogTitle>
                        <AlertDialogDescription>
                            <p>
                                AIs now review each other&rsquo;s messages for
                                accuracy and clarity. Only one AI responds at a
                                time.
                            </p>
                            <img
                                src="/review.jpg"
                                alt="Reviews"
                                className="w-full rounded-lg border my-6"
                            />
                            <p>
                                If you prefer to see responses side-by-side,
                                turn on Legacy Mode in settings.
                            </p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction
                            variant="default"
                            onClick={() => {
                                setReviewsDialogOpen(false);
                                void db.execute(
                                    "UPDATE app_metadata SET value = 'false' WHERE key = 'needs_reviews_primer'",
                                );
                            }}
                        >
                            Got it
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <div
                className={`select-none ${isQuickChatWindow ? "bg-transparent" : "bg-background"}`}
            >
                <SidebarProvider>
                    {!isQuickChatWindow && <AppSidebar />}

                    {!isQuickChatWindow && <CommandMenu />}
                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/new-prompt" element={<NewPrompt />} />
                        <Route path="/prompts" element={<ListPrompts />} />
                        <Route path="/chat/:chatId" element={<MultiChat />} />
                        <Route
                            path="/projects/:projectId"
                            element={<ProjectView />}
                        />
                    </Routes>
                    {!isQuickChatWindow && (
                        <Settings tab={defaultSettingsTab || "general"} />
                    )}
                    <ToolPermissionDialog />
                    <Toaster
                        theme={
                            mode === "system"
                                ? window.matchMedia(
                                      "(prefers-color-scheme: dark)",
                                  ).matches
                                    ? "dark"
                                    : "light"
                                : mode
                        }
                        position="bottom-right"
                        closeButton
                    />
                    {/* <DeeplinkTester onTest={handleDeepLink} /> */}
                </SidebarProvider>
            </div>
        </>
    );
}

async function getDeviceId(): Promise<string> {
    const db = await Database.load(config.dbUrl);
    const uuid = uuidv4();
    const potentialDeviceId = "chdev_" + uuid;

    // Insert if not exists, or return existing
    await db.execute(
        `
        INSERT INTO app_metadata (key, value)
        VALUES ('device_id', ?)
        ON CONFLICT(key) DO NOTHING`,
        [potentialDeviceId],
    );

    // Get the value (either existing or newly inserted)
    const result = await db.select<{ value: string }[]>(
        "SELECT value FROM app_metadata WHERE key = 'device_id'",
    );

    const finalDeviceId = result[0].value;
    return finalDeviceId;
}

function App() {
    const [_deviceId, setDeviceId] = useState<string | null>(null);
    const [db, setDb] = useState<Database | null>(null);
    const [appLocationDialogOpen, setAppLocationDialogOpen] = useState(false);

    useEffect(() => {
        void getDeviceId().then((id) => {
            setDeviceId(id);
        });
    }, []);

    // Check if app is in Applications folder
    useEffect(() => {
        async function checkAppLocation() {
            try {
                const appPath = await resourceDir();
                const userHome = await homeDir();
                const expectedPath = `${userHome}/Applications`;

                // Check if the app is in the Applications folder
                if (
                    !appPath.includes(expectedPath) &&
                    !appPath.includes("/Applications") &&
                    !import.meta.env.DEV
                ) {
                    setAppLocationDialogOpen(true);
                }
            } catch (error) {
                console.error("Failed to check app location:", error);
            }
        }

        void checkAppLocation();
    }, []);

    const initDatabase = async () => {
        try {
            const db = await Database.load(config.dbUrl);
            setDb(db);
        } catch (error) {
            console.error("Database initialization error:", error);
            toast.error("Error", {
                description: "Failed to initialize database",
            });
        }
    };

    useEffect(() => {
        void initDatabase();
    }, []);

    // Clean up streaming messages on app startup and close
    useEffect(() => {
        // Clean up any stale streaming messages on startup
        void stopAllStreamingMessages().catch(console.error);

        // Also try to clean up on window close (though this may not always fire)
        const handleBeforeUnload = () => {
            void stopAllStreamingMessages().catch(console.error);
        };

        window.addEventListener("beforeunload", handleBeforeUnload);

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, []);

    return (
        <QueryClientProvider client={queryClient}>
            <script src="https://unpkg.com/react-scan/dist/auto.global.js"></script>
            <Router>
                <ThemeProvider storageKey="melty-theme">
                    <ErrorBoundary>
                        {db ? (
                            <DatabaseProvider db={db}>
                                <AppProvider>
                                    <QueryClientProvider client={queryClient}>
                                        <AppMetadataProvider>
                                            <AppContent />
                                        </AppMetadataProvider>
                                    </QueryClientProvider>
                                </AppProvider>
                            </DatabaseProvider>
                        ) : (
                            <div className="p-10 text-sm text-muted-foreground">
                                <RetroSpinner />
                                Loading database...
                            </div>
                        )}
                    </ErrorBoundary>

                    <ErrorBoundary>
                        <AlertDialog
                            open={appLocationDialogOpen}
                            onOpenChange={setAppLocationDialogOpen}
                        >
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>
                                        Move to Applications Folder
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Looks like Chorus isn't in your
                                        Applications folder! This means you
                                        won't be able to get updates.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogAction
                                        onClick={() => {
                                            setAppLocationDialogOpen(false);
                                            void openPath(
                                                "/Applications",
                                            ).catch(console.error);
                                        }}
                                    >
                                        Open Applications Folder
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </ErrorBoundary>
                </ThemeProvider>
            </Router>
            <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
    );
}

export default App;
