import globals from "globals";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
    {
        ignores: [
            "src-tauri/target/**/*",
            "dist/**/*",
            "reference/**/*",
            "postcss.config.js",
            "vite.config.ts",
            "vitest.config.ts",
            "tailwind.config.cjs",
            ".github/**/*.yml",
            ".github/**/*.yaml",
        ],
    },
    eslint.configs.recommended,
    reactRefresh.configs.vite,
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
            globals: globals.browser,
        },
        plugins: {
            react: pluginReact,
            "react-hooks": pluginReactHooks,
        },
        settings: {
            react: {
                version: "detect",
            },
        },
        rules: {
            "react/react-in-jsx-scope": "off",
            "no-unused-vars": "off",
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    args: "all",
                    argsIgnorePattern: "^_",
                    caughtErrors: "all",
                    caughtErrorsIgnorePattern: "^_",
                    destructuredArrayIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                },
            ],
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/no-misused-promises": [
                "warn",
                {
                    checksVoidReturn: {
                        attributes: false,
                    },
                    checksConditionals: true,
                    checksSpreads: true,
                },
            ],
        },
    },
);
