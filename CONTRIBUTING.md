# Welcome to Trilogy Studio contributing guide

Thank you for investing your time in contributing to Trilogy!

In this guide you will get an overview of the contribution workflow from opening an issue, creating a PR, reviewing, and merging the PR.

## New contributor guide

To get an overview of the project, read the README.md file. Here are some resources to help you get started with open source contributions:

- [Set up Git](https://docs.github.com/en/get-started/git-basics/set-up-git)
- [Collaborating with pull requests](https://docs.github.com/en/github/collaborating-with-pull-requests)

## Getting started

To navigate our codebase with confidence, familiarize yourself with:
- Vue.js (for frontend development)
- Vega/Altair (for visualization)
- Tabulator (for data tables)
- Lark (for parsing in the backend)
- FastAPI (for the language server)

### Issues

#### Create a new issue

If you spot a problem with Trilogy Studio, search if an issue already exists. If a related issue doesn't exist, you can open a new issue using the issue form.

#### Solve an issue

Scan through our existing issues to find one that interests you. You can narrow down the search using labels as filters. As a general rule, we don't assign issues to anyone. If you find an issue to work on, you are welcome to open a PR with a fix.

### Make Changes

#### Make changes locally

1. Fork the repository.
   - Using GitHub Desktop:
     - [Getting started with GitHub Desktop](https://docs.github.com/en/desktop/installing-and-configuring-github-desktop/getting-started-with-github-desktop) will guide you through setting up Desktop.
     - Once Desktop is set up, you can use it to fork the repo!

   - Using the command line:
     - Fork the repo so that you can make your changes without affecting the original project until you're ready to merge them.

2. Set up the development environment:
   - Install or update to the required Node.js version
   - Run `npm install` in the root directory
   - Run `pip install -r requirements.txt` in the pyserver subfolder

3. Create a working branch and start with your changes!

### Commit your update

Commit the changes once you are happy with them. Use clear commit messages that explain the changes you've made.

### Pull Request

When you're finished with the changes, create a pull request, also known as a PR.
- Fill out the PR template to help reviewers understand your changes and the purpose of your pull request.
- Don't forget to link the PR to an issue if you are solving one.
- Enable the checkbox to allow maintainer edits so the branch can be updated for a merge.

Once you submit your PR, a contributor will review your proposal. We may ask questions or request additional information.
- We may ask for changes to be made before a PR can be merged, either using suggested changes or pull request comments. You can apply suggested changes directly through the UI. You can make any other changes in your fork, then commit them to your branch.
- As you update your PR and apply changes, mark each conversation as resolved.
- If you run into any merge issues, check out this [git tutorial](https://github.com/skills/resolve-merge-conflicts) to help you resolve merge conflicts and other issues.

### Your PR is merged!

Congratulations :tada::tada: The Trilogy team thanks you :sparkles:

Once your PR is merged, your contributions will be publicly visible on the [Trilogy Studio](https://trilogydata.dev/trilogy-studio-core/).

## Development Notes

### Frontend
The frontend is built with Vue and uses Vega/Altair for visualizations and Tabulator for data tables. When making changes to these components, be sure to test across different browsers and screen sizes. 

Unit tests are done in typescript.

Tests are run through playwright, and a new core feature should have an E2E test.

### Backend
The language server is built with FastAPI and lightly wraps [pytrilogy](github.com/trilogy-data/pytrilogy). New language features will typically need to start on that repo. 

### Testing
Run the test suite before submitting your PR:
```
npm run test
```

For the Python backend:
```
cd pyserver
pytest
```

