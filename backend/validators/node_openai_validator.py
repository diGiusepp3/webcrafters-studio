def validate_node_openai(files: list[dict]) -> list[str]:
    errors = []

    all_code = "\n".join(f.get("content", "") for f in files)

    # ===== OpenAI SDK (oude syntax VERBODEN) =====
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
            errors.append(f"Forbidden OpenAI SDK usage detected: {token}")

    # ===== Moderne SDK VERPLICHT =====
    if "import OpenAI from \"openai\"" not in all_code:
        errors.append("Missing modern OpenAI SDK import: import OpenAI from \"openai\"")

    # ===== ESM check =====
    uses_import = "import " in all_code
    package_json = next((f for f in files if f.get("path") == "package.json"), None)

    if uses_import:
        if not package_json:
            errors.append("Missing package.json while using ESM imports")
        elif "\"type\": \"module\"" not in package_json.get("content", ""):
            errors.append("ESM imports used but package.json lacks \"type\": \"module\"")

    # ===== Cheapest TTS verplicht =====
    if any(k in all_code.lower() for k in ["tts", "speech", "audio"]):
        if "gpt-4o-mini-tts" not in all_code:
            errors.append("TTS detected but cheapest model gpt-4o-mini-tts not used")

    # ===== ENV key verplicht =====
    if "OPENAI_API_KEY" not in all_code:
        errors.append("process.env.OPENAI_API_KEY is not referenced")

    if "OPENAI_API_KEY ??" in all_code:
        errors.append("OPENAI_API_KEY fallback detected – forbidden")

    return errors
