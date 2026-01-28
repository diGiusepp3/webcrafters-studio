# Webcrafters Studio - AI Code Generation Platform

🚀 **Generate complete, production-ready applications with AI**

Webcrafters Studio is a professional AI-powered code generation platform that lets you describe your application in plain language and receive complete, runnable code.

## ✨ Features

- **🤖 Autonomous AI Agent** - Real agent that plans, codes, tests, and iterates
- **🔒 Security Scanning** - Automatic vulnerability detection in generated code
- **📺 Live Code Preview** - Watch code being written in real-time
- **🛠️ Auto-Fix** - AI automatically fixes detected issues
- **📦 Full-Stack & More** - Generate any project type: web, mobile, CLI, API
- **⬇️ Production Export** - Download as ZIP with proper architecture

## 🛠️ Tech Stack

- **Frontend**: React 18 + Tailwind CSS + Shadcn UI
- **Backend**: FastAPI + SQLite (SQLAlchemy)
- **AI**: OpenAI GPT-4.1-mini
- **Auth**: JWT-based authentication

## 🚀 Quick Start (Development)

### Prerequisites
- Node.js 18+ & Yarn
- Python 3.10+
- OpenAI API Key

### 1. Clone & Install

```bash
# Clone the repository
git clone https://github.com/your-repo/webcrafters-studio.git
cd webcrafters-studio

# Install frontend dependencies
cd frontend
yarn install

# Install backend dependencies
cd ../backend
pip install -r requirements.txt
```

### 2. Configure Environment

**Backend** (`backend/.env`):
```env
# 🔑 REQUIRED: Your OpenAI API Key
OPENAI_API_KEY=sk-your-openai-api-key-here

# Optional: model routing by stage (defaults to gpt-4.1-mini)
# Planning / PRD (Reasoning agent)
OPENAI_PLAN_MODEL=gpt-5-mini
# Code generation (Code agent)
OPENAI_CODE_MODEL=gpt-4o
# Clarification + final review (override if you want)
# OPENAI_CLARIFY_MODEL=gpt-4.1-mini
# OPENAI_FINAL_MODEL=gpt-5-mini

# Security (change in production!)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# CORS (adjust for your domain in production)
CORS_ORIGINS=*
```

**Frontend** (`frontend/.env`):
```env
REACT_APP_BACKEND_URL=http://localhost:8000
```

### 3. Run the Application

```bash
# Terminal 1: Start backend
cd backend
uvicorn server:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Start frontend
cd frontend
yarn start
```

Visit `http://localhost:3000` 🎉

## 🏭 Production Deployment

### What to Change for Production

1. **Backend `.env`**:
   ```env
   # Your production OpenAI key
   OPENAI_API_KEY=sk-prod-your-production-key
   
   # Generate a strong secret: openssl rand -hex 32
   JWT_SECRET=your-production-secret-min-32-chars
   
   # Your actual domain
   CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
   ```

2. **Frontend `.env`**:
   ```env
   REACT_APP_BACKEND_URL=https://api.yourdomain.com
   ```

3. **Database** (optional - for scale):
   - Replace SQLite with PostgreSQL/MySQL
   - Update `DATABASE_URL` in `backend/.env`

### Docker Deployment

```dockerfile
# Dockerfile.backend
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY backend/ .
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
```

```dockerfile
# Dockerfile.frontend
FROM node:18-alpine AS builder
WORKDIR /app
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install
COPY frontend/ .
RUN yarn build

FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
```

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        root /var/www/frontend;
        try_files $uri /index.html;
    }
    
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 300s;
    }
}
```

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Get JWT token
- `GET /api/auth/me` - Get current user

### Code Generation
- `POST /api/generate` - Start generation job
- `GET /api/generate/status/{job_id}` - Poll job status
- `POST /api/generate/continue/{job_id}` - Answer clarify questions

### Projects
- `GET /api/projects` - List user projects
- `GET /api/projects/{id}` - Get project details
- `DELETE /api/projects/{id}` - Delete project
- `GET /api/projects/{id}/download` - Download as ZIP
- `POST /api/projects/{id}/preview` - Start live preview

## 🔐 Security Notes

1. **Never commit `.env` files** - They contain secrets
2. **Rotate JWT_SECRET** when deploying to production
3. **Use HTTPS** in production
4. **Rate limiting** is built-in for API endpoints
5. **Generated code** is automatically scanned for vulnerabilities

## 📁 Project Structure

```
webcrafters-studio/
├── backend/
│   ├── api/              # FastAPI routes
│   ├── core/             # Config, database
│   ├── models/           # SQLAlchemy models
│   ├── schemas/          # Pydantic schemas
│   ├── services/         # Business logic (AI, generation)
│   ├── validators/       # Code validation
│   └── server.py         # Main FastAPI app
├── frontend/
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── pages/        # Page components
│   │   ├── context/      # Auth context
│   │   └── api.js        # API client
│   └── package.json
└── README.md
```

## 💰 Monetization Options

This platform is designed to support:
- **Freemium**: X free generations/month, then paid
- **Credits**: Buy credits, spend per generation
- **Subscription**: Monthly/yearly plans with limits

Credits system is already built-in (see `backend/api/credits.py`).

## 🤝 Contributing

Pull requests welcome! Please follow the existing code style.

## 📄 License

MIT License - see LICENSE file

---

**Built with ❤️ by Webcrafters Studio**
