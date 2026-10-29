# Codebase graph for Claude agents

Graphify is developer tooling. It does not add a page, runtime dependency or user-data collection to the website.

## Setup

From the repository root, install the separate tooling dependency:

```powershell
python -m pip install -r requirements-graphify.txt
```

The project includes the graphify skill in `.claude/skills/graphify/`, graph-first instructions in `CLAUDE.md`, and non-strict read/search hooks in `.claude/settings.json`. The `graphify` executable must be available on the Claude process's PATH. Restart Claude after installing if necessary. Hooks encourage graph lookup; they do not forbid source inspection.

## Generated graph

The initial graph covers 217 source/configuration and documentation files across both frontends and the backend. It contains 2,135 nodes, 5,874 relationships and 98 named communities. The approved corpus exceeds the skill's usual 200-file prompt threshold; this scope was explicitly selected by the project owner.

`.graphifyignore` preserves the selected scope: screenshots, generated presentations, public assets, backend data and copied agent-skill sources are excluded. CSS is not classified by this version of graphify, so styling is not fully represented. Six indexed code files yielded no symbols; see the report's extraction audit.

To rebuild semantically in Claude Code, invoke `/graphify . --update` and follow the installed skill.

Expected outputs:

- `graphify-out/graph.json`: nodes, relationships, communities and source references.
- `graphify-out/GRAPH_REPORT.md`: architecture summary and extraction audit.
- `graphify-out/graph.html`: interactive browser view.
- `graphify-out/extraction.json`: combined extraction before graph normalization, retaining the original relationship records.

## Using an existing graph

Run from the repository root:

```powershell
graphify query "How does the Watchtower score reach the frontend?" --budget 1500
graphify explain "compute_night_score"
graphify path "score_hour" "compute_night_score"
graphify affected "score_hour" --depth 2
```

Query/path results depend on indexed nodes and extracted relationships. An empty result is not proof that code or a relationship does not exist. Follow source references before editing, especially for inferred edges.

After code changes, `graphify update .` refreshes structural extraction. Documentation and image changes need `/graphify . --update` in the agent for semantic extraction. Use the same corpus exclusions on updates. Treat the graph as a navigational index; implementation remains the authority.

## Optional MCP access

The CLI already supports Claude Code access. For an MCP client, configure a stdio server using the Python interpreter where graphify was installed and an absolute graph path:

```json
{
  "mcpServers": {
    "pecathon-graph": {
      "command": "python",
      "args": ["-m", "graphify.serve", "D:/PROJECTS/Pecathon/graphify-out/graph.json"]
    }
  }
}
```

On another machine, adjust the graph path. If the client cannot resolve `python`, use that interpreter's absolute path. This example has not been registered in any global Claude configuration.

## Trust and scope

Keep environment secrets, databases, uploads, provider recordings and caches outside the corpus. Include relevant source and architecture documentation. Exclude generated presentations and QA screenshots unless their visual content is the purpose of a separate graph.

Edges tagged EXTRACTED come from explicit evidence; INFERRED and AMBIGUOUS edges need judgment. AST extraction maps structure, not every runtime behavior. Historical design docs can describe planned or superseded behavior: verify claims against current source.
