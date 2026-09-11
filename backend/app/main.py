from __future__ import annotations

import ast
import os
import stat
import time
import tokenize
from io import BytesIO
from pathlib import PurePosixPath
from typing import Annotated, Any
from zipfile import BadZipFile, ZipFile, ZipInfo

from fastapi import FastAPI, File, HTTPException, UploadFile, status


# ---------------------------------------------------------------------------
# Configuration helpers
# ---------------------------------------------------------------------------

def _positive_int_env(name: str, default: int) -> int:
    """
    Read a positive integer from an environment variable.

    Example:
        REPOLENS_MAX_UPLOAD_BYTES=26214400
    """
    raw = os.getenv(name)

    if raw is None:
        return default

    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer") from exc

    if value <= 0:
        raise RuntimeError(f"{name} must be > 0")

    return value


def _positive_float_env(name: str, default: float) -> float:
    """
    Read a positive floating-point number from an environment variable.
    """
    raw = os.getenv(name)

    if raw is None:
        return default

    try:
        value = float(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a number") from exc

    if value <= 0:
        raise RuntimeError(f"{name} must be > 0")

    return value


# ---------------------------------------------------------------------------
# Resource limits
#
# These defaults are deliberately conservative starting points.
# Tune them based on profiling and expected repository sizes.
# ---------------------------------------------------------------------------

MAX_UPLOAD_BYTES = _positive_int_env(
    "REPOLENS_MAX_UPLOAD_BYTES",
    25 * 1024 * 1024,  # 25 MiB compressed upload
)

MAX_ZIP_MEMBERS = _positive_int_env(
    "REPOLENS_MAX_ZIP_MEMBERS",
    10_000,
)

MAX_TOTAL_UNCOMPRESSED_BYTES = _positive_int_env(
    "REPOLENS_MAX_TOTAL_UNCOMPRESSED_BYTES",
    100 * 1024 * 1024,  # 100 MiB retained archive content
)

MAX_PYTHON_FILE_BYTES = _positive_int_env(
    "REPOLENS_MAX_PYTHON_FILE_BYTES",
    2 * 1024 * 1024,  # 2 MiB per Python source file
)

MAX_COMPRESSION_RATIO = _positive_float_env(
    "REPOLENS_MAX_COMPRESSION_RATIO",
    200.0,
)

MAX_ANALYSIS_SECONDS = _positive_float_env(
    "REPOLENS_MAX_ANALYSIS_SECONDS",
    15.0,
)

UPLOAD_CHUNK_BYTES = 1024 * 1024  # 1 MiB
MAX_MEMBER_NAME_LENGTH = 4096


# ---------------------------------------------------------------------------
# Repository filtering
# ---------------------------------------------------------------------------

SKIP_FOLDERS = {
    ".git",
    ".venv",
    "venv",
    "node_modules",
    "__pycache__",
    "dist",
    "build",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    "__MACOSX",
}


SOURCE_EXTENSIONS = {
    ".py",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".java",
    ".go",
    ".rs",
    ".c",
    ".cpp",
    ".cs",
    ".php",
    ".rb",
}


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="RepoLens API",
    version="1.0.0",
    description=(
        "Upload a ZIP repository, build its file tree, "
        "and analyze Python source."
    ),
)


# ---------------------------------------------------------------------------
# Repository tree helpers
# ---------------------------------------------------------------------------

def build_tree(paths: list[str]) -> dict[str, Any]:
    """
    Convert flat ZIP member paths into a nested dictionary tree.

    Example:
        [
            "repo/src/auth.py",
            "repo/main.py",
        ]

    becomes:
        {
            "repo": {
                "src": {
                    "auth.py": {}
                },
                "main.py": {}
            }
        }
    """
    root: dict[str, Any] = {}

    for path in paths:
        current = root

        for part in PurePosixPath(path).parts:
            current = current.setdefault(part, {})

    return root


def is_source_file(path: str) -> bool:
    """
    Return True when a file extension is one RepoLens recognizes
    as source code.
    """
    return PurePosixPath(path).suffix.lower() in SOURCE_EXTENSIONS


def _dedupe_preserve_order(values: list[str]) -> list[str]:
    """
    Remove duplicates without alphabetically reordering results.
    """
    return list(dict.fromkeys(values))


# ---------------------------------------------------------------------------
# Python AST analysis
# ---------------------------------------------------------------------------

def analyze_python_code(code: str) -> dict[str, Any]:
    """
    Parse Python source without executing it.

    Returns discovered:
      - functions, including async functions and methods
      - classes
      - imports

    Syntax errors are reported per-file rather than failing the whole upload.
    """
    try:
        parsed_code = ast.parse(code)
    except SyntaxError as exc:
        location = (
            f"line {exc.lineno}"
            if exc.lineno
            else "unknown line"
        )

        return {
            "functions": [],
            "classes": [],
            "imports": [],
            "parse_error": True,
            "error": f"{exc.msg} ({location})",
        }

    functions: list[str] = []
    classes: list[str] = []
    imports: list[str] = []

    for node in ast.walk(parsed_code):

        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.append(node.name)

        elif isinstance(node, ast.ClassDef):
            classes.append(node.name)

        elif isinstance(node, ast.Import):
            imports.extend(alias.name for alias in node.names)

        elif isinstance(node, ast.ImportFrom):
            # Preserve relative-import dots.
            #
            # Example:
            #   from .utils import helper
            #
            # becomes:
            #   .utils.helper
            prefix = "." * node.level + (node.module or "")

            for alias in node.names:
                if prefix:
                    separator = "" if prefix.endswith(".") else "."
                    imports.append(
                        f"{prefix}{separator}{alias.name}"
                    )
                else:
                    imports.append(alias.name)

    return {
        "functions": _dedupe_preserve_order(functions),
        "classes": _dedupe_preserve_order(classes),
        "imports": _dedupe_preserve_order(imports),
        "parse_error": False,
        "error": None,
    }


# ---------------------------------------------------------------------------
# ZIP security and validation helpers
# ---------------------------------------------------------------------------

def _validate_member_name(name: str) -> str:
    """
    Normalize and reject dangerous archive paths.

    RepoLens never extracts files to the filesystem, but validating names
    protects the API semantics and prevents future refactors from silently
    accepting traversal paths.
    """
    if not name:
        raise HTTPException(
            status_code=400,
            detail="ZIP contains an empty member name",
        )

    if "\x00" in name:
        raise HTTPException(
            status_code=400,
            detail="ZIP contains a member name with a NUL byte",
        )

    # ZIP convention uses '/', but malicious/non-standard archives might
    # contain backslashes. Normalize them before checking.
    normalized = name.replace("\\", "/")

    if len(normalized) > MAX_MEMBER_NAME_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="ZIP contains an excessively long member path",
        )

    path = PurePosixPath(normalized)
    parts = path.parts

    # Reject:
    #   /etc/passwd
    #   ../../secret
    #   repo/../secret
    #   C:/Windows/...
    if (
        path.is_absolute()
        or normalized.startswith("/")
        or ".." in parts
        or (parts and parts[0].endswith(":"))
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Unsafe ZIP member path: {name!r}",
        )

    return normalized


def _should_skip(path: str) -> bool:
    """
    Skip a member if ANY path component exactly matches SKIP_FOLDERS.

    This catches nested paths such as:
        repo/frontend/node_modules/...
        repo/subproject/.git/...
    """
    return any(
        part in SKIP_FOLDERS
        for part in PurePosixPath(path).parts
    )


def _compression_ratio(info: ZipInfo) -> float:
    """
    Compute uncompressed_size / compressed_size.

    max(..., 1) prevents division by zero for unusual archive metadata.
    """
    if info.file_size == 0:
        return 1.0

    return info.file_size / max(info.compress_size, 1)


def _is_symlink(info: ZipInfo) -> bool:
    """Return True for Unix-style symbolic-link ZIP entries."""
    if info.create_system != 3:
        return False

    mode = info.external_attr >> 16
    return stat.S_ISLNK(mode)


def _validate_member_metadata(info: ZipInfo, normalized: str) -> None:
    """Reject archive entry types RepoLens does not need to inspect."""
    # Traditional PKZIP encryption flag. RepoLens intentionally does not
    # accept password-protected content because it cannot be inspected
    # deterministically before analysis.
    if info.flag_bits & 0x1:
        raise HTTPException(
            status_code=400,
            detail=f"Encrypted ZIP member is not supported: {normalized}",
        )

    # RepoLens never extracts archives, but rejecting symlinks keeps archive
    # semantics simple and prevents a future extraction refactor from turning
    # a harmless metadata entry into a filesystem traversal primitive.
    if _is_symlink(info):
        raise HTTPException(
            status_code=400,
            detail=f"Symbolic-link ZIP member is not supported: {normalized}",
        )


async def _measure_upload(file: UploadFile) -> int:
    """
    Read the uploaded file in bounded chunks to determine its size.

    Important:
    This is an application-level validation after FastAPI has accepted
    multipart input. A reverse proxy/API gateway should enforce a hard
    request-body limit before the application for production deployments.
    """
    total = 0

    await file.seek(0)

    while True:
        chunk = await file.read(UPLOAD_CHUNK_BYTES)

        if not chunk:
            break

        total += len(chunk)

        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    f"ZIP upload exceeds the "
                    f"{MAX_UPLOAD_BYTES}-byte limit"
                ),
            )

    await file.seek(0)

    return total


def _inspect_archive(
    zip_file: ZipFile,
) -> tuple[list[tuple[ZipInfo, str]], int]:
    """
    Inspect archive metadata before reading source-file bodies.

    Returns:
        retained members
        number of skipped members
    """
    infos = zip_file.infolist()

    if len(infos) > MAX_ZIP_MEMBERS:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"ZIP contains more than "
                f"{MAX_ZIP_MEMBERS} members"
            ),
        )

    retained: list[tuple[ZipInfo, str]] = []
    seen_names: set[str] = set()

    skipped_items = 0
    total_uncompressed = 0

    for info in infos:
        normalized = _validate_member_name(info.filename)
        _validate_member_metadata(info, normalized)

        # Reject ambiguous duplicate paths.
        if normalized in seen_names:
            raise HTTPException(
                status_code=400,
                detail=(
                    "ZIP contains duplicate member path: "
                    f"{normalized!r}"
                ),
            )

        seen_names.add(normalized)

        # Ignore dependency/build/cache directories before analysis.
        if _should_skip(normalized):
            skipped_items += 1
            continue

        total_uncompressed += info.file_size

        if total_uncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    "ZIP retained content exceeds the configured "
                    f"{MAX_TOTAL_UNCOMPRESSED_BYTES}-byte "
                    "uncompressed limit"
                ),
            )

        # Only Python files are decompressed for analysis in this version.
        if (
            not info.is_dir()
            and normalized.lower().endswith(".py")
            and _compression_ratio(info) > MAX_COMPRESSION_RATIO
        ):
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    "Suspicious compression ratio for Python file: "
                    f"{normalized}"
                ),
            )

        retained.append((info, normalized))

    return retained, skipped_items


# ---------------------------------------------------------------------------
# Python source decoding and member analysis
# ---------------------------------------------------------------------------

def _decode_python_source(
    raw: bytes,
) -> tuple[str | None, str | None, str | None]:
    """
    Detect the encoding using Python's own source-code encoding rules.
    """
    try:
        encoding, _ = tokenize.detect_encoding(
            BytesIO(raw).readline
        )

        return raw.decode(encoding), encoding, None

    except (SyntaxError, UnicodeDecodeError, LookupError) as exc:
        return None, None, str(exc)


def _analyze_python_member(
    zip_file: ZipFile,
    info: ZipInfo,
) -> dict[str, Any]:
    """
    Safely read and analyze a single .py member.
    """
    if info.file_size > MAX_PYTHON_FILE_BYTES:
        return {
            "functions": [],
            "classes": [],
            "imports": [],
            "parse_error": True,
            "error": (
                f"File exceeds the "
                f"{MAX_PYTHON_FILE_BYTES}-byte "
                "Python analysis limit"
            ),
            "encoding": None,
            "size_bytes": info.file_size,
        }

    if _compression_ratio(info) > MAX_COMPRESSION_RATIO:
        return {
            "functions": [],
            "classes": [],
            "imports": [],
            "parse_error": True,
            "error": (
                "File exceeds the configured "
                "compression-ratio limit"
            ),
            "encoding": None,
            "size_bytes": info.file_size,
        }

    try:
        with zip_file.open(info, "r") as member:
            # The +1 lets us detect an unexpected limit overrun.
            raw = member.read(MAX_PYTHON_FILE_BYTES + 1)

    except (RuntimeError, NotImplementedError, OSError) as exc:
        return {
            "functions": [],
            "classes": [],
            "imports": [],
            "parse_error": True,
            "error": f"Could not read ZIP member: {exc}",
            "encoding": None,
            "size_bytes": info.file_size,
        }

    if len(raw) > MAX_PYTHON_FILE_BYTES:
        return {
            "functions": [],
            "classes": [],
            "imports": [],
            "parse_error": True,
            "error": (
                "Decompressed file exceeds the "
                f"{MAX_PYTHON_FILE_BYTES}-byte "
                "Python analysis limit"
            ),
            "encoding": None,
            "size_bytes": len(raw),
        }

    code, encoding, decode_error = _decode_python_source(raw)

    if code is None:
        return {
            "functions": [],
            "classes": [],
            "imports": [],
            "parse_error": True,
            "error": (
                "Could not decode Python source: "
                f"{decode_error}"
            ),
            "encoding": None,
            "size_bytes": len(raw),
        }

    result = analyze_python_code(code)

    result["encoding"] = encoding
    result["size_bytes"] = len(raw)

    return result


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def home() -> dict[str, str]:
    return {
        "message": "RepoLens is running",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
    }


@app.post("/upload")
async def upload_file(
    file: Annotated[
        UploadFile,
        File(description="Repository ZIP archive"),
    ],
) -> dict[str, Any]:
    """
    Accept one ZIP repository and return its structural analysis.
    """
    filename = file.filename or ""

    if not filename.lower().endswith(".zip"):
        await file.close()

        raise HTTPException(
            status_code=400,
            detail="Send only a .zip file",
        )

    started_at = time.monotonic()

    try:
        # Application-level compressed upload limit.
        upload_size = await _measure_upload(file)

        try:
            # Use UploadFile's underlying seekable spooled file directly.
            # Do NOT first copy the full archive into BytesIO.
            with ZipFile(file.file, mode="r") as zip_file:

                retained, skipped_items = _inspect_archive(
                    zip_file
                )

                filenames = [
                    name
                    for _, name in retained
                ]

                source_files = [
                    name
                    for info, name in retained
                    if not info.is_dir()
                    and is_source_file(name)
                ]

                python_analysis: dict[str, Any] = {}

                for info, name in retained:

                    if (
                        info.is_dir()
                        or not name.lower().endswith(".py")
                    ):
                        continue

                    # Soft request-level analysis budget.
                    #
                    # This checks between files. It cannot interrupt a
                    # single ast.parse() call, so hard CPU isolation belongs
                    # in a worker process when RepoLens scales.
                    if (
                        time.monotonic() - started_at
                        > MAX_ANALYSIS_SECONDS
                    ):
                        raise HTTPException(
                            status_code=503,
                            detail=(
                                "Repository analysis exceeded "
                                "the configured time budget"
                            ),
                        )

                    python_analysis[name] = (
                        _analyze_python_member(
                            zip_file,
                            info,
                        )
                    )

                tree = build_tree(filenames)

                from app.graph_analysis import (
                    build_dependency_graph,
                    critical_files,
                    detect_cycles,
                    risk_level,
                    transitive_dependents,
                )

                dependency_graph = build_dependency_graph(
                    source_files,
                    python_analysis,
                )

                critical_file_ranking = critical_files(
                    dependency_graph
                )

                circular_dependencies = detect_cycles(
                    dependency_graph
                )

                impact_analysis = {}

                for source_file in source_files:
                    affected_files = transitive_dependents(
                        dependency_graph,
                        source_file,
                    )

                    impact_analysis[source_file] = {
                        "affected_files": affected_files,
                        "impact_count": len(affected_files),
                        "risk_level": risk_level(len(affected_files)),
                    }


        except BadZipFile as exc:
            raise HTTPException(
                status_code=400,
                detail="Invalid ZIP file",
            ) from exc

        return {
            "filename": filename,
            "upload_size_bytes": upload_size,
            "total_items": len(filenames),
            "skipped_items": skipped_items,
            "source_file_count": len(source_files),
            "source_files": source_files,
            "python_analysis": python_analysis,
            "dependency_graph": dependency_graph,
            "critical_files": critical_file_ranking,
            "circular_dependencies": circular_dependencies,
            "impact_analysis": impact_analysis,
            "files": filenames,
            "tree": tree,
        }

    finally:
        await file.close()
