from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def make_zip(entries):
    buffer = BytesIO()

    with ZipFile(
        buffer,
        "w",
        compression=ZIP_DEFLATED,
    ) as archive:
        for name, content in entries.items():
            archive.writestr(name, content)

    return buffer.getvalue()


def upload_zip(payload, filename="repo.zip"):
    return client.post(
        "/upload",
        files={
            "file": (
                filename,
                payload,
                "application/zip",
            )
        },
    )


def test_health():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_normal_repository():
    payload = make_zip(
        {
            "repo/": "",
            "repo/auth.py": (
                "import os\n"
                "\n"
                "class AuthService:\n"
                "    pass\n"
                "\n"
                "def login():\n"
                "    return True\n"
            ),
            "repo/main.py": (
                "from auth import login\n"
                "\n"
                "async def startup():\n"
                "    return login()\n"
            ),
        }
    )

    response = upload_zip(payload)

    assert response.status_code == 200

    data = response.json()

    assert data["source_file_count"] == 2
    assert "repo/auth.py" in data["source_files"]
    assert "repo/main.py" in data["source_files"]

    auth = data["python_analysis"]["repo/auth.py"]

    assert "login" in auth["functions"]
    assert "AuthService" in auth["classes"]
    assert "os" in auth["imports"]


def test_invalid_zip():
    response = upload_zip(
        b"this is not a real zip"
    )

    assert response.status_code == 400


def test_non_zip_extension():
    response = client.post(
        "/upload",
        files={
            "file": (
                "repo.txt",
                b"hello",
                "text/plain",
            )
        },
    )

    assert response.status_code == 400


def test_path_traversal_blocked():
    payload = make_zip(
        {
            "../evil.py": (
                "def attack():\n"
                "    pass\n"
            )
        }
    )

    response = upload_zip(payload)

    assert response.status_code == 400


def test_skip_node_modules():
    payload = make_zip(
        {
            "repo/app.py": (
                "def visible():\n"
                "    pass\n"
            ),
            "repo/node_modules/package/index.js": (
                "console.log('ignored')"
            ),
        }
    )

    response = upload_zip(payload)

    assert response.status_code == 200

    files = response.json()["files"]

    assert "repo/app.py" in files

    assert all(
        "node_modules" not in item
        for item in files
    )


def test_syntax_error_does_not_crash():
    payload = make_zip(
        {
            "repo/broken.py": (
                "def broken(:\n"
                "    pass\n"
            )
        }
    )

    response = upload_zip(payload)

    assert response.status_code == 200

    result = response.json()["python_analysis"][
        "repo/broken.py"
    ]

    assert result["parse_error"] is True


def test_async_function_detection():
    payload = make_zip(
        {
            "repo/service.py": (
                "import json\n"
                "from pathlib import Path\n"
                "\n"
                "async def run():\n"
                "    return Path.cwd()\n"
            )
        }
    )

    response = upload_zip(payload)

    assert response.status_code == 200

    result = response.json()["python_analysis"][
        "repo/service.py"
    ]

    assert "run" in result["functions"]
    assert "json" in result["imports"]
    assert "pathlib.Path" in result["imports"]
