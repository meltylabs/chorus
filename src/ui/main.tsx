// Import polyfills first
import "../polyfills";

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { PostHogProvider } from "posthog-js/react";

const options = {
    api_host: "https://us.i.posthog.com",
};

// suggested by Ripple
window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled promise rejection:", event.reason);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <PostHogProvider
            apiKey="phc_CZDlvSwRIls38T9qDCmTsRq24Q6lfrsUYHSR2baHb1"
            options={options}
        >
            <App />
        </PostHogProvider>
    </React.StrictMode>,
);
