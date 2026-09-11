def build_dependency_graph(source_files, python_analysis):
    graph = {file: [] for file in source_files}

    for source_file, analysis in python_analysis.items():
        imports = analysis.get("imports", [])

        for imported in imports:
            module = imported.lstrip(".").split(".")[0]

            if not module:
                continue

            for target_file in source_files:
                if target_file == source_file:
                    continue

                filename = target_file.split("/")[-1]
                stem = filename.rsplit(".", 1)[0]

                if stem == module:
                    if target_file not in graph[source_file]:
                        graph[source_file].append(target_file)

    return graph


def reverse_graph(graph):
    reversed_graph = {node: [] for node in graph}

    for source, targets in graph.items():
        for target in targets:
            reversed_graph.setdefault(target, [])

            if source not in reversed_graph[target]:
                reversed_graph[target].append(source)

    return reversed_graph


def transitive_dependents(graph, target):
    reversed_graph = reverse_graph(graph)

    visited = set()
    stack = list(reversed_graph.get(target, []))

    while stack:
        current = stack.pop()

        if current in visited:
            continue

        visited.add(current)

        for dependent in reversed_graph.get(current, []):
            if dependent not in visited:
                stack.append(dependent)

    return sorted(visited)


def detect_cycles(graph):
    cycles = []
    visited = set()
    active = set()
    path = []

    def dfs(node):
        visited.add(node)
        active.add(node)
        path.append(node)

        for neighbor in graph.get(node, []):
            if neighbor not in visited:
                dfs(neighbor)

            elif neighbor in active:
                start = path.index(neighbor)
                cycle = path[start:] + [neighbor]

                normalized = tuple(cycle)

                if normalized not in {
                    tuple(item) for item in cycles
                }:
                    cycles.append(cycle)

        path.pop()
        active.remove(node)

    for node in graph:
        if node not in visited:
            dfs(node)

    return cycles


def critical_files(graph):
    reversed_graph = reverse_graph(graph)
    ranking = []

    for file in graph:
        direct_dependents = len(
            reversed_graph.get(file, [])
        )

        total_impact = len(
            transitive_dependents(graph, file)
        )

        score = (
            direct_dependents * 3
            + total_impact
        )

        ranking.append({
            "file": file,
            "score": score,
            "direct_dependents": direct_dependents,
            "total_impact": total_impact,
        })

    return sorted(
        ranking,
        key=lambda item: item["score"],
        reverse=True,
    )


def risk_level(impact_count):
    if impact_count >= 5:
        return "HIGH"

    if impact_count >= 2:
        return "MEDIUM"

    return "LOW"
