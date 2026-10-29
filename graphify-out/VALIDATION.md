# Graph validation

Built on 30 October 2026 from the project owner's approved source-and-docs scope.

- 217 input files: 199 code/configuration files and 18 documents.
- 2,135 graph nodes, 5,874 edges and 98 named communities.
- JSON checked: all edge endpoints exist; every edge has confidence_score; all EXTRACTED edges score 1.0.
- HTML checked for embedded score nodes and named communities. No browser rendering check was performed.
- CLI query for `compute_night_score`, path from `score_hour` to `compute_night_score`, and explain for `graph_mcp` completed successfully. The path uses file-containment relationships; it is not a demonstrated runtime call chain.
- MCP stdio server initialized through the Python MCP client, listed tools, returned graph_stats, and shut down successfully. No global MCP client configuration was changed.
- Benchmark: approximately 260,433 full-corpus tokens versus 1,614 average graph-query tokens across three generated questions (161.4x smaller context). This is an estimate of context size, not measured billing savings or retrieval accuracy.
- Semantic extraction token usage was not exposed by the agent tool. Zero counters in cost.json are explicitly marked unmetered.
- Six source inputs had no extracted symbols; CSS is unclassified and generated/public/data assets are excluded. See GRAPH_REPORT.md for limitations.

No application source was changed for this graph build. Backend tests in the preceding preparation step passed: 39 tests. They were not rerun for the graph-only continuation.
