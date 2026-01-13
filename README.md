# README.md
# Webcrafters Studio — Setup

## Vereisten
- Node.js + npm (frontend)
- Python 3.10+ (backend)
- MySQL 8+

## Frontend env
`/.env` (root) bevat de URL’s naar de backend:
- REACT_APP_BACKEND_URL=https://studio.webcrafters.be
- REACT_APP_API_URL=https://studio.webcrafters.be/api

## Backend env
Maak `backend/.env` aan met:

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=studio
MYSQL_PASSWORD=CHANGE_ME
MYSQL_DB=webcrafters_studio
JWT_SECRET=CHANGE_ME
CORS_ORIGINS=*

## Database schema
Run het schema (voorbeeld):
- mysql -u root -p < db/schema.sql

## Backend run
- cd backend
- pip install -r requirements.txt
- uvicorn server:app --host 0.0.0.0 --port 8000 --reload

## Frontend run
- npm install
- npm start


# backend/requirements.txt
fastapi>=0.110
uvicorn[standard]>=0.27
python-dotenv>=1.0
SQLAlchemy>=2.0
asyncmy>=0.2.9
alembic>=1.13
bcrypt>=4.1
PyJWT>=2.8
pydantic>=2.6
starlette>=0.36
httpx>=0.27
openai>=1.0


# backend/.env  (NIEUW bestand)
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=studio
MYSQL_PASSWORD=CHANGE_ME
MYSQL_DB=webcrafters_studio
JWT_SECRET=CHANGE_ME
CORS_ORIGINS=*

```
    backend/
├── main.py
├── core/
│   ├── config.py
│   ├── database.py
│   ├── security.py
│   └── logging.py
├── models/
│   ├── base.py
│   ├── user.py
│   ├── project.py
│   ├── generation.py
│   └── project_file.py
├── schemas/
│   ├── auth.py
│   ├── project.py
│   ├── generation.py
│   └── common.py
├── services/
│   ├── ai_service.py
│   ├── preflight_service.py
│   ├── generation_service.py
│   └── patch_service.py
├── api/
│   ├── deps.py
│   ├── auth.py
│   ├── generate.py
│   └── projects.py
└── utils/
    ├── files.py
    └── text.py
```
