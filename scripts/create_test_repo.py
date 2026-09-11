from pathlib import Path
from shutil import rmtree
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]

REPO_DIR = ROOT / "test_repo"
ZIP_PATH = ROOT / "test_repo.zip"


AUTH_PY = """from datetime import datetime

class AuthService:
    pass

def login(username: str) -> bool:
    return bool(username)
"""


MAIN_PY = """from src.auth import login

async def startup():
    return login("demo")
"""


def main() -> None:
    if REPO_DIR.exists():
        rmtree(REPO_DIR)

    if ZIP_PATH.exists():
        ZIP_PATH.unlink()

    (REPO_DIR / "src").mkdir(parents=True)

    (REPO_DIR / "src" / "auth.py").write_text(
        AUTH_PY,
        encoding="utf-8",
    )

    (REPO_DIR / "main.py").write_text(
        MAIN_PY,
        encoding="utf-8",
    )

    with ZipFile(
        ZIP_PATH,
        "w",
        compression=ZIP_DEFLATED,
    ) as archive:

        archive.writestr("test_repo/", "")
        archive.writestr("test_repo/src/", "")

        archive.write(
            REPO_DIR / "src" / "auth.py",
            "test_repo/src/auth.py",
        )

        archive.write(
            REPO_DIR / "main.py",
            "test_repo/main.py",
        )

    print(f"Created: {ZIP_PATH}")


if __name__ == "__main__":
    main()
