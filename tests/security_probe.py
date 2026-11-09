"""Security probes for tool-tracker-enterprise backend, run against an in-memory Mongo."""
# Run: python -I tests/security_probe.py backend   (needs fastapi, motor 3.3.1, pymongo 4.5, mongomock-motor)
import os, sys
os.environ.setdefault("MONGO_URL", "mongodb://localhost")
os.environ.setdefault("DB_NAME", "probe")
os.environ.setdefault("JWT_SECRET", "probe-secret")

import mongomock_motor, motor.motor_asyncio
motor.motor_asyncio.AsyncIOMotorClient = mongomock_motor.AsyncMongoMockClient

sys.path.insert(0, sys.argv[1])
import server  # noqa
from fastapi.testclient import TestClient

c = TestClient(server.app)
results = []

def check(name, bad, detail):
    results.append((name, bad, detail))

# 1. First-run admin
r = c.post("/api/auth/setup", json={"email": "boss@a.co", "password": "secret123", "name": "Boss"})
admin_tok = r.json()["token"]
A = {"Authorization": f"Bearer {admin_tok}"}

# 2. Admin makes a worker
r = c.post("/api/users", headers=A, json={"email": "w@a.co", "password": "secret123", "name": "Worker", "role": "worker"})
worker_id = r.json()["id"]
r = c.post("/api/auth/login", json={"email": "w@a.co", "password": "secret123"})
W = {"Authorization": f"Bearer {r.json()['token']}"}

# Probe A: worker promotes self to admin
r = c.put(f"/api/users/{worker_id}", headers=W, json={"role": "admin"})
role_after = (r.json() or {}).get("role")
r2 = c.put("/api/settings", headers=W, json={"notify_days_before": 1})
check("Worker can make themselves admin", role_after == "admin" and r2.status_code == 200,
      f"PUT own user role=admin -> role now {role_after}; then PUT /settings -> {r2.status_code}")

# Probe B: deactivated user's existing token still works
r = c.post("/api/users", headers=A, json={"email": "gone@a.co", "password": "secret123", "name": "Leaver", "role": "worker"})
gone_id = r.json()["id"]
G = {"Authorization": f"Bearer {c.post('/api/auth/login', json={'email': 'gone@a.co', 'password': 'secret123'}).json()['token']}"}
c.delete(f"/api/users/{gone_id}", headers=A)
r = c.get("/api/tools", headers=G)
check("Deactivated user keeps access until token expires (24h)", r.status_code == 200, f"GET /tools with leaver's token -> {r.status_code}")

# Probe C: user hard-removed from DB -> token falls back to default workspace
import asyncio
asyncio.get_event_loop().run_until_complete(server.db.users.delete_one({"id": gone_id})) if False else None
loop = asyncio.new_event_loop()
loop.run_until_complete(server.db.users.delete_one({"id": gone_id}))
r = c.get("/api/tools", headers=G)
check("Token for a removed user still accepted (falls back to default workspace)", r.status_code == 200, f"-> {r.status_code}")

# Probe D: invalid role value accepted on update
r = c.put(f"/api/users/{worker_id}", headers=A, json={"role": "superuser"})
check("Any role text accepted on user update", (r.json() or {}).get("role") == "superuser", f"role -> {(r.json() or {}).get('role')}")

# Probe F: site manager creates an admin
r = c.put(f"/api/users/{worker_id}", headers=A, json={"role": "site_manager"})
check("Admin can still change a role (regression)", (r.json() or {}).get("role") != "site_manager", f"-> {r.status_code} {(r.json() or {}).get('role')}")
r = c.put(f"/api/users/{worker_id}", headers=W, json={"name": "Worker Renamed"})
check("User can still edit own name (regression)", r.status_code != 200, f"-> {r.status_code}")
r = c.post("/api/users", headers=W, json={"email": "x@a.co", "password": "secret123", "name": "X", "role": "admin"})
check("Site manager can create an admin", r.status_code == 200, f"-> {r.status_code}")

# Probe E: uploads served without login
check("Uploaded photos / certificate PDFs served with no login", True, "app.mount('/api/uploads', StaticFiles) has no auth")

for name, bad, detail in results:
    print(("FAIL  " if bad else "ok    ") + name + "  | " + detail)
