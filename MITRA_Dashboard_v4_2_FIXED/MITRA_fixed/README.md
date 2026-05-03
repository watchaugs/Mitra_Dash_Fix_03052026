# MITRA Dashboard — Deployment Guide

**Government School AR Platform · Master Control Backend**  
Version 2.0.0 · Node.js + PostgreSQL + Docker

---

## Architecture Overview

```
Browser (HTTPS)
      │
      ▼
  Nginx (80/443)          ← Reverse proxy + SSL termination
      │
      ▼
  Node.js / Express       ← API + serves dashboard HTML
      │
      ▼
  PostgreSQL 16           ← Primary database
      │
      ▼
  /uploads/               ← Unity packages + Ad media files
```

---

## Prerequisites

| Tool       | Version   | Purpose                    |
|------------|-----------|----------------------------|
| Node.js    | ≥ 18.x    | Runtime                    |
| npm        | ≥ 9.x     | Package manager            |
| PostgreSQL | ≥ 14      | Database                   |
| Docker     | ≥ 24      | Containerised deployment   |
| Docker Compose | ≥ 2   | Multi-service orchestration|

---

## Quick Start (Local Development)

### 1. Clone & install

```bash
git clone https://your-repo/mitra-dashboard.git
cd mitra-backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set DB_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET
nano .env
```

### 3. Create the PostgreSQL database

```bash
psql -U postgres -c "CREATE DATABASE mitra_dashboard;"
psql -U postgres -c "CREATE USER mitra_admin WITH PASSWORD 'your_password';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE mitra_dashboard TO mitra_admin;"
```

### 4. Run migrations & seed

```bash
npm run migrate    # Creates all tables and indexes
npm run seed       # Inserts default admin + sample data
```

### 5. Start the server

```bash
npm run dev        # Development (auto-reload)
npm start          # Production
```

Open: **http://localhost:3000**  
Login: `admin@mitra.gov.in` / `Mitra@Admin2026!`

---

## Docker Deployment (Recommended for Production)

### 1. Set secrets

```bash
cp .env.example .env
# Set strong values for:
#   DB_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET, ALLOWED_ORIGINS
```

### 2. Start all services

```bash
# Development stack (API + PostgreSQL only):
docker compose up -d

# Production stack (API + PostgreSQL + Nginx):
docker compose --profile production up -d
```

### 3. Run seed (first time only)

```bash
docker compose exec api npm run seed
```

### 4. Check health

```bash
curl http://localhost:3000/api/health
# → {"status":"ok","service":"MITRA Dashboard API","version":"2.0.0"}
```

---

## SSL / HTTPS Setup

Place SSL certificate files at:
```
ssl/cert.pem
ssl/key.pem
```

For **Let's Encrypt** (free, auto-renewable):
```bash
apt install certbot
certbot certonly --standalone -d mitra.gov.in
# Certs will be at /etc/letsencrypt/live/mitra.gov.in/
cp /etc/letsencrypt/live/mitra.gov.in/fullchain.pem ssl/cert.pem
cp /etc/letsencrypt/live/mitra.gov.in/privkey.pem   ssl/key.pem
```

Update `nginx.conf` → `server_name` with your domain, then:
```bash
docker compose --profile production restart nginx
```

---

## API Reference

### Authentication

| Method | Endpoint              | Description              | Auth Required |
|--------|-----------------------|--------------------------|---------------|
| POST   | `/api/auth/login`     | Login, returns JWT tokens | ✗             |
| POST   | `/api/auth/refresh`   | Refresh access token      | ✗             |
| POST   | `/api/auth/logout`    | Invalidate refresh token  | ✓             |
| GET    | `/api/auth/me`        | Get current user profile  | ✓             |

### Advertisement Management

| Method | Endpoint                         | Description                        |
|--------|----------------------------------|------------------------------------|
| GET    | `/api/ads`                       | List campaigns                     |
| POST   | `/api/ads`                       | Create campaign                    |
| GET    | `/api/ads/:id`                   | Get campaign                       |
| PUT    | `/api/ads/:id`                   | Update campaign                    |
| POST   | `/api/ads/:id/publish`           | Publish campaign                   |
| POST   | `/api/ads/:id/pause`             | Pause campaign                     |
| POST   | `/api/ads/upload`                | Upload media file (≤5MB)           |
| POST   | `/api/ads/impressions`           | Ingest impression from student app |
| GET    | `/api/ads/analytics/overview`    | Full analytics dashboard data      |
| GET    | `/api/ads/analytics/export`      | Export raw impressions (CSV/XLSX)  |
| GET    | `/api/ads/analytics/granular/export` | Export granular breakdown     |

**Analytics query params:**  
`?campaign_id=&state=&district=&class_grade=&subject=&language=&days=30`

### Analytics (Student App)

| Method | Endpoint                    | Description                        |
|--------|-----------------------------|------------------------------------|
| GET    | `/api/analytics/overview`   | Dashboard KPIs                     |
| GET    | `/api/analytics/replay`     | Replay & repeat engagement         |
| POST   | `/api/analytics/telemetry`  | Ingest session from student app    |
| GET    | `/api/analytics/export`     | Export telemetry (CSV/XLSX)        |

### User Management

| Method | Endpoint                       | Description           |
|--------|--------------------------------|-----------------------|
| GET    | `/api/users`                   | List users            |
| POST   | `/api/users`                   | Create user           |
| GET    | `/api/users/:id`               | Get user              |
| PUT    | `/api/users/:id`               | Update user/perms     |
| POST   | `/api/users/:id/reset-password`| Reset password        |

### Unity Assets

| Method | Endpoint                         | Description              |
|--------|----------------------------------|--------------------------|
| POST   | `/api/unity/upload`              | Upload asset file        |
| GET    | `/api/unity/assets`              | List assets              |
| PUT    | `/api/unity/assets/:id`          | Update targeting config  |
| POST   | `/api/unity/assets/:id/publish`  | Publish (master admin)   |
| POST   | `/api/unity/assets/:id/review`   | Submit for review        |

### Other

| Method | Endpoint                  | Description          |
|--------|---------------------------|----------------------|
| GET    | `/api/dashboard/summary`  | Dashboard KPI counts |
| GET    | `/api/curriculum`         | List nodes           |
| POST   | `/api/curriculum`         | Create node          |
| PUT    | `/api/curriculum/:id`     | Update node          |
| GET    | `/api/geofence`           | List geofences       |
| POST   | `/api/geofence`           | Create geofence      |
| GET    | `/api/app-builder`        | List state apps      |
| GET    | `/api/health`             | Health check         |

---

## Student App Integration

The student app should POST events to two endpoints:

### Session Telemetry
```json
POST /api/analytics/telemetry
Authorization: Bearer <device_token>

{
  "device_id":       "device_abc123",
  "student_id":      "student_xyz789",
  "state":           "Maharashtra",
  "district":        "Mumbai",
  "class_grade":     "Class 10",
  "subject":         "Science",
  "topic_id":        "<uuid from curriculum API>",
  "session_minutes": 14.5,
  "replay_count":    2,
  "completed":       true,
  "offline_session": false,
  "app_language":    "Hindi",
  "device_tier":     "mid"
}
```

### Ad Impression
```json
POST /api/ads/impressions
Authorization: Bearer <device_token>

{
  "campaign_id":     "<ad campaign UUID>",
  "device_id":       "device_abc123",
  "student_id":      "student_xyz789",
  "state":           "Maharashtra",
  "district":        "Mumbai",
  "class_grade":     "Class 10",
  "age_group":       "15-16 yrs",
  "subject_context": "Science",
  "app_language":    "Hindi",
  "media_type":      "video",
  "view_seconds":    21.4,
  "completed":       true,
  "clicked":         false,
  "skipped":         false,
  "is_repeat":       false,
  "repeat_count":    1
}
```

---

## Default Credentials (Change Immediately)

| Role           | Email                    | Password          |
|----------------|--------------------------|-------------------|
| Master Admin   | admin@mitra.gov.in       | Mitra@Admin2026!  |
| District Officer | meera@mitra.gov.in     | District@2026!    |

> ⚠️ **Change all default passwords immediately after first login.**

---

## File Structure

```
mitra-backend/
├── server.js               ← Express app entry point
├── package.json
├── .env.example            ← Copy to .env and fill secrets
├── Dockerfile
├── docker-compose.yml
├── nginx.conf              ← Nginx reverse proxy config
├── db/
│   ├── index.js            ← PostgreSQL pool
│   ├── schema.sql          ← Full database schema
│   ├── migrate.js          ← Run schema migration
│   └── seed.js             ← Seed with default data
├── middleware/
│   └── auth.js             ← JWT verify + role guards
├── routes/
│   ├── auth.js             ← Login / refresh / logout
│   ├── advertisements.js   ← Ad CRUD + full analytics
│   ├── analytics.js        ← Student telemetry + replay
│   ├── users.js            ← User management
│   ├── unity.js            ← Unity asset upload
│   ├── curriculum.js       ← Curriculum CRUD
│   ├── geofence.js         ← Geofence management
│   ├── appBuilder.js       ← State app management
│   └── dashboard.js        ← Dashboard summary KPIs
├── public/
│   ├── index.html          ← Dashboard (served as SPA)
│   └── api-client.js       ← Frontend API integration
└── uploads/
    ├── ads/                ← Advertisement media files
    └── unity/              ← Unity package files
```

---

## Security Checklist (Before Going Live)

- [ ] Change all default passwords in `.env` and seed data
- [ ] Set strong, unique `JWT_SECRET` (≥ 64 random chars)
- [ ] Set `ALLOWED_ORIGINS` to your exact production domain
- [ ] Set `NODE_ENV=production`
- [ ] Enable SSL and update `nginx.conf` server_name
- [ ] Set `DB_SSL=true` if PostgreSQL is on a separate server
- [ ] Restrict PostgreSQL port 5432 to internal network only
- [ ] Set up regular database backups (`pg_dump`)
- [ ] Configure firewall: only expose ports 80 and 443 externally
- [ ] Review and tighten rate limits in `server.js` for your traffic
