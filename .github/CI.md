# Optional GitHub Actions workflow

`ci-workflow.yml.example` contains the tested-project CI configuration. It is
stored as a template because the credential used for the initial repository
push does not have GitHub's `workflow` permission.

To enable Actions, use a credential authorized to write workflows and move the
file to `.github/workflows/ci.yml`, then commit and push. Until then, run the
checks documented in README locally; no hosted CI success is implied.
