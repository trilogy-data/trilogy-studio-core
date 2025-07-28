# Trilogy Studio Core

A open-source, web-based IDE for exploring [Trilogy](https://github.com/trilogy-data/pytrilogy), an experiment in streamlined analytic SQL. 

Try it here [here](https://trilogydata.dev/trilogy-studio-core/).

Supports
- DuckDB
- BigQuery
- Snowflake

Read more about Trilogy [here](https://trilogydata.dev/).

### Rich Query Editing
<p align="center">
<img src="https://github.com/user-attachments/assets/2eee9a88-be64-437b-bd86-954ab0c1d7b3" width="515" height="559" alt="Editor View">
</p>

### Flexible Visualization

<p align="center">
<img src="https://github.com/user-attachments/assets/699ad66a-9be3-4ab4-b236-ddc20046d9fd" width="515" height="599" alt="Dashboard View">
</p>

## This Repo

This repo contains the studio frontend, a minimal FastAPI language server that powers language features, and an MCP server that can run queries.


## Run MCP Locally

### Claude

Trilogy Studio can be run as a local MCP server for Claude.

```bash
uv run mcp install pyserver/mcp.py
```

## Run Language Server

> [!TIP]
> Quick Setup: Run `npm install` in the root, followed by `pip install -r requirements.txt` in the pyserver subfolder. You can then use `npm run local` to start a local instance.

This will run the frontend with Vite as well as the backend language server.

You can confirm in settings that your local UI is resolving to localhost.

There will be a more polished local option in the future.

## Deploying As Service

You can build a production copy and serve as a static website. Github Pages is an easy hosting option for frontend and there is an existing actions pipeline to use as a model.

## Developing

Contributions welcome. See contributing guide for details.


### Inspiration
There are lots of good IDEs out here. Trilogy Studio is probably only right if you want to use Trilogy. Takes inspiration from:

- Dbeaver
- SQL Server Management Studio
- BQ Cloud Console
- [Beekeeper Studio](https://www.beekeeperstudio.io/)
- [QuackDB](https://github.com/mattf96s/QuackDB)
- [SQL Workbench](https://sql-workbench.com/)

### Tech Stack

Could not exist without the following:

Frontend
- Vue
- Vega/Altair
- Tabulator

Backend
- Lark


### LLM Benchmarking

`bash
 npx tsx scripts/benchmark-llm.ts  
 `