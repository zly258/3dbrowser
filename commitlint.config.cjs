module.exports = {
    extends: ["@commitlint/config-conventional"],
    helpUrl: "https://www.conventionalcommits.org/zh-hans/v1.0.0/",
    rules: {
        "type-enum": [
            2,
            "always",
            [
                "feat",
                "fix",
                "style",
                "refactor",
                "docs",
                "test",
                "build",
                "ci",
                "perf",
                "chore",
                "revert"
            ]
        ],
        "type-case": [2, "always", "lower-case"],
        "type-empty": [2, "never"],
        "subject-empty": [2, "never"],
        "header-max-length": [2, "always", 100],
        "subject-case": [0]
    },
    prompt: {
        messages: {
            skip: "跳过",
            max: "最多 %d 个字符",
            min: "至少 %d 个字符",
            emptyWarning: "此项不能为空",
            upperLimitWarning: "超过允许长度",
            lowerLimitWarning: "低于最小长度"
        }
    }
};
