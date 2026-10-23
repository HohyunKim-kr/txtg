# Branch rules

## Structure
- `main`: the base branch, always ready to ship or share. Never commit to it directly.
- Development branches: create a new one from `main` for each piece of work.

## Workflow
1. Update `main`, then create the development branch on top of it.
2. Work and commit on the development branch, then merge through a PR (base: `main`).
3. Once merged, **delete** the development branch (local + remote). Branches are not reused; the next piece of work starts on a new branch.

## Branch names
- Format: `<type>/<task-name>`
- The task name is lowercase English with hyphens (kebab-case), short enough to tell what the work is.
  - e.g. `feat/login-page`, `fix/token-refresh`, `docs/branch-rules`
- No people's names, dates, or random strings (e.g. `emxe9`) in the name.
- One task per branch.

### Types
| Type | Use |
| --- | --- |
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code restructuring with no behavior change |
| `docs` | Writing or updating docs |
| `style` | Formatting and other changes that don't affect meaning |
| `test` | Adding or updating tests |
| `chore` | Build, config, dependencies, and other chores |

## Deleting
```sh
git branch -d <type>/<task-name>            # local
git push origin --delete <type>/<task-name>  # remote
```
