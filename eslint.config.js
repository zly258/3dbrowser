import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
    {
        ignores: ["dist/**", "dist-pages/**", "node_modules/**", ".tmpbuild/**", "public/**"]
    },
    // 纯 JS 脚本/配置
    {
        files: ["**/*.{js,mjs,cjs}"],
        extends: [js.configs.recommended],
        languageOptions: {
            globals: { ...globals.node, ...globals.browser }
        },
        rules: {
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
            "no-empty": "off",
            "no-console": "off",
            // 隐私/emoji 审计脚本按设计匹配组合字符
            "no-misleading-character-class": "off"
        }
    },
    // TypeScript 源码
    {
        files: ["**/*.{ts,tsx}"],
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        plugins: {
            "react-hooks": reactHooks
        },
        languageOptions: {
            globals: { ...globals.browser, ...globals.node }
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            // 现存代码大量使用 any；先不据此阻断，只作为后续清理目标。
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }
            ],
            "no-empty": "off",
            "no-console": "off"
        }
    }
);
