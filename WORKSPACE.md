---
apiVersion: warp/v1alpha1
kind: Workspace
metadata:
  name: saturn
spec:
  projects: [.]
  defaultProvider: ollama
  defaultAgent: ""
  plugins: []
  policies:
    tools:
      include:
        - activate_skill
        - ask_question
        - bash
        - download
        - edit
        - fetch
        - glob
        - grep
        - invoke_agent
        - ls
        - lsp_diagnostics
        - lsp_inspect
        - lsp_restart
        - lsp_symbols
        - mcp_list_resources
        - mcp_read_resources
        - multi_edit
        - remove
        - schedule
        - tasks
        - todos
        - view
        - web_fetch
        - web_search
        - write
---
