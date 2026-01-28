def _uses_openai_sdk(code: str) -> bool:
    lowered = code.lower()
    return any(token in lowered for token in [
        "openai",
        "chatcompletion",
        "openai.chatcompletions",
        "chat.completions",
    ])


def _log_warning(errors: list[str], message: str) -> None:
    if message not in errors:
        errors.append(message)


def validate_node_openai(files: list[dict]) -> list[str]:
    errors = []
    all_code = "\n".join(f.get("content", "") for f in files)

    if not _uses_openai_sdk(all_code):
        return errors

    forbidden_tokens = [
        "Configuration",
        "OpenAIApi",
        "new OpenAIApi",
        "require(\"openai\")",
        "ChatCompletion.create",
        "createChatCompletion",
    ]

    for token in forbidden_tokens:
        if token in all_code:
            _log_warning(errors, f"Forbidden OpenAI SDK usage detected: {token}")

    if "import OpenAI from \"openai\"" not in all_code and "from openai import OpenAI" not in all_code:
        _log_warning(errors, "Missing modern OpenAI SDK import: import OpenAI from \"openai\"")

    uses_import = "import " in all_code or "require(" in all_code
    package_json = next((f for f in files if f.get("path") == "package.json"), None)
    if uses_import and package_json:
        pkg = package_json.get("content", "")
        if "\"type\": \"module\"" not in pkg:
            _log_warning(errors, "ESM imports used but package.json lacks \"type\": \"module\"")
    elif uses_import and not package_json:
        _log_warning(errors, "Missing package.json while using ES modules")

    if any(k in all_code.lower() for k in ["tts", "speech", "audio"]):
        if "gpt-4o-mini-tts" not in all_code:
            _log_warning(errors, "TTS detected but cheapest model gpt-4o-mini-tts not used")

    if "OPENAI_API_KEY" not in all_code:
        _log_warning(errors, "process.env.OPENAI_API_KEY must be referenced when calling OpenAI")

    if "OPENAI_API_KEY ??" in all_code:
        _log_warning(errors, "OPENAI_API_KEY fallback detected – forbidden")

    return errors
