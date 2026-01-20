# FILE: backend/services/screenshot_service.py
import asyncio
from pathlib import Path
from typing import Any, Dict, List, Optional

from playwright.async_api import async_playwright, Page


def _rel(preview_dir: Path, p: Path) -> str:
    try:
        return str(p.relative_to(preview_dir)).replace("\\", "/")
    except Exception:
        return str(p).replace("\\", "/")


async def _capture_once(
        page: Page,
        url: str,
        preview_dir: Path,
        name: str,
        viewport: Dict[str, int],
        user_agent: Optional[str] = None,
) -> Dict[str, Any]:
    console: List[Dict[str, Any]] = []
    page_errors: List[str] = []
    request_failed: List[Dict[str, Any]] = []

    def on_console(msg):
        try:
            console.append(
                {
                    "type": msg.type,
                    "text": msg.text,
                    "location": getattr(msg, "location", None),
                }
            )
        except Exception:
            pass

    def on_page_error(err):
        try:
            page_errors.append(str(err))
        except Exception:
            pass

    def on_request_failed(req):
        try:
            failure = req.failure
            request_failed.append(
                {
                    "url": req.url,
                    "method": req.method,
                    "resource_type": req.resource_type,
                    "error_text": (failure.error_text if failure else None),
                }
            )
        except Exception:
            pass

    page.on("console", on_console)
    page.on("pageerror", on_page_error)
    page.on("requestfailed", on_request_failed)

    await page.set_viewport_size(viewport)
    if user_agent:
        # must be set on context normally; keep as best-effort
        pass

    # Go + wait
    await page.goto(url, wait_until="domcontentloaded", timeout=60_000)

    # Try to wait for "load" + some idle time; do not hard-fail
    try:
        await page.wait_for_load_state("networkidle", timeout=20_000)
    except Exception:
        try:
            await page.wait_for_load_state("load", timeout=10_000)
        except Exception:
            pass

    # Give React a moment to render (especially after hydration)
    await asyncio.sleep(1.0)

    shots_dir = preview_dir / "screenshots"
    shots_dir.mkdir(parents=True, exist_ok=True)
    out_path = shots_dir / f"{name}.png"
    await page.screenshot(path=str(out_path), full_page=True)

    return {
        "screenshot": _rel(preview_dir, out_path),
        "console": console[-200:],  # cap
        "page_errors": page_errors[-50:],  # cap
        "request_failed": request_failed[-100:],  # cap
    }


async def generate_screenshots(url: str, preview_dir: Path) -> Dict[str, Any]:
    """
    Returns:
      {
        "desktop": "screenshots/desktop.png",
        "mobile": "screenshots/mobile.png",
        "console": [...],
        "page_errors": [...],
        "request_failed": [...]
      }
    """
    preview_dir = Path(preview_dir)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        )

        # Desktop context
        desktop_ctx = await browser.new_context(
            viewport={"width": 1280, "height": 720},
            device_scale_factor=1,
        )
        desktop_page = await desktop_ctx.new_page()

        # Mobile context (simple)
        mobile_ctx = await browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
        )
        mobile_page = await mobile_ctx.new_page()

        try:
            d = await _capture_once(
                desktop_page,
                url,
                preview_dir,
                "desktop",
                viewport={"width": 1280, "height": 720},
            )
            m = await _capture_once(
                mobile_page,
                url,
                preview_dir,
                "mobile",
                viewport={"width": 390, "height": 844},
            )

            # merge logs (dedupe a bit)
            console = (d.get("console") or []) + (m.get("console") or [])
            page_errors = (d.get("page_errors") or []) + (m.get("page_errors") or [])
            request_failed = (d.get("request_failed") or []) + (m.get("request_failed") or [])

            return {
                "desktop": d.get("screenshot"),
                "mobile": m.get("screenshot"),
                "console": console[-300:],
                "page_errors": page_errors[-100:],
                "request_failed": request_failed[-200:],
            }
        finally:
            try:
                await desktop_ctx.close()
            except Exception:
                pass
            try:
                await mobile_ctx.close()
            except Exception:
                pass
            try:
                await browser.close()
            except Exception:
                pass
