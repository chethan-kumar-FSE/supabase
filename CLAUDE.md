# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Code Style

Add comments only to complex or non-obvious logic. Do not comment straightforward code like state declarations, simple event handlers, or JSX structure.

## Commands

```bash
npm run dev       # Start dev server (Vite HMR)
npm run build     # Production build
npm run preview   # Preview production build
npm run lint      # Run ESLint
```

## Environment Setup

Create a `.env` file in the project root with your Supabase credentials:

```
VITE_APP_SUPABASE_URL=<your-supabase-project-url>
VITE_APP_SUPABASE_PUBLISHABLE_KEY=<your-supabase-anon-key>
```

## Architecture

This is a React 19 + Vite app integrating Supabase for auth and database.

**Auth flow** (`App.jsx`): On mount, retrieves the current Supabase session and subscribes to `onAuthStateChange`. Renders `<Auth>` when no session exists, `<Dash>` when authenticated.

**Supabase client** (`src/supbase-client.js`): Single shared client instance created with `createClient`, reading URL and anon key from Vite env vars (`import.meta.env`). Import as `import { supabase } from "./supbase-client"` (note the typo in the filename — `supbase` not `supabase`).

**Auth component** (`src/Auth.jsx`): Handles both sign-up and sign-in via `supabase.auth.signUp` / `supabase.auth.signInWithPassword`. Toggled by local `isSignup` state.

**Dashboard** (`src/Dash.jsx`): Todo list with:
- Initial and debounced search fetching from the `todo` table via `supabase.from("todo").select("*").ilike(...)` 
- Insert via `supabase.from("todo").insert(...).select()`
- Real-time updates via a Supabase channel subscribing to `postgres_changes` INSERT events on the `todo` table

## Supabase Schema

The app expects a `todo` table in the `public` schema with at minimum:
- `id` — primary key
- `title` — text column (searched with `ilike`)
