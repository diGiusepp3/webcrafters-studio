import json

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

    content = response.choices[0].message.content.strip()
    if content.startswith("```"):
        content = "\n".join(content.split("\n")[1:-1])

    return json.loads(content)
