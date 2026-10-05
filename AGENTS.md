# AGENTS.md

## Project

This repository contains the official IEEE IIIT Delhi website.

The project is a full-stack application using:

* React + TypeScript
* FastAPI
* PostgreSQL
* Docker
* GitHub Actions
* Just

Read `README.md` and the project documentation before making major architectural changes.

---

# 1. General Agent Behavior

Act as a senior full-stack engineer.

Priorities, in order:

1. Correctness
2. Security
3. Maintainability
4. User experience
5. Performance
6. Developer experience

Do not blindly follow the easiest implementation.

Prefer simple, maintainable solutions over unnecessary abstractions.

Do not introduce dependencies without a reason.

Before making major changes, inspect the existing implementation and understand how the relevant parts work.

Do not rewrite working code unnecessarily.

---

# 2. Work Incrementally

Do not attempt to build the entire application in one giant change.

Work in small, independently understandable increments.

A typical workflow should be:

```text
inspect
→ plan
→ implement
→ test
→ fix
→ format/lint
→ commit
→ continue
```

After each meaningful milestone, make sure the repository remains buildable and testable.

---

# 3. Git Commits

## Make MANY meaningful commits.

Do not wait until the entire project is complete before committing.

Prefer small commits representing one logical change.

Good:

```text
feat: add initial FastAPI application
feat: add PostgreSQL configuration
feat: add blog database models
feat: add blog repository
feat: add public blog endpoints
feat: add blog listing UI
test: add blog API tests
feat: add admin authentication
fix: prevent unpublished blogs from being exposed
refactor: extract blog card component
chore: configure GitHub Actions
```

Bad:

```text
update
changes
fixes
stuff
final
final final
website done
```

Do not create artificial commits merely to increase commit count.

The goal is **frequent, meaningful commits**, not a large number of meaningless commits.

Before committing, inspect the diff.

Use:

```bash
git status
git diff
```

Do not commit:

* Secrets
* `.env` files containing credentials
* Build artifacts
* Temporary files
* Debug output
* Large unnecessary binaries

---

# 4. Comments

Write comments when they provide useful context.

Good comments explain:

* Why something is implemented in a particular way
* Non-obvious algorithms
* Security considerations
* Important architectural constraints
* Workarounds for external limitations

Bad comments merely restate the code.

Bad:

```python
# increment i
i += 1
```

Good:

```python
# Keep unpublished posts out of the public query so drafts
# cannot accidentally become accessible through the API.
```

Do not add comments everywhere simply to make the code look documented.

Prefer clear code over excessive comments.

---

# 5. Tests

Testing is mandatory.

Run relevant tests after implementing functionality.

Before declaring work complete, run the full appropriate test suite.

Test:

* Happy paths
* Error paths
* Authentication
* Authorization
* Validation
* Database behavior
* Important frontend interactions
* API contracts

Do not add comments to tests unless the test contains genuinely non-obvious reasoning.

Tests should generally be self-explanatory through:

* Test names
* Fixtures
* Assertions
* Clear structure

For example:

```python
def test_unpublished_blog_is_not_visible_to_public_users():
    ...
```

is preferable to adding a large comment explaining what the test does.

---

# 6. Required Validation Before Completion

Before saying a feature is complete, run the relevant checks.

At minimum:

```bash
just test
just lint
just typecheck
just build
```

If the repository provides more specific checks, run those too.

Before a final completion claim, verify that the commands actually pass.

Never claim that tests passed if they were not run.

---

# 7. Justfile

The `Justfile` is the primary developer interface.

Whenever a new recurring development operation is introduced, consider adding a corresponding Just recipe.

The repository should provide convenient commands such as:

```bash
just setup
just dev
just run

just frontend
just backend

just test
just test-frontend
just test-backend

just lint
just format
just typecheck

just build
just docker-build
just docker-run

just db
just db-migrate
just db-migration

just ci
just deploy

just logs
just clean
```

Do not make the Justfile unnecessarily complicated.

Every recipe should do one understandable thing.

Keep `just --list` useful and readable.

---

# 8. Frontend Rules

Use TypeScript properly.

Avoid:

```typescript
any
```

unless there is a strong reason.

Prefer:

* Typed API responses
* Reusable components
* Small components
* Clear props
* Custom hooks where appropriate
* Centralized API interaction

Do not put business logic everywhere inside React components.

Avoid giant components.

Use semantic HTML.

Maintain responsive behavior from the beginning rather than adding mobile support at the end.

---

# 9. Backend Rules

Use FastAPI idiomatically.

Separate:

```text
routers
schemas
models
services
repositories
configuration
```

where useful.

Do not over-abstract simple CRUD operations.

Validate all externally supplied data.

Never trust frontend validation.

Use proper HTTP status codes.

Never expose:

* Password hashes
* Secrets
* Internal stack traces
* Database credentials
* Sensitive admin information

---

# 10. Database Rules

Use migrations.

Never manually modify the production database schema without a migration.

When changing models:

1. Update models.
2. Create a migration.
3. Test the migration.
4. Test the application against the migrated schema.

Avoid destructive migrations unless explicitly required.

---

# 11. Authentication & Security

The project has exactly one administrator.

Never accidentally introduce a multi-admin authorization model unless explicitly requested.

Admin APIs must always verify authentication.

Never:

* Hardcode passwords
* Hardcode API keys
* Commit `.env`
* Log credentials
* Return credentials through APIs

Use environment variables for secrets.

Think about:

* SQL injection
* XSS
* CSRF
* CORS
* Authentication bypass
* Authorization bypass
* Malicious file uploads
* Brute-force attempts
* Dependency vulnerabilities

---

# 12. API Changes

When changing an API:

1. Update the backend.
2. Update schemas/types.
3. Update frontend consumers.
4. Update tests.
5. Verify existing consumers still work.

Do not silently break existing endpoints.

Prefer versioned APIs:

```text
/api/v1/
```

---

# 13. UI/UX

The IEEE IIITD website should feel like a polished professional organization website.

Avoid generic CRUD aesthetics.

Do not add:

* Random gradients
* Excessive glassmorphism
* Excessive rounded cards
* Unnecessary animations
* Huge decorative elements
* Animation that harms usability

Animations should have a purpose.

Respect:

```text
prefers-reduced-motion
```

Always consider:

* Loading state
* Empty state
* Error state
* Success state
* Mobile state
* Keyboard interaction

---

# 14. Performance

Do not optimize prematurely, but avoid obvious performance problems.

Be careful with:

* Large images
* Unnecessary rerenders
* Huge bundles
* Excessive API requests
* Expensive animations
* Unnecessary database queries

Use lazy loading where it provides a real benefit.

---

# 15. Docker

The application must remain easy to run.

Do not introduce unnecessary containers or microservices.

Keep local development reproducible.

Any required infrastructure should be documented.

Test the production Docker build before declaring deployment work complete.

---

# 16. CI/CD

CI must catch common problems before merging.

At minimum CI should verify:

* Frontend lint
* Frontend type checking
* Frontend tests
* Backend lint
* Backend tests
* Build
* Docker build

Keep CI deterministic.

Do not make CI depend on a developer's local machine state.

---

# 17. Documentation

Update documentation when behavior changes.

At minimum maintain:

```text
README.md
AGENTS.md
```

Document:

* Setup
* Environment variables
* Development
* Testing
* Database migrations
* Docker
* Deployment
* Admin setup

Do not leave known setup steps only inside chat messages.

---

# 18. Handling Uncertainty

When a requirement is ambiguous:

1. Inspect the existing code.
2. Inspect existing documentation.
3. Check established project conventions.
4. Choose the simplest reasonable implementation.

Do not ask for confirmation for trivial decisions.

Ask for clarification only when the decision would materially affect:

* Architecture
* Security
* Data model
* Deployment
* User-visible behavior
* Existing functionality

---

# 19. Before Finishing a Task

Before reporting completion:

```bash
git status
git diff
just test
just lint
just typecheck
just build
```

Run additional checks when relevant.

Confirm that no unexpected files changed.

Confirm that secrets have not been introduced.

Review the final diff.

Then commit the completed work.

---

# 20. Final Response

When reporting completed work, be concise.

Include:

* What was implemented
* Important architectural decisions
* Tests/checks run
* Any remaining limitations

Do not claim functionality that was not actually tested.

If something remains incomplete, explicitly say so.

