# Project Agent Instructions

## Project Purpose

This repository builds a mobile-first PWA for personal coffee bean storage, brew logging, source import, cloud sync, backup/export, and AI-assisted brewing recommendations.

Primary user environment:

- Android phone as the main usage device.
- Git + GitHub for version control and frontend deployment.
- Supabase for Auth, Postgres, Row Level Security, and Edge Functions.
- DeepSeek API for AI-assisted extraction and brewing recommendations.

## Current Design Source

Use the stable documentation index and the relevant canonical design before implementation:

- `docs/README.md`
- `docs/product-design.md`
- `docs/data-architecture.md`
- `docs/ai-recommendation.md`

When requirements conflict, update the relevant canonical design first, commit it, then update implementation plans.

## Implementation Principles

- Keep the first version focused on the approved scope.
- Do not add Bluetooth scale support, native mobile apps, WeChat mini program support, community features, or broad web crawling unless the design is revised first.
- Treat data safety as a core feature, not a later enhancement.
- Never store API keys in frontend code, browser storage, committed files, or GitHub Pages build artifacts.
- DeepSeek API calls must go through a server-side Supabase Edge Function.
- Supabase service role keys must only live in server-side environment variables.
- User data tables must include `user_id` and enforce Row Level Security.
- Source import results and AI outputs are drafts or suggestions until the user confirms them.

## Data And Backup Rules

- Cloud data is the source of truth for signed-in users.
- IndexedDB is a local cache and weak-network queue, not the only durable storage.
- Keep JSON export and CSV export working even when cloud sync exists.
- Default backups should be lightweight and exclude images.
- Complete backups may include compressed images only when the user explicitly chooses that option.

## Deployment Rules

- Frontend deployment target is GitHub Pages.
- Use GitHub Actions for frontend build and deployment.
- Configure Vite `base`, PWA `start_url`, and PWA `scope` for GitHub Pages subpath deployment.
- Prefer Hash Router or another GitHub Pages-compatible routing strategy to avoid refresh 404 issues.

## Development Workflow

- Make small, reviewable commits.
- Run tests and build checks before claiming completion.
- Preserve user changes; never reset or discard work unless explicitly asked.
- For major features, update the implementation plan before coding.
- For user-facing behavior changes, verify on a mobile-sized viewport when possible.

## Language

Communicate with the user in Chinese unless they ask otherwise.
Keep beginner-facing explanations concrete and step-by-step.
