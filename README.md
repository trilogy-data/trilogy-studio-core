# Trilogy Studio Core

A open-source, web-based IDE for exploring Trilogy, an experiment in streamlined analytic SQL. 

Try it here [here](https://trilogydata.dev/trilogy-studio-core/).

Supports
- DuckDB
- BigQuery
- Snowflake

Read more about Trilogy [here](https://trilogydata.dev/).

### Rich Query Editing
<p align="center">
<img src="https://github.com/user-attachments/assets/2eee9a88-be64-437b-bd86-954ab0c1d7b3" width="736" height="856" alt="Editor View">
</p>

### Flexible Visualization

<p align="center">
<img src="https://github.com/user-attachments/assets/699ad66a-9be3-4ab4-b236-ddc20046d9fd" width="736" height="856" alt="Dashboard View">
</p>

## This Repo

This repo contains the studio frontend and a minimal FastAPI language server that powers language features.

## Running Locally

Run main.py in pyserver. 

```baseh
npm run dev
```
To run frontend; check config in frontend to ensure it is resolving to your localhost.

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
