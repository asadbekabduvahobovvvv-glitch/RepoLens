from __future__ import annotations

import stat
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def _zip_bytes(entries: list[tuple[str, bytes]]) -> bytes:
    buffer = BytesIO()

    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
        for name, content in entries:
            archive.writestr(name, content)

    return buffer.getvalue()


def test_rejects_non_zip_extension() -> None:
    response = client.post(
        "/upload",
        files={"file": ("repo.txt", b"not a zip", "text/plain")},
    )

    assert response.status_code == 400


def test_rejects_parent_directory_traversal() -> None:
    payload = _zip_bytes([("../evil.py", b"print('no')\n")])

    response = client.post(
        "/upload",
        files={"file": ("repo.zip", payload, "application/zip")},
    )

    assert response.status_code == 400
    assert "Unsafe ZIP member path" in response.json()["detail"]


def test_rejects_duplicate_member_paths() -> None:
    buffer = BytesIO()

    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("repo/main.py", b"x = 1\n")
        archive.writestr("repo/main.py", b"x = 2\n")

    response = client.post(
        "/upload",
        files={"file": ("repo.zip", buffer.getvalue(), "application/zip")},
    )

    assert response.status_code == 400
    assert "duplicate member path" in response.json()["detail"]


def test_rejects_symbolic_link_entries() -> None:
    buffer = BytesIO()

    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
        link = ZipInfo("repo/link.py")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        archive.writestr(link, "target.py")

    response = client.post(
        "/upload",
        files={"file": ("repo.zip", buffer.getvalue(), "application/zip")},
    )

    assert response.status_code == 400
    assert "Symbolic-link ZIP member" in response.json()["detail"]


def test_rejects_suspicious_python_compression_ratio() -> None:
    # Highly repetitive source remains below the per-file size limit while
    # compressing enough to trigger the anti-ZIP-bomb ratio check.
    source = (b"# repeated security test line\n" * 30_000)
    payload = _zip_bytes([("repo/bomb.py", source)])

    response = client.post(
        "/upload",
        files={"file": ("repo.zip", payload, "application/zip")},
    )

    assert response.status_code == 413
    assert "compression ratio" in response.json()["detail"].lower()
