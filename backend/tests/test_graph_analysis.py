from app.graph_analysis import (
    build_dependency_graph,
    critical_files,
    detect_cycles,
    risk_level,
    transitive_dependents,
)


def test_dependency_graph():
    files = [
        "repo/auth.py",
        "repo/service.py",
        "repo/main.py",
    ]

    analysis = {
        "repo/auth.py": {
            "imports": []
        },
        "repo/service.py": {
            "imports": ["auth"]
        },
        "repo/main.py": {
            "imports": ["service"]
        },
    }

    graph = build_dependency_graph(
        files,
        analysis,
    )

    assert graph["repo/service.py"] == [
        "repo/auth.py"
    ]

    assert graph["repo/main.py"] == [
        "repo/service.py"
    ]


def test_transitive_impact():
    graph = {
        "auth.py": [],
        "service.py": ["auth.py"],
        "api.py": ["service.py"],
        "main.py": ["api.py"],
    }

    impacted = transitive_dependents(
        graph,
        "auth.py",
    )

    assert set(impacted) == {
        "service.py",
        "api.py",
        "main.py",
    }


def test_cycle_detection():
    graph = {
        "a.py": ["b.py"],
        "b.py": ["c.py"],
        "c.py": ["a.py"],
    }

    cycles = detect_cycles(graph)

    assert len(cycles) >= 1


def test_critical_files():
    graph = {
        "auth.py": [],
        "service.py": ["auth.py"],
        "api.py": ["auth.py"],
        "main.py": ["api.py"],
    }

    ranking = critical_files(graph)

    assert ranking[0]["file"] == "auth.py"
    assert ranking[0]["score"] > 0


def test_risk_levels():
    assert risk_level(0) == "LOW"
    assert risk_level(2) == "MEDIUM"
    assert risk_level(5) == "HIGH"
