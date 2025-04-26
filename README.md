# Trilogy Studio Core

A publically available, minimal IDE for exploring Trilogy, an experiment in streamlined analytic SQL. 

Try a hosted version [here](https://trilogydata.dev/trilogy-studio-core/).

Read more about Trilogy [here](https://trilogydata.dev/).

Makes experimenting with Trilogy simple.
- rich semantic layer
- streamlined reuse, sharing, and composition
- visualization 
- llm integration [alpha]
- scheduling [WIP]

![alt text](./readme.png)

Open source, MIT licensed.

## This Repo

This repo contains a component library for the studio frontend and a minimal FastAPI backend service to support it.

## Running Locally

Run main.py in pyserver. 

NPM run dev to run frontend; check config in frontend to ensure it is resolving to your localhost pyserver.


### Inspiration
There are lots of good IDEs out here. Trilogy Studio is probably only right if you want to use Trilogy. Takes inspiration from:

- Dbeaver
- SQL Server Management Studio
- BQ Cloud Console
- [Beekeeper Studio](https://www.beekeeperstudio.io/)
- [QuackDB](https://github.com/mattf96s/QuackDB)
- [SQL Workbench](https://sql-workbench.com/)

### Tech Stack Acknowledgments

Could not exist without the following:

Frontend
- Vue
- Vega/Altair
- Tabulator

Backend
- Lark