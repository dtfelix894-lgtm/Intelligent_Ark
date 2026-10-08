"""Compatibility entry point; always delegates to the isolated acceptance runner.

Run: python frontend/scripts/ui_release_check.py
Configuration and reports: PDRs/Delivery_Playbook.md.
Arbitrary ARK_UI_BASE_URL targets are intentionally no longer used.
"""
from pathlib import Path
import runpy

if __name__ == "__main__":
    runpy.run_path(
        str(Path(__file__).resolve().parents[2] / "scripts" / "verify_project.py"),
        run_name="__main__",
    )
