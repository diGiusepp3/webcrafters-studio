# FILE: /backend/repair/ai_repair.py
import json
from typing import Any

REPAIR_SYSTEM_PROMPT = """
You are a senior software engineer fixing generated code.

Rules:
- Fix ONLY the reported errors
- Do NOT change unrelated files
- Keep the same project structure
- Use modern OpenAI SDK (import OpenAI from "openai")
- Ensure Node.js ESM compatibility
- Return ONLY valid JSON in the same format:
{
  "name": "...",
  "description": "...",
  "files": [{ "path": "...", "content": "...", "language": "..." }]
}
"""


class AIJSONError(Exception):
    pass


def _strip_code_fences(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        lines = t.splitlines()
        if len(lines) >= 2 and lines[0].startswith("```") and lines[-1].strip() == "```":
            t = "\n".join(lines[1:-1]).strip()
    return t


def _extract_first_json_object(text: str) -> str:
    start = text.find("{")
    if start == -1:
        raise AIJSONError("No '{' found in AI output.")

    in_string = False
    escape = False
    depth = 0
    end = None

    for i in range(start, len(text)):
        ch = text[i]

        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
            continue
        if ch == "{":
            depth += 1
            continue
        if ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break

    if end is None:
        raise AIJSONError("Unterminated JSON object in AI output.")

    return text[start:end]


def _escape_control_chars_inside_json_strings(s: str) -> str:
    out: list[str] = []
    in_string = False
    escape = False

    for ch in s:
        if in_string:
            if escape:
                out.append(ch)
                escape = False
                continue

            if ch == "\\":
                out.append(ch)
                escape = True
                continue

            if ch == '"':
                out.append(ch)
                in_string = False
                continue

            code = ord(ch)
            if ch == "\n":
                out.append("\\n")
            elif ch == "\r":
                out.append("\\r")
            elif ch == "\t":
                out.append("\\t")
            elif code < 0x20:
                out.append(f"\\u{code:04x}")
            else:
                out.append(ch)
            continue

        if ch == '"':
            out.append(ch)
            in_string = True
        else:
            out.append(ch)

    return "".join(out)


def _parse_ai_json(raw: str) -> dict[str, Any]:
    cleaned = _strip_code_fences(raw)
    obj_text = _extract_first_json_object(cleaned)

    try:
        data = json.loads(obj_text)
    except json.JSONDecodeError:
        repaired = _escape_control_chars_inside_json_strings(obj_text)
        try:
            data = json.loads(repaired)
        except json.JSONDecodeError as e2:
            raise AIJSONError(f"AI output still invalid JSON after repair: {e2}") from e2

    return _validate_and_normalize_project_json(data)


def _validate_and_normalize_project_json(data: Any) -> dict[str, Any]:
    """
    Hard schema guard zodat je pipeline niet later random omvalt.
    Normaliseert ook types (str) waar mogelijk.
    """
    if not isinstance(data, dict):
        raise AIJSONError("AI JSON must be an object at top-level.")

    # required keys
    for k in ("name", "description", "files"):
        if k not in data:
            raise AIJSONError(f"AI JSON missing required key: '{k}'")

    name = data.get("name")
    desc = data.get("description")
    files = data.get("files")

    if not isinstance(name, str) or not name.strip():
        raise AIJSONError("AI JSON 'name' must be a non-empty string.")
    if not isinstance(desc, str):
        raise AIJSONError("AI JSON 'description' must be a string.")
    if not isinstance(files, list):
        raise AIJSONError("AI JSON 'files' must be a list.")

    norm_files: list[dict[str, str]] = []
    for i, f in enumerate(files):
        if not isinstance(f, dict):
            raise AIJSONError(f"files[{i}] must be an object.")
        for k in ("path", "content", "language"):
            if k not in f:
                raise AIJSONError(f"files[{i}] missing '{k}'")

        path = f.get("path")
        content = f.get("content")
        language = f.get("language")

        if not isinstance(path, str) or not path.strip():
            raise AIJSONError(f"files[{i}].path must be a non-empty string.")
        if not isinstance(content, str):
            # soms komt content null/int terug -> maak dat expliciet fout
            raise AIJSONError(f"files[{i}].content must be a string.")
        if not isinstance(language, str) or not language.strip():
            raise AIJSONError(f"files[{i}].language must be a non-empty string.")

        # optional: voorkom directory traversal / rare paths
        if path.startswith("/") or ".." in path.replace("\\", "/").split("/"):
            raise AIJSONError(f"files[{i}].path is unsafe: '{path}'")

        norm_files.append({"path": path, "content": content, "language": language})

    return {"name": name.strip(), "description": desc, "files": norm_files}


async def repair_generated_project(client_ai, original_result: dict, errors: list[str]) -> dict:
    response = client_ai.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {"role": "system", "content": REPAIR_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "The following project failed validation:\n\n"
                    f"Errors:\n{json.dumps(errors, indent=2)}\n\n"
                    "Original project:\n"
                    f"{json.dumps(original_result, indent=2)}\n\n"
                    "Fix the project."
                ),
            },
        ],
        temperature=0.1,
    )

    content = (response.choices[0].message.content or "").strip()
    return _parse_ai_json(content)
