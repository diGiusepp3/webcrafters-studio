# Webcrafters - AI Code Generation Platform

## Original Problem Statement
Build an application similar to app.emergent.sh - a code generation platform that:
- Accepts natural language prompts
- Converts prompts into structured app specifications
- Generates file trees and source code using AI
- Outputs as downloadable ZIP files
- Requires user authentication to generate code
- Includes project history
- Dark theme with blue neon aesthetic

## Architecture

### Tech Stack
- **Frontend**: React + Tailwind CSS + Shadcn UI
- **Backend**: FastAPI + MongoDB
- **AI**: OpenAI GPT-4.1-mini via webcrafters-integrations library

### Key Components
1. **Authentication**: JWT-based auth with register/login
2. **Code Generator**: GPT-4.1-mini powered code generation
3. **Project Manager**: CRUD operations for generated projects
4. **File Preview**: Syntax-highlighted code viewer
5. **ZIP Download**: Server-side ZIP generation

## User Personas
1. **Developers**: Quick project scaffolding
2. **Non-technical founders**: MVP generation
3. **Students**: Learning code structure

## Core Requirements (Static)
- [x] User authentication (register/login)
- [x] Natural language prompt input
- [x] Project type selection (fullstack/frontend/backend/any)
- [x] AI-powered code generation
- [x] File tree visualization
- [x] Syntax-highlighted code preview
- [x] ZIP download functionality
- [x] Project history/dashboard
- [x] Dark theme with neon cyan accents

## What's Been Implemented (December 2024)

### Backend (/app/backend/server.py)
- User registration & login with JWT
- Code generation endpoint using GPT-4.1-mini
- Project CRUD (create, read, delete)
- ZIP file generation and download
- MongoDB integration for persistence

### Frontend Pages
- Landing page with hero, features, how-it-works sections
- Login/Register forms with validation
- Dashboard with project cards and empty state
- Generator with prompt input and project type selector
- Project view with file list and code preview

### Design System
- Fonts: Outfit (headings), Manrope (body), JetBrains Mono (code)
- Colors: Void black bg (#030712), Cyan accents (#06b6d4)
- Glassmorphism cards, neon glow effects

## P0/P1/P2 Features Remaining

### P0 (Must Have)
- All implemented ✅

### P1 (Should Have)
- [ ] Streaming response for long generations
- [ ] File tree view with folders (currently flat list)
- [ ] Edit/regenerate existing projects
- [ ] Real-time generation progress indicator

### P2 (Nice to Have)
- [ ] Project templates/presets
- [ ] Share generated projects
- [ ] Code diff between versions
- [ ] Multiple AI model options
- [ ] Export to GitHub

## Next Tasks
1. Add streaming for code generation to improve UX during long waits
2. Implement hierarchical file tree with folders
3. Add loading skeleton animations
4. Implement project duplication feature
5. Add rate limiting for API calls
