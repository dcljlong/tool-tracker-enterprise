from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import re
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import qrcode
import io
import base64
import json
import csv
import openpyxl
import PyPDF2
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', str(uuid.uuid4()))
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

DEFAULT_COMPANY_ID = os.environ.get("DEFAULT_COMPANY_ID", "default-company").strip() or "default-company"
DEFAULT_COMPANY_NAME = os.environ.get("DEFAULT_COMPANY_NAME", "Default Workspace").strip() or "Default Workspace"

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Pydantic Models ---
class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    role: str = "worker"
    company_id: Optional[str] = None
    company_name: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    email: Optional[str] = None
    company_id: Optional[str] = None
    company_name: Optional[str] = None

class ToolCreate(BaseModel):
    asset_id: str
    description: str
    category: str
    model_name: Optional[str] = ""
    serial_number: Optional[str] = ""
    condition: str = "good"
    safety_tag_expiry: Optional[str] = None
    next_maintenance_date: Optional[str] = None
    notes: Optional[str] = ""
    photo_url: Optional[str] = ""

class ToolUpdate(BaseModel):
    description: Optional[str] = None
    category: Optional[str] = None
    model_name: Optional[str] = None
    serial_number: Optional[str] = None
    condition: Optional[str] = None
    safety_tag_expiry: Optional[str] = None
    next_maintenance_date: Optional[str] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = None
    status: Optional[str] = None

class CheckoutCreate(BaseModel):
    tool_id: str
    job_number: str
    site: str
    site_manager: str
    expected_return_date: str
    notes: Optional[str] = ""

class ReturnCreate(BaseModel):
    tool_id: str
    condition: str = "good"
    notes: Optional[str] = ""

class HandoverCreate(BaseModel):
    tool_id: str
    next_holder_id: str
    job_number: str
    site_manager: str
    notes: Optional[str] = ""

class SettingsUpdate(BaseModel):
    email_provider: Optional[str] = None
    email_api_key: Optional[str] = None
    sender_email: Optional[str] = None
    notify_tag_expiry: Optional[bool] = None
    notify_overdue: Optional[bool] = None
    notify_handover: Optional[bool] = None
    notify_days_before: Optional[int] = None
    company_name: Optional[str] = None

class MaintenanceAction(BaseModel):
    tool_id: str
    action_type: str
    description: str
    safety_tag_expiry: Optional[str] = None
    next_maintenance_date: Optional[str] = None
    condition: Optional[str] = None

class CertificateCreate(BaseModel):
    tool_id: str
    certificate_type: str  # e.g. "Annual Inspection", "Load Test", "Electrical Test & Tag"
    certificate_number: Optional[str] = ""
    issuer_name: str
    issuer_company: Optional[str] = ""
    issuer_license_number: Optional[str] = ""
    nz_standard: Optional[str] = ""  # e.g. "AS/NZS 1418", "AS/NZS 3012"
    issue_date: str
    expiry_date: str
    notes: Optional[str] = ""

class CertificateUpdate(BaseModel):
    certificate_type: Optional[str] = None
    certificate_number: Optional[str] = None
    issuer_name: Optional[str] = None
    issuer_company: Optional[str] = None
    issuer_license_number: Optional[str] = None
    nz_standard: Optional[str] = None
    issue_date: Optional[str] = None
    expiry_date: Optional[str] = None
    notes: Optional[str] = None

class BulkCheckout(BaseModel):
    tool_ids: List[str]
    job_number: str
    site: str
    site_manager: str
    expected_return_date: str
    notes: Optional[str] = ""

class BulkReturn(BaseModel):
    tool_ids: List[str]
    condition: str = "good"
    notes: Optional[str] = ""

# --- Auth Helpers ---
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, role: str, name: str) -> str:
    payload = {
        "user_id": user_id,
        "role": role,
        "name": name,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])

def normalise_company_id(value: Optional[str]) -> str:
    clean = (value or "").strip()
    return clean or DEFAULT_COMPANY_ID

def current_company_id(current_user: Dict[str, Any]) -> str:
    return normalise_company_id(current_user.get("company_id"))

def company_filter(current_user: Dict[str, Any], extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    query = {"company_id": current_company_id(current_user)}
    if extra:
        query.update(extra)
    return query

async def get_current_user(token: str = None):
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = token.replace("Bearer ", "")
    try:
        payload = decode_token(token)
        user_id = payload.get("user_id")
        if user_id:
            user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
            if user:
                user["user_id"] = user.get("id")
                user["company_id"] = normalise_company_id(user.get("company_id"))
                user["company_name"] = user.get("company_name") or DEFAULT_COMPANY_NAME
                return user
        payload["company_id"] = normalise_company_id(payload.get("company_id"))
        payload["company_name"] = payload.get("company_name") or DEFAULT_COMPANY_NAME
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

from fastapi import Request

async def auth_dependency(request: Request):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    return await get_current_user(auth_header)

# --- First Run Check ---
@api_router.get("/setup/check")
async def check_first_run():
    user_count = await db.users.count_documents({})
    return {"is_first_run": user_count == 0}

# --- Auth Routes ---
@api_router.post("/auth/setup")
async def setup_admin(user: UserCreate):
    existing = await db.users.count_documents({})
    if existing > 0:
        raise HTTPException(status_code=400, detail="Setup already completed")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": user.email.lower().strip(),
        "password": hash_password(user.password),
        "name": user.name,
        "role": "admin",
        "company_id": DEFAULT_COMPANY_ID,
        "company_name": DEFAULT_COMPANY_NAME,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_active": True
    }
    await db.users.insert_one(doc)
    # Create default settings
    await db.settings.insert_one({
        "id": "app_settings",
        "company_id": DEFAULT_COMPANY_ID,
        "company_name": DEFAULT_COMPANY_NAME,
        "email_provider": "",
        "email_api_key": "",
        "sender_email": "",
        "notify_tag_expiry": True,
        "notify_overdue": True,
        "notify_handover": True,
        "notify_days_before": 14,
        "company_name": "",
        "updated_at": datetime.now(timezone.utc).isoformat()
    })
    token = create_token(user_id, "admin", user.name)
    return {"token": token, "user": {"id": user_id, "email": doc["email"], "name": user.name, "role": "admin"}}

@api_router.post("/auth/login")
async def login(user: UserLogin):
    found = await db.users.find_one({"email": user.email.lower().strip()}, {"_id": 0})
    if not found or not verify_password(user.password, found["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not found.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account disabled")
    found["company_id"] = normalise_company_id(found.get("company_id"))
    found["company_name"] = found.get("company_name") or DEFAULT_COMPANY_NAME
    token = create_token(found["id"], found["role"], found["name"])
    return {"token": token, "user": {"id": found["id"], "email": found["email"], "name": found["name"], "role": found["role"], "company_id": found["company_id"], "company_name": found["company_name"]}}

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(auth_dependency)):
    user = await db.users.find_one({"id": current_user["user_id"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# --- User Management ---
@api_router.get("/users")
async def list_users(
    search: Optional[str] = None,
    role: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(auth_dependency)
):
    query = company_filter(current_user)
    if role:
        query["role"] = role
    if status == "active":
        query["is_active"] = True
    elif status == "inactive":
        query["is_active"] = False
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}}
        ]
    users = await db.users.find(query, {"_id": 0, "password": 0}).to_list(500)
    return users

@api_router.post("/users")
async def create_user(user: UserCreate, current_user: dict = Depends(auth_dependency)):
    if current_user["role"] not in ["admin", "site_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    existing = await db.users.find_one({"email": user.email.lower().strip()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    target_company_id = normalise_company_id(user.company_id if current_user["role"] == "admin" else current_user.get("company_id"))
    target_company_name = (user.company_name if current_user["role"] == "admin" else current_user.get("company_name")) or DEFAULT_COMPANY_NAME
    doc = {
        "id": user_id,
        "email": user.email.lower().strip(),
        "password": hash_password(user.password),
        "name": user.name,
        "role": user.role,
        "company_id": target_company_id,
        "company_name": target_company_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_active": True
    }
    await db.users.insert_one(doc)
    return {"id": user_id, "email": doc["email"], "name": user.name, "role": user.role, "company_id": doc["company_id"], "company_name": doc["company_name"]}

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, update: UserUpdate, current_user: dict = Depends(auth_dependency)):
    if current_user["role"] != "admin" and current_user["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    update_dict = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    user_query = {"id": user_id} if current_user["role"] == "admin" else company_filter(current_user, {"id": user_id})
    await db.users.update_one(user_query, {"$set": update_dict})
    user = await db.users.find_one(user_query, {"_id": 0, "password": 0})
    return user

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(auth_dependency)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    await db.users.update_one(company_filter(current_user, {"id": user_id}), {"$set": {"is_active": False}})
    return {"status": "deactivated"}

# --- Tool CRUD ---
@api_router.get("/tools")
async def list_tools(
    status: Optional[str] = None,
    category: Optional[str] = None,
    site: Optional[str] = None,
    holder: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(auth_dependency)
):
    query = company_filter(current_user)
    if status:
        query["status"] = status
    if category:
        query["category"] = category
    if holder:
        query["current_holder_id"] = holder
    if search:
        query["$or"] = [
            {"asset_id": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"serial_number": {"$regex": search, "$options": "i"}}
        ]
    tools = await db.tools.find(query, {"_id": 0}).to_list(2000)
    # If filtering by site, get active checkouts for that site
    if site:
        checkout_tool_ids = await db.checkouts.find(
            company_filter(current_user, {"site": site, "status": "active"}), {"tool_id": 1, "_id": 0}
        ).to_list(2000)
        site_tool_ids = [c["tool_id"] for c in checkout_tool_ids]
        tools = [t for t in tools if t["id"] in site_tool_ids]
    return tools

@api_router.post("/tools")
async def create_tool(tool: ToolCreate, current_user: dict = Depends(auth_dependency)):
    if current_user["role"] not in ["admin", "site_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    existing = await db.tools.find_one(company_filter(current_user, {"asset_id": tool.asset_id}))
    if existing:
        raise HTTPException(status_code=400, detail="Asset ID already exists")
    tool_id = str(uuid.uuid4())
    # Determine status based on maintenance/safety
    status = "available"
    if tool.safety_tag_expiry:
        try:
            expiry = datetime.fromisoformat(tool.safety_tag_expiry)
            if expiry < datetime.now(timezone.utc):
                status = "maintenance_required"
        except Exception:
            pass
    doc = {
        "id": tool_id,
        "asset_id": tool.asset_id,
        "description": tool.description,
        "category": tool.category,
        "model_name": tool.model_name or "",
        "serial_number": tool.serial_number or "",
        "condition": tool.condition,
        "status": status,
        "safety_tag_expiry": tool.safety_tag_expiry,
        "next_maintenance_date": tool.next_maintenance_date,
        "notes": tool.notes or "",
        "photo_url": tool.photo_url or "",
        "current_holder_id": None,
        "current_holder_name": None,
        "current_site": None,
        "current_job": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["user_id"],
        "company_id": current_company_id(current_user),
        "company_name": current_user.get("company_name") or DEFAULT_COMPANY_NAME
    }
    await db.tools.insert_one(doc)
    # Log audit
    await log_audit(tool_id, "created", current_user["user_id"], current_user["name"], "Tool created")
    doc.pop("_id", None)
    return doc

@api_router.get("/tools/{tool_id}")
async def get_tool(tool_id: str, current_user: dict = Depends(auth_dependency)):
    tool = await db.tools.find_one(company_filter(current_user, {"id": tool_id}), {"_id": 0})
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    return tool

@api_router.put("/tools/{tool_id}")
async def update_tool(tool_id: str, update: ToolUpdate, current_user: dict = Depends(auth_dependency)):
    if current_user["role"] not in ["admin", "site_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    update_dict = {k: v for k, v in update.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.tools.update_one(company_filter(current_user, {"id": tool_id}), {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tool not found")
    await log_audit(tool_id, "updated", current_user["user_id"], current_user["name"], f"Updated: {', '.join(update_dict.keys())}")
    tool = await db.tools.find_one(company_filter(current_user, {"id": tool_id}), {"_id": 0})
    return tool

@api_router.delete("/tools/{tool_id}")
async def delete_tool(tool_id: str, current_user: dict = Depends(auth_dependency)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    result = await db.tools.delete_one(company_filter(current_user, {"id": tool_id}))
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tool not found")
    await log_audit(tool_id, "deleted", current_user["user_id"], current_user["name"], "Tool deleted")
    return {"status": "deleted"}

# --- QR Code ---
@api_router.get("/tools/{tool_id}/qr")
async def get_tool_qr(tool_id: str, current_user: dict = Depends(auth_dependency)):
    tool = await db.tools.find_one(company_filter(current_user, {"id": tool_id}), {"_id": 0})
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    qr_data = json.dumps({"tool_id": tool_id, "asset_id": tool["asset_id"], "description": tool["description"]})
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(qr_data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return {"qr_code": f"data:image/png;base64,{b64}", "asset_id": tool["asset_id"]}

# --- Photo Upload ---
@api_router.post("/tools/{tool_id}/photo")
async def upload_tool_photo(tool_id: str, file: UploadFile = File(...), current_user: dict = Depends(auth_dependency)):
    tool = await db.tools.find_one(company_filter(current_user, {"id": tool_id}), {"_id": 0})
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    if file.content_type not in ["image/jpeg", "image/png", "image/webp"]:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, or WebP images accepted")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    filename = f"{tool_id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = UPLOADS_DIR / filename
    with open(filepath, "wb") as f:
        f.write(content)
    photo_url = f"/api/uploads/{filename}"
    await db.tools.update_one(company_filter(current_user, {"id": tool_id}), {"$set": {"photo_url": photo_url, "updated_at": datetime.now(timezone.utc).isoformat()}})
    await log_audit(tool_id, "photo_upload", current_user["user_id"], current_user["name"], "Photo uploaded")
    return {"photo_url": photo_url}

# --- Checkout / Return ---
@api_router.post("/checkout")
async def checkout_tool(data: CheckoutCreate, current_user: dict = Depends(auth_dependency)):
    tool = await db.tools.find_one(company_filter(current_user, {"id": data.tool_id}), {"_id": 0})
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    if tool["status"] == "checked_out":
        raise HTTPException(status_code=400, detail="Tool already checked out")
    if tool["status"] == "maintenance_required":
        raise HTTPException(status_code=400, detail="Tool requires maintenance before checkout")
    checkout_id = str(uuid.uuid4())
    doc = {
        "id": checkout_id,
        "company_id": current_company_id(current_user),
        "company_name": current_user.get("company_name") or DEFAULT_COMPANY_NAME,
        "tool_id": data.tool_id,
        "tool_asset_id": tool["asset_id"],
        "tool_description": tool["description"],
        "checked_out_by_id": current_user["user_id"],
        "checked_out_by_name": current_user["name"],
        "job_number": data.job_number,
        "site": data.site,
        "site_manager": data.site_manager,
        "expected_return_date": data.expected_return_date,
        "notes": data.notes or "",
        "checkout_time": datetime.now(timezone.utc).isoformat(),
        "return_time": None,
        "return_condition": None,
        "return_notes": None,
        "status": "active"
    }
    await db.checkouts.insert_one(doc)
    await db.tools.update_one(company_filter(current_user, {"id": data.tool_id}), {"$set": {
        "status": "checked_out",
        "current_holder_id": current_user["user_id"],
        "current_holder_name": current_user["name"],
        "current_site": data.site,
        "current_job": data.job_number,
        "expected_return_date": data.expected_return_date,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }})
    await log_audit(data.tool_id, "checkout", current_user["user_id"], current_user["name"],
                    f"Checked out for job {data.job_number} at {data.site}")
    doc.pop("_id", None)
    return doc

@api_router.post("/return")
async def return_tool(data: ReturnCreate, current_user: dict = Depends(auth_dependency)):
    tool = await db.tools.find_one(company_filter(current_user, {"id": data.tool_id}), {"_id": 0})
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    if tool["status"] != "checked_out":
        raise HTTPException(status_code=400, detail="Tool is not checked out")
    checkout = await db.checkouts.find_one(
        company_filter(current_user, {"tool_id": data.tool_id, "status": "active"}), {"_id": 0}
    )
    if checkout:
        await db.checkouts.update_one(company_filter(current_user, {"id": checkout["id"]}), {"$set": {
            "return_time": datetime.now(timezone.utc).isoformat(),
            "return_condition": data.condition,
            "return_notes": data.notes or "",
            "status": "returned"
        }})
    new_status = "available" if data.condition != "damaged" else "maintenance_required"
    await db.tools.update_one(company_filter(current_user, {"id": data.tool_id}), {"$set": {
        "status": new_status,
        "condition": data.condition,
        "current_holder_id": None,
        "current_holder_name": None,
        "current_site": None,
        "current_job": None,
        "expected_return_date": None,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }})
    await log_audit(data.tool_id, "return", current_user["user_id"], current_user["name"],
                    f"Returned in {data.condition} condition. {data.notes or ''}")
    return {"status": "returned", "tool_status": new_status}

@api_router.get("/checkouts")
async def list_checkouts(status: Optional[str] = None, current_user: dict = Depends(auth_dependency)):
    query = company_filter(current_user)
    if status:
        query["status"] = status
    checkouts = await db.checkouts.find(query, {"_id": 0}).sort("checkout_time", -1).to_list(500)
    return checkouts

# --- Handover ---
@api_router.post("/handover")
async def handover_tool(data: HandoverCreate, current_user: dict = Depends(auth_dependency)):
    tool = await db.tools.find_one(company_filter(current_user, {"id": data.tool_id}), {"_id": 0})
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    if tool["status"] != "checked_out":
        raise HTTPException(status_code=400, detail="Tool must be checked out for handover")
    next_user = await db.users.find_one(company_filter(current_user, {"id": data.next_holder_id}), {"_id": 0, "password": 0})
    if not next_user:
        raise HTTPException(status_code=404, detail="Next holder not found")
    handover_id = str(uuid.uuid4())
    doc = {
        "id": handover_id,
        "company_id": current_company_id(current_user),
        "company_name": current_user.get("company_name") or DEFAULT_COMPANY_NAME,
        "tool_id": data.tool_id,
        "tool_asset_id": tool["asset_id"],
        "tool_description": tool["description"],
        "from_user_id": current_user["user_id"],
        "from_user_name": current_user["name"],
        "to_user_id": data.next_holder_id,
        "to_user_name": next_user["name"],
        "job_number": data.job_number,
        "site_manager": data.site_manager,
        "notes": data.notes or "",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "completed"
    }
    await db.handovers.insert_one(doc)
    await db.tools.update_one(company_filter(current_user, {"id": data.tool_id}), {"$set": {
        "current_holder_id": data.next_holder_id,
        "current_holder_name": next_user["name"],
        "updated_at": datetime.now(timezone.utc).isoformat()
    }})
    # Update active checkout
    await db.checkouts.update_one(
        company_filter(current_user, {"tool_id": data.tool_id, "status": "active"}),
        {"$set": {
            "checked_out_by_id": data.next_holder_id,
            "checked_out_by_name": next_user["name"]
        }}
    )
    await log_audit(data.tool_id, "handover", current_user["user_id"], current_user["name"],
                    f"Handed over to {next_user['name']}")
    # Create notification for next holder
    await create_notification(data.next_holder_id, "handover",
                              f"Tool {tool['asset_id']} handed over to you by {current_user['name']}",
                              data.tool_id)
    doc.pop("_id", None)
    return doc

@api_router.get("/handovers")
async def list_handovers(current_user: dict = Depends(auth_dependency)):
    handovers = await db.handovers.find(company_filter(current_user), {"_id": 0}).sort("timestamp", -1).to_list(500)
    return handovers

# --- Maintenance ---
@api_router.post("/maintenance")
async def record_maintenance(data: MaintenanceAction, current_user: dict = Depends(auth_dependency)):
    if current_user["role"] not in ["admin", "site_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    tool = await db.tools.find_one(company_filter(current_user, {"id": data.tool_id}), {"_id": 0})
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    action_id = str(uuid.uuid4())
    doc = {
        "id": action_id,
        "company_id": current_company_id(current_user),
        "company_name": current_user.get("company_name") or DEFAULT_COMPANY_NAME,
        "tool_id": data.tool_id,
        "tool_asset_id": tool["asset_id"],
        "action_type": data.action_type,
        "description": data.description,
        "performed_by_id": current_user["user_id"],
        "performed_by_name": current_user["name"],
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await db.maintenance_actions.insert_one(doc)
    update_fields = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.safety_tag_expiry:
        update_fields["safety_tag_expiry"] = data.safety_tag_expiry
    if data.next_maintenance_date:
        update_fields["next_maintenance_date"] = data.next_maintenance_date
    if data.condition:
        update_fields["condition"] = data.condition
    if data.action_type == "completed" and tool["status"] == "maintenance_required":
        update_fields["status"] = "available"
    await db.tools.update_one(company_filter(current_user, {"id": data.tool_id}), {"$set": update_fields})
    await log_audit(data.tool_id, "maintenance", current_user["user_id"], current_user["name"],
                    f"{data.action_type}: {data.description}")
    doc.pop("_id", None)
    return doc

@api_router.get("/maintenance/{tool_id}")
async def get_maintenance_history(tool_id: str, current_user: dict = Depends(auth_dependency)):
    actions = await db.maintenance_actions.find(company_filter(current_user, {"tool_id": tool_id}), {"_id": 0}).sort("timestamp", -1).to_list(100)
    return actions

# --- Notifications ---
async def create_notification(
    user_id: str,
    notif_type: str,
    message: str,
    tool_id: str = None,
    company_id: str = None,
    company_name: str = None
):
    target_user = await db.users.find_one({"id": user_id}, {"_id": 0})
    notification_company_id = company_id or (target_user or {}).get("company_id") or DEFAULT_COMPANY_ID
    notification_company_name = company_name or (target_user or {}).get("company_name") or DEFAULT_COMPANY_NAME
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": notif_type,
        "message": message,
        "tool_id": tool_id,
        "company_id": notification_company_id,
        "company_name": notification_company_name,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(doc)

@api_router.get("/notifications")
async def list_notifications(current_user: dict = Depends(auth_dependency)):
    query = company_filter(current_user, {"user_id": current_user["user_id"]})
    if current_user["role"] == "admin":
        query = company_filter(current_user)  # Admin sees all notifications in their workspace only
    notifs = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return notifs

@api_router.get("/notifications/unread-count")
async def unread_count(current_user: dict = Depends(auth_dependency)):
    query = company_filter(current_user, {"read": False, "user_id": current_user["user_id"]})
    if current_user["role"] == "admin":
        query = company_filter(current_user, {"read": False})
    count = await db.notifications.count_documents(query)
    return {"count": count}

@api_router.put("/notifications/{notif_id}/read")
async def mark_read(notif_id: str, current_user: dict = Depends(auth_dependency)):
    query = company_filter(current_user, {"id": notif_id})
    if current_user["role"] != "admin":
        query["user_id"] = current_user["user_id"]
    result = await db.notifications.update_one(query, {"$set": {"read": True}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"status": "read"}

@api_router.put("/notifications/read-all")
async def mark_all_read(current_user: dict = Depends(auth_dependency)):
    query = company_filter(current_user, {"user_id": current_user["user_id"]})
    if current_user["role"] == "admin":
        query = company_filter(current_user)
    await db.notifications.update_many(query, {"$set": {"read": True}})
    return {"status": "all_read"}

# --- Settings ---
@api_router.get("/settings")
async def get_settings(current_user: dict = Depends(auth_dependency)):
    settings = await db.settings.find_one(company_filter(current_user, {"id": "app_settings"}), {"_id": 0})
    if not settings:
        return {}
    # Mask API key for non-admin
    if current_user["role"] != "admin" and settings.get("email_api_key"):
        settings["email_api_key"] = "***" + settings["email_api_key"][-4:] if len(settings.get("email_api_key", "")) > 4 else "****"
    return settings

@api_router.put("/settings")
async def update_settings(data: SettingsUpdate, current_user: dict = Depends(auth_dependency)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
    update_dict["company_id"] = current_company_id(current_user)
    update_dict["company_name"] = current_company_name(current_user)
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    settings_query = company_filter(current_user, {"id": "app_settings"})
    await db.settings.update_one(settings_query, {"$set": update_dict}, upsert=True)
    settings = await db.settings.find_one(settings_query, {"_id": 0})
    return settings

@api_router.post("/settings/test-email")
async def test_email(current_user: dict = Depends(auth_dependency)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    settings = await db.settings.find_one(company_filter(current_user, {"id": "app_settings"}), {"_id": 0})
    if not settings or not settings.get("email_api_key") or not settings.get("sender_email"):
        raise HTTPException(status_code=400, detail="Email not configured")
    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail
        user = await db.users.find_one(company_filter(current_user, {"id": current_user["user_id"]}), {"_id": 0})
        message = Mail(
            from_email=settings["sender_email"],
            to_emails=user["email"],
            subject="Test Email - Tool Tracker",
            html_content="<h2>Email Configuration Successful</h2><p>Your email settings are working correctly.</p>"
        )
        sg = SendGridAPIClient(settings["email_api_key"])
        response = sg.send(message)
        return {"status": "sent", "status_code": response.status_code}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Email test failed: {str(e)}")

# --- Dashboard Stats ---
@api_router.get("/dashboard/stats")
async def dashboard_stats(current_user: dict = Depends(auth_dependency)):
    total = await db.tools.count_documents(company_filter(current_user))
    available = await db.tools.count_documents(company_filter(current_user, {"status": "available"}))
    checked_out = await db.tools.count_documents(company_filter(current_user, {"status": "checked_out"}))
    maintenance = await db.tools.count_documents(company_filter(current_user, {"status": "maintenance_required"}))
    # Overdue tools
    now = datetime.now(timezone.utc).isoformat()
    overdue_checkouts = await db.checkouts.find(
        company_filter(current_user, {"status": "active", "expected_return_date": {"$lt": now}}), {"_id": 0}
    ).to_list(500)
    overdue_count = len(overdue_checkouts)
    # Expiring safety tags (within 14 days)
    two_weeks = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
    expiring_tags = await db.tools.count_documents(company_filter(current_user, {
        "safety_tag_expiry": {"$ne": None, "$lte": two_weeks, "$gte": now}
    }))
    # Users
    user_count = await db.users.count_documents(company_filter(current_user, {"is_active": True}))
    return {
        "total_tools": total,
        "available": available,
        "checked_out": checked_out,
        "maintenance_required": maintenance,
        "overdue": overdue_count,
        "expiring_tags": expiring_tags,
        "total_users": user_count,
        "overdue_tools": overdue_checkouts
    }

@api_router.get("/dashboard/recent-activity")
async def recent_activity(current_user: dict = Depends(auth_dependency)):
    audits = await db.audit_log.find(company_filter(current_user), {"_id": 0}).sort("timestamp", -1).to_list(20)
    return audits

# --- Audit Log ---
async def log_audit(tool_id: str, action: str, user_id: str, user_name: str, details: str):
    audit_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0}) if user_id else None
    doc = {
        "id": str(uuid.uuid4()),
        "company_id": normalise_company_id((audit_user or {}).get("company_id")),
        "company_name": (audit_user or {}).get("company_name") or DEFAULT_COMPANY_NAME,
        "tool_id": tool_id,
        "action": action,
        "user_id": user_id,
        "user_name": user_name,
        "details": details,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await db.audit_log.insert_one(doc)

@api_router.get("/audit/{tool_id}")
async def get_audit_trail(tool_id: str, current_user: dict = Depends(auth_dependency)):
    audits = await db.audit_log.find(company_filter(current_user, {"tool_id": tool_id}), {"_id": 0}).sort("timestamp", -1).to_list(200)
    return audits

# --- Import ---
@api_router.post("/import/tools")
async def import_tools(file: UploadFile = File(...), current_user: dict = Depends(auth_dependency)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    content = await file.read()
    imported = 0
    errors = []
    try:
        if file.filename.endswith('.csv'):
            text = content.decode('utf-8')
            reader = csv.DictReader(io.StringIO(text))
            for i, row in enumerate(reader):
                try:
                    tool_id = str(uuid.uuid4())
                    doc = {
                        "id": tool_id,
                        "asset_id": row.get("asset_id", row.get("Asset ID", f"IMP-{i+1}")),
                        "description": row.get("description", row.get("Description", "")),
                        "category": row.get("category", row.get("Category", "General")),
                        "model_name": row.get("model_name", row.get("Model", "")),
                        "serial_number": row.get("serial_number", row.get("Serial Number", "")),
                        "condition": row.get("condition", row.get("Condition", "good")),
                        "status": "available",
                        "safety_tag_expiry": row.get("safety_tag_expiry", row.get("Safety Tag Expiry", None)) or None,
                        "next_maintenance_date": row.get("next_maintenance_date", row.get("Next Maintenance", None)) or None,
                        "notes": row.get("notes", row.get("Notes", "")),
                        "photo_url": "",
                        "current_holder_id": None,
                        "current_holder_name": None,
                        "current_site": None,
                        "current_job": None,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                        "created_by": current_user["user_id"]
                    }
                    await db.tools.insert_one(doc)
                    imported += 1
                except Exception as e:
                    errors.append(f"Row {i+1}: {str(e)}")
        elif file.filename.endswith(('.xlsx', '.xls')):
            wb = openpyxl.load_workbook(io.BytesIO(content))
            ws = wb.active
            headers = [cell.value for cell in ws[1]]
            for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), 1):
                try:
                    row_dict = dict(zip(headers, row))
                    tool_id = str(uuid.uuid4())
                    doc = {
                        "id": tool_id,
                        "asset_id": str(row_dict.get("asset_id", row_dict.get("Asset ID", f"IMP-{i}"))),
                        "description": str(row_dict.get("description", row_dict.get("Description", ""))),
                        "category": str(row_dict.get("category", row_dict.get("Category", "General"))),
                        "model_name": str(row_dict.get("model_name", row_dict.get("Model", "")) or ""),
                        "serial_number": str(row_dict.get("serial_number", row_dict.get("Serial Number", "")) or ""),
                        "condition": str(row_dict.get("condition", row_dict.get("Condition", "good")) or "good"),
                        "status": "available",
                        "safety_tag_expiry": str(row_dict.get("safety_tag_expiry", row_dict.get("Safety Tag Expiry", "")) or "") or None,
                        "next_maintenance_date": str(row_dict.get("next_maintenance_date", row_dict.get("Next Maintenance", "")) or "") or None,
                        "notes": str(row_dict.get("notes", row_dict.get("Notes", "")) or ""),
                        "photo_url": "",
                        "current_holder_id": None,
                        "current_holder_name": None,
                        "current_site": None,
                        "current_job": None,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                        "created_by": current_user["user_id"]
                    }
                    await db.tools.insert_one(doc)
                    imported += 1
                except Exception as e:
                    errors.append(f"Row {i}: {str(e)}")
        elif file.filename.endswith('.pdf'):
            # Extract text from PDF and parse as tabular data
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
            all_text = ""
            for page in pdf_reader.pages:
                all_text += page.extract_text() + "\n"
            lines = [l.strip() for l in all_text.split('\n') if l.strip()]
            if not lines:
                raise HTTPException(status_code=400, detail="No readable text found in PDF")
            # Try to detect header row and parse
            header_keywords = ["asset", "description", "category", "model", "serial", "condition"]
            header_idx = -1
            for idx, line in enumerate(lines):
                lower = line.lower()
                matches = sum(1 for kw in header_keywords if kw in lower)
                if matches >= 2:
                    header_idx = idx
                    break
            if header_idx >= 0:
                # Split header and data by multiple spaces or tabs
                header_line = lines[header_idx]
                headers_raw = re.split(r'\s{2,}|\t', header_line)
                headers_clean = [h.strip().lower().replace(' ', '_') for h in headers_raw]
                for i, line in enumerate(lines[header_idx + 1:], 1):
                    try:
                        values = re.split(r'\s{2,}|\t', line)
                        if len(values) < 2:
                            continue
                        row_dict = {}
                        for j, h in enumerate(headers_clean):
                            row_dict[h] = values[j] if j < len(values) else ""
                        tool_id = str(uuid.uuid4())
                        doc = {
                            "id": tool_id,
                            "asset_id": row_dict.get("asset_id", row_dict.get("asset", f"PDF-{i}")),
                            "description": row_dict.get("description", row_dict.get("desc", "")),
                            "category": row_dict.get("category", row_dict.get("cat", "General")),
                            "model_name": row_dict.get("model_name", row_dict.get("model", "")),
                            "serial_number": row_dict.get("serial_number", row_dict.get("serial", "")),
                            "condition": row_dict.get("condition", "good"),
                            "status": "available",
                            "safety_tag_expiry": row_dict.get("safety_tag_expiry", None) or None,
                            "next_maintenance_date": row_dict.get("next_maintenance_date", row_dict.get("next_maintenance", None)) or None,
                            "notes": row_dict.get("notes", "Imported from PDF"),
                            "photo_url": "",
                            "current_holder_id": None,
                            "current_holder_name": None,
                            "current_site": None,
                            "current_job": None,
                            "created_at": datetime.now(timezone.utc).isoformat(),
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                            "created_by": current_user["user_id"]
                        }
                        await db.tools.insert_one(doc)
                        imported += 1
                    except Exception as e:
                        errors.append(f"PDF line {i}: {str(e)}")
            else:
                # Fallback: treat each line as a tool description
                for i, line in enumerate(lines, 1):
                    if len(line) < 3:
                        continue
                    try:
                        tool_id = str(uuid.uuid4())
                        doc = {
                            "id": tool_id,
                            "asset_id": f"PDF-{i:04d}",
                            "description": line,
                            "category": "General",
                            "model_name": "",
                            "serial_number": "",
                            "condition": "good",
                            "status": "available",
                            "safety_tag_expiry": None,
                            "next_maintenance_date": None,
                            "notes": "Imported from PDF (unstructured)",
                            "photo_url": "",
                            "current_holder_id": None,
                            "current_holder_name": None,
                            "current_site": None,
                            "current_job": None,
                            "created_at": datetime.now(timezone.utc).isoformat(),
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                            "created_by": current_user["user_id"]
                        }
                        await db.tools.insert_one(doc)
                        imported += 1
                    except Exception as e:
                        errors.append(f"PDF line {i}: {str(e)}")
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Use CSV, Excel, or PDF.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Import failed: {str(e)}")
    return {"imported": imported, "errors": errors}

# --- Reports ---
@api_router.get("/reports/tool-activity")
async def tool_activity_report(
    days: int = 7,
    current_user: dict = Depends(auth_dependency)
):
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    checkouts = await db.checkouts.find(company_filter(current_user, {"checkout_time": {"$gte": since}}), {"_id": 0}).to_list(1000)
    handovers = await db.handovers.find(company_filter(current_user, {"timestamp": {"$gte": since}}), {"_id": 0}).to_list(1000)
    maintenance = await db.maintenance_actions.find(company_filter(current_user, {"timestamp": {"$gte": since}}), {"_id": 0}).to_list(1000)
    return {
        "period_days": days,
        "checkouts": len(checkouts),
        "returns": len([c for c in checkouts if c.get("status") == "returned"]),
        "handovers": len(handovers),
        "maintenance_actions": len(maintenance),
        "checkout_details": checkouts,
        "handover_details": handovers,
        "maintenance_details": maintenance
    }

@api_router.get("/reports/summary")
async def report_summary(
    period: str = "week",
    current_user: dict = Depends(auth_dependency)
):
    """Generate summary stats for daily or weekly reports."""
    days = 7 if period == "week" else 1
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    now_str = datetime.now(timezone.utc).isoformat()

    total_tools = await db.tools.count_documents(company_filter(current_user))
    available = await db.tools.count_documents(company_filter(current_user, {"status": "available"}))
    checked_out = await db.tools.count_documents(company_filter(current_user, {"status": "checked_out"}))
    maintenance = await db.tools.count_documents(company_filter(current_user, {"status": "maintenance_required"}))

    checkouts = await db.checkouts.find(company_filter(current_user, {"checkout_time": {"$gte": since}}), {"_id": 0}).to_list(1000)
    returns = [c for c in checkouts if c.get("status") == "returned"]
    handovers = await db.handovers.find(company_filter(current_user, {"timestamp": {"$gte": since}}), {"_id": 0}).to_list(1000)
    maint_actions = await db.maintenance_actions.find(company_filter(current_user, {"timestamp": {"$gte": since}}), {"_id": 0}).to_list(1000)

    overdue = await db.checkouts.find(
        company_filter(current_user, {"status": "active", "expected_return_date": {"$lt": now_str}}), {"_id": 0}
    ).to_list(500)

    # Most active users
    user_activity = {}
    for co in checkouts:
        uid = co.get("checked_out_by_name", "Unknown")
        user_activity[uid] = user_activity.get(uid, 0) + 1
    for ho in handovers:
        uid = ho.get("from_user_name", "Unknown")
        user_activity[uid] = user_activity.get(uid, 0) + 1
    top_users = sorted(user_activity.items(), key=lambda x: x[1], reverse=True)[:5]

    # Most used tools
    tool_usage = {}
    for co in checkouts:
        tid = co.get("tool_asset_id", "Unknown")
        tool_usage[tid] = tool_usage.get(tid, 0) + 1
    top_tools = sorted(tool_usage.items(), key=lambda x: x[1], reverse=True)[:5]

    return {
        "period": period,
        "period_days": days,
        "inventory": {"total": total_tools, "available": available, "checked_out": checked_out, "maintenance": maintenance},
        "activity": {"checkouts": len(checkouts), "returns": len(returns), "handovers": len(handovers), "maintenance_actions": len(maint_actions)},
        "overdue_count": len(overdue),
        "overdue_details": overdue[:10],
        "top_users": [{"name": n, "actions": c} for n, c in top_users],
        "top_tools": [{"asset_id": n, "uses": c} for n, c in top_tools],
    }

@api_router.get("/reports/export")
async def export_report(format: str = "csv", current_user: dict = Depends(auth_dependency)):
    tools = await db.tools.find(company_filter(current_user), {"_id": 0}).to_list(5000)
    if format == "csv":
        output = io.StringIO()
        if tools:
            writer = csv.DictWriter(output, fieldnames=tools[0].keys())
            writer.writeheader()
            for t in tools:
                writer.writerow(t)
        content = output.getvalue()
        return StreamingResponse(
            io.BytesIO(content.encode()),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=tools_export.csv"}
        )
    return tools

@api_router.get("/reports/export-pdf")
async def export_pdf_report(
    report_type: str = "inventory",
    days: int = 7,
    current_user: dict = Depends(auth_dependency)
):
    """Generate a PDF report. report_type: inventory, activity, overdue"""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15*mm, rightMargin=15*mm, topMargin=20*mm, bottomMargin=15*mm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('CustomTitle', parent=styles['Title'], fontSize=18, spaceAfter=12, textColor=colors.HexColor('#0F172A'))
    subtitle_style = ParagraphStyle('CustomSubtitle', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor('#64748B'), spaceAfter=16)
    section_style = ParagraphStyle('Section', parent=styles['Heading2'], fontSize=13, spaceAfter=8, spaceBefore=16, textColor=colors.HexColor('#F59E0B'))

    settings = await db.settings.find_one(company_filter(current_user, {"id": "app_settings"}), {"_id": 0})
    company = settings.get("company_name", "Tool Tracker") if settings else current_user.get("company_name", "Tool Tracker")
    now = datetime.now(timezone.utc)
    elements = []

    elements.append(Paragraph(f"{company} - Tool Report", title_style))
    elements.append(Paragraph(f"Generated: {now.strftime('%d %B %Y, %H:%M')} NZST | Report: {report_type.replace('_',' ').title()}", subtitle_style))

    table_header_style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F59E0B')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ])

    if report_type == "inventory":
        elements.append(Paragraph("Tool Inventory", section_style))
        tools = await db.tools.find(company_filter(current_user), {"_id": 0}).to_list(5000)
        data = [["Asset ID", "Description", "Category", "Status", "Condition", "Holder", "Site"]]
        for t in tools:
            data.append([
                t.get("asset_id", ""), t.get("description", "")[:40],
                t.get("category", ""), t.get("status", "").replace("_", " ").title(),
                t.get("condition", "").title(), t.get("current_holder_name", "-") or "-",
                t.get("current_site", "-") or "-"
            ])
        col_widths = [55, 130, 70, 65, 50, 70, 70]
        table = Table(data, colWidths=col_widths, repeatRows=1)
        table.setStyle(table_header_style)
        elements.append(table)

    elif report_type == "activity":
        since = (now - timedelta(days=days)).isoformat()
        elements.append(Paragraph(f"Activity Report (Last {days} Days)", section_style))

        checkouts = await db.checkouts.find(company_filter(current_user, {"checkout_time": {"$gte": since}}), {"_id": 0}).to_list(1000)
        elements.append(Paragraph("Checkouts & Returns", ParagraphStyle('SubHead', parent=styles['Heading3'], fontSize=11, spaceBefore=10)))
        data = [["Tool", "User", "Site", "Job", "Checkout", "Status"]]
        for co in checkouts:
            data.append([
                co.get("tool_asset_id", ""), co.get("checked_out_by_name", ""),
                co.get("site", ""), co.get("job_number", ""),
                co.get("checkout_time", "")[:10], co.get("status", "").title()
            ])
        if len(data) > 1:
            table = Table(data, colWidths=[60, 80, 80, 60, 70, 60], repeatRows=1)
            table.setStyle(table_header_style)
            elements.append(table)
        else:
            elements.append(Paragraph("No checkout activity in this period.", styles['Normal']))

        handovers = await db.handovers.find(company_filter(current_user, {"timestamp": {"$gte": since}}), {"_id": 0}).to_list(1000)
        elements.append(Spacer(1, 10))
        elements.append(Paragraph("Handovers", ParagraphStyle('SubHead', parent=styles['Heading3'], fontSize=11, spaceBefore=10)))
        data = [["Tool", "From", "To", "Job", "Date"]]
        for ho in handovers:
            data.append([
                ho.get("tool_asset_id", ""), ho.get("from_user_name", ""),
                ho.get("to_user_name", ""), ho.get("job_number", ""),
                ho.get("timestamp", "")[:10]
            ])
        if len(data) > 1:
            table = Table(data, colWidths=[70, 90, 90, 70, 80], repeatRows=1)
            table.setStyle(table_header_style)
            elements.append(table)
        else:
            elements.append(Paragraph("No handover activity in this period.", styles['Normal']))

    elif report_type == "overdue":
        elements.append(Paragraph("Overdue Tools Report", section_style))
        now_str = now.isoformat()
        overdue = await db.checkouts.find(
            company_filter(current_user, {"status": "active", "expected_return_date": {"$lt": now_str}}), {"_id": 0}
        ).to_list(500)
        data = [["Tool", "User", "Site", "Job", "Due Date", "Days Overdue"]]
        for co in overdue:
            due = co.get("expected_return_date", "")
            try:
                due_dt = datetime.fromisoformat(due)
                days_over = (now - due_dt).days
            except Exception:
                days_over = "?"
            data.append([
                co.get("tool_asset_id", ""), co.get("checked_out_by_name", ""),
                co.get("site", ""), co.get("job_number", ""),
                due[:10] if due else "-", str(days_over)
            ])
        if len(data) > 1:
            table = Table(data, colWidths=[60, 80, 80, 60, 70, 55], repeatRows=1)
            table.setStyle(table_header_style)
            elements.append(table)
        else:
            elements.append(Paragraph("No overdue tools. All clear!", styles['Normal']))

    doc.build(elements)
    buf.seek(0)
    filename = f"{report_type}_report_{now.strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# --- Categories CRUD ---
class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = ""

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

@api_router.get("/categories")
async def get_categories(current_user: dict = Depends(auth_dependency)):
    cats = await db.categories.find(company_filter(current_user), {"_id": 0}).to_list(200)
    if not cats:
        # Fallback: return distinct categories from tools
        tool_cats = await db.tools.distinct("category", company_filter(current_user))
        return [{"id": str(uuid.uuid4()), "name": c, "description": "", "tool_count": 0} for c in tool_cats]
    # Enrich with tool counts
    for cat in cats:
        cat["tool_count"] = await db.tools.count_documents(company_filter(current_user, {"category": cat["name"]}))
    return cats

@api_router.post("/categories")
async def create_category(data: CategoryCreate, current_user: dict = Depends(auth_dependency)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    existing = await db.categories.find_one(company_filter(current_user, {"name": {"$regex": f"^{data.name}$", "$options": "i"}}))
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    cat_id = str(uuid.uuid4())
    doc = {
        "id": cat_id,
        "name": data.name,
        "description": data.description or "",
        "company_id": current_company_id(current_user),
        "company_name": current_user.get("company_name") or DEFAULT_COMPANY_NAME,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.categories.insert_one(doc)
    return {"id": cat_id, "name": data.name, "description": data.description or "", "tool_count": 0}

@api_router.put("/categories/{cat_id}")
async def update_category(cat_id: str, data: CategoryUpdate, current_user: dict = Depends(auth_dependency)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    old_cat = await db.categories.find_one(company_filter(current_user, {"id": cat_id}), {"_id": 0})
    if not old_cat:
        raise HTTPException(status_code=404, detail="Category not found")
    update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.categories.update_one(company_filter(current_user, {"id": cat_id}), {"$set": update_dict})
    # If name changed, update all tools with old category name
    if "name" in update_dict and old_cat:
        await db.tools.update_many(company_filter(current_user, {"category": old_cat["name"]}), {"$set": {"category": update_dict["name"]}})
    cat = await db.categories.find_one(company_filter(current_user, {"id": cat_id}), {"_id": 0})
    if cat:
        cat["tool_count"] = await db.tools.count_documents(company_filter(current_user, {"category": cat["name"]}))
    return cat

@api_router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, current_user: dict = Depends(auth_dependency)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    cat = await db.categories.find_one(company_filter(current_user, {"id": cat_id}), {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    tool_count = await db.tools.count_documents(company_filter(current_user, {"category": cat["name"]}))
    if tool_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete: {tool_count} tools use this category. Reassign them first.")
    await db.categories.delete_one(company_filter(current_user, {"id": cat_id}))
    return {"status": "deleted"}

# --- Compliance Certificates ---
NZ_CERT_TYPES = [
    "Annual Inspection", "Load Test Certificate", "Electrical Test & Tag",
    "Scaffold Inspection", "Pressure Vessel WOF", "Fall Arrest Inspection",
    "Crane Certificate", "Hoist Certificate", "Forklift Inspection",
    "Fire Extinguisher Service", "First Aid Kit Inspection", "Other"
]

NZ_STANDARDS = [
    "AS/NZS 1418 (Cranes)", "AS/NZS 3012 (Electrical)", "AS/NZS 1576 (Scaffolding)",
    "AS/NZS 1891 (Fall Arrest)", "NZS 3910 (Construction)", "WorkSafe NZ PCBU",
    "MBIE Regulations", "Other"
]

@api_router.get("/certificates/types")
async def get_cert_types(current_user: dict = Depends(auth_dependency)):
    return {"types": NZ_CERT_TYPES, "standards": NZ_STANDARDS}

@api_router.get("/certificates")
async def list_certificates(
    tool_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(auth_dependency)
):
    query = company_filter(current_user)
    if tool_id:
        query["tool_id"] = tool_id
    now_str = datetime.now(timezone.utc).isoformat()
    certs = await db.certificates.find(query, {"_id": 0}).sort("expiry_date", 1).to_list(1000)
    # Compute status for each cert
    for c in certs:
        exp = c.get("expiry_date", "")
        if exp and exp < now_str:
            c["status"] = "expired"
        elif exp and exp < (datetime.now(timezone.utc) + timedelta(days=30)).isoformat():
            c["status"] = "expiring_soon"
        else:
            c["status"] = "valid"
    if status:
        certs = [c for c in certs if c["status"] == status]
    return certs

@api_router.post("/certificates")
async def create_certificate(data: CertificateCreate, current_user: dict = Depends(auth_dependency)):
    if current_user["role"] not in ["admin", "site_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    tool = await db.tools.find_one(company_filter(current_user, {"id": data.tool_id}), {"_id": 0})
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    cert_id = str(uuid.uuid4())
    doc = {
        "id": cert_id,
        "company_id": current_company_id(current_user),
        "company_name": current_user.get("company_name") or DEFAULT_COMPANY_NAME,
        "tool_id": data.tool_id,
        "tool_asset_id": tool["asset_id"],
        "tool_description": tool["description"],
        "certificate_type": data.certificate_type,
        "certificate_number": data.certificate_number or "",
        "issuer_name": data.issuer_name,
        "issuer_company": data.issuer_company or "",
        "issuer_license_number": data.issuer_license_number or "",
        "nz_standard": data.nz_standard or "",
        "issue_date": data.issue_date,
        "expiry_date": data.expiry_date,
        "notes": data.notes or "",
        "document_url": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["user_id"]
    }
    await db.certificates.insert_one(doc)
    await log_audit(data.tool_id, "certificate_added", current_user["user_id"], current_user["name"],
                    f"Certificate added: {data.certificate_type} (expires {data.expiry_date})")
    # Check if any certs are expired and flag tool
    await update_tool_compliance_status(data.tool_id, current_user)
    doc.pop("_id", None)
    return doc

@api_router.put("/certificates/{cert_id}")
async def update_certificate(cert_id: str, data: CertificateUpdate, current_user: dict = Depends(auth_dependency)):
    if current_user["role"] not in ["admin", "site_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    cert_query = company_filter(current_user, {"id": cert_id})
    result = await db.certificates.update_one(cert_query, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Certificate not found")
    cert = await db.certificates.find_one(cert_query, {"_id": 0})
    if cert:
        await update_tool_compliance_status(cert["tool_id"], current_user)
    return cert

@api_router.delete("/certificates/{cert_id}")
async def delete_certificate(cert_id: str, current_user: dict = Depends(auth_dependency)):
    if current_user["role"] not in ["admin", "site_manager"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    cert_query = company_filter(current_user, {"id": cert_id})
    cert = await db.certificates.find_one(cert_query, {"_id": 0})
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    await db.certificates.delete_one(cert_query)
    await update_tool_compliance_status(cert["tool_id"], current_user)
    return {"status": "deleted"}

@api_router.post("/certificates/{cert_id}/document")
async def upload_cert_document(cert_id: str, file: UploadFile = File(...), current_user: dict = Depends(auth_dependency)):
    cert_query = company_filter(current_user, {"id": cert_id})
    cert = await db.certificates.find_one(cert_query, {"_id": 0})
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"]
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only PDF, JPEG, PNG, or WebP accepted")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "pdf"
    filename = f"cert_{cert_id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = UPLOADS_DIR / filename
    with open(filepath, "wb") as f:
        f.write(content)
    doc_url = f"/api/uploads/{filename}"
    await db.certificates.update_one(cert_query, {"$set": {"document_url": doc_url}})
    return {"document_url": doc_url}

async def update_tool_compliance_status(tool_id: str, current_user: dict = None):
    """Check all certs for a workspace tool. If any expired, flag tool as non-compliant."""
    now_str = datetime.now(timezone.utc).isoformat()
    tool_query = company_filter(current_user, {"id": tool_id}) if current_user else {"id": tool_id}
    tool = await db.tools.find_one(tool_query, {"_id": 0})
    if not tool:
        return
    tool_company_id = normalise_company_id(tool.get("company_id"))
    scoped_tool_query = {"id": tool_id, "company_id": tool_company_id}
    expired_certs = await db.certificates.count_documents({
        "company_id": tool_company_id, "tool_id": tool_id, "expiry_date": {"$lt": now_str}
    })
    if expired_certs > 0 and tool["status"] != "checked_out":
        await db.tools.update_one(scoped_tool_query, {"$set": {
            "status": "maintenance_required",
            "notes": f"Non-compliant: {expired_certs} expired certificate(s)",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }})
    elif expired_certs == 0 and tool["status"] == "maintenance_required" and "expired certificate" in (tool.get("notes") or "").lower():
        await db.tools.update_one(scoped_tool_query, {"$set": {
            "status": "available",
            "notes": "",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }})

# --- Checkout / Return ---
@api_router.post("/bulk-checkout")
async def bulk_checkout(data: BulkCheckout, current_user: dict = Depends(auth_dependency)):
    results = {"success": [], "failed": []}
    for tool_id in data.tool_ids:
        tool = await db.tools.find_one(company_filter(current_user, {"id": tool_id}), {"_id": 0})
        if not tool:
            results["failed"].append({"tool_id": tool_id, "reason": "Not found"})
            continue
        if tool["status"] != "available":
            results["failed"].append({"tool_id": tool_id, "asset_id": tool["asset_id"], "reason": f"Status: {tool['status']}"})
            continue
        checkout_id = str(uuid.uuid4())
        doc = {
            "id": checkout_id,
            "company_id": current_company_id(current_user),
            "company_name": current_user.get("company_name") or DEFAULT_COMPANY_NAME,
            "tool_id": tool_id,
            "tool_asset_id": tool["asset_id"],
            "tool_description": tool["description"],
            "checked_out_by_id": current_user["user_id"],
            "checked_out_by_name": current_user["name"],
            "job_number": data.job_number,
            "site": data.site,
            "site_manager": data.site_manager,
            "expected_return_date": data.expected_return_date,
            "notes": data.notes or "",
            "checkout_time": datetime.now(timezone.utc).isoformat(),
            "return_time": None,
            "return_condition": None,
            "return_notes": None,
            "status": "active"
        }
        await db.checkouts.insert_one(doc)
        await db.tools.update_one(company_filter(current_user, {"id": tool_id}), {"$set": {
            "status": "checked_out",
            "current_holder_id": current_user["user_id"],
            "current_holder_name": current_user["name"],
            "current_site": data.site,
            "current_job": data.job_number,
            "expected_return_date": data.expected_return_date,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }})
        await log_audit(tool_id, "checkout", current_user["user_id"], current_user["name"],
                        f"Bulk checkout for job {data.job_number} at {data.site}")
        results["success"].append({"tool_id": tool_id, "asset_id": tool["asset_id"]})
    return results

@api_router.post("/bulk-return")
async def bulk_return(data: BulkReturn, current_user: dict = Depends(auth_dependency)):
    results = {"success": [], "failed": []}
    for tool_id in data.tool_ids:
        tool = await db.tools.find_one(company_filter(current_user, {"id": tool_id}), {"_id": 0})
        if not tool:
            results["failed"].append({"tool_id": tool_id, "reason": "Not found"})
            continue
        if tool["status"] != "checked_out":
            results["failed"].append({"tool_id": tool_id, "asset_id": tool.get("asset_id",""), "reason": "Not checked out"})
            continue
        checkout = await db.checkouts.find_one(company_filter(current_user, {"tool_id": tool_id, "status": "active"}), {"_id": 0})
        if checkout:
            await db.checkouts.update_one(company_filter(current_user, {"id": checkout["id"]}), {"$set": {
                "return_time": datetime.now(timezone.utc).isoformat(),
                "return_condition": data.condition,
                "return_notes": data.notes or "",
                "status": "returned"
            }})
        new_status = "available" if data.condition != "damaged" else "maintenance_required"
        await db.tools.update_one(company_filter(current_user, {"id": tool_id}), {"$set": {
            "status": new_status,
            "condition": data.condition,
            "current_holder_id": None,
            "current_holder_name": None,
            "current_site": None,
            "current_job": None,
            "expected_return_date": None,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }})
        await log_audit(tool_id, "return", current_user["user_id"], current_user["name"],
                        f"Bulk return in {data.condition} condition")
        results["success"].append({"tool_id": tool_id, "asset_id": tool["asset_id"]})
    return results

# --- Calendar Events ---
@api_router.get("/calendar/events")
async def get_calendar_events(current_user: dict = Depends(auth_dependency)):
    events = []
    # Maintenance dates
    tools = await db.tools.find(company_filter(current_user, {"next_maintenance_date": {"$ne": None}}), {"_id": 0}).to_list(1000)
    for t in tools:
        if t.get("next_maintenance_date"):
            events.append({
                "id": f"maint_{t['id']}",
                "title": f"Maintenance: {t['asset_id']}",
                "date": t["next_maintenance_date"][:10],
                "type": "maintenance",
                "tool_id": t["id"],
                "description": t["description"]
            })
    # Safety tag expiry
    tools_tags = await db.tools.find(company_filter(current_user, {"safety_tag_expiry": {"$ne": None}}), {"_id": 0}).to_list(1000)
    for t in tools_tags:
        if t.get("safety_tag_expiry"):
            events.append({
                "id": f"tag_{t['id']}",
                "title": f"Tag Expiry: {t['asset_id']}",
                "date": t["safety_tag_expiry"][:10],
                "type": "tag_expiry",
                "tool_id": t["id"],
                "description": t["description"]
            })
    # Certificate expiries
    certs = await db.certificates.find(company_filter(current_user), {"_id": 0}).to_list(1000)
    for c in certs:
        if c.get("expiry_date"):
            events.append({
                "id": f"cert_{c['id']}",
                "title": f"Cert Expiry: {c['tool_asset_id']} - {c['certificate_type']}",
                "date": c["expiry_date"][:10],
                "type": "certificate_expiry",
                "tool_id": c["tool_id"],
                "description": f"{c['certificate_type']} #{c.get('certificate_number','')}"
            })
    # Expected returns
    active = await db.checkouts.find(company_filter(current_user, {"status": "active"}), {"_id": 0}).to_list(1000)
    for co in active:
        if co.get("expected_return_date"):
            events.append({
                "id": f"return_{co['id']}",
                "title": f"Due Back: {co['tool_asset_id']}",
                "date": co["expected_return_date"][:10],
                "type": "expected_return",
                "tool_id": co["tool_id"],
                "description": f"Held by {co['checked_out_by_name']}"
            })
    events.sort(key=lambda e: e["date"])
    return events

# --- Health Check ---
@api_router.get("/health")
async def health():
    return {"status": "healthy"}

# --- Email Notification Helper ---
async def send_notification_email(to_email: str, subject: str, html_content: str, company_id: str = None, settings: dict = None):
    """Send email using workspace-configured SendGrid settings. Returns True on success."""
    target_company_id = normalise_company_id(company_id) if company_id else DEFAULT_COMPANY_ID
    if settings is None:
        settings = await db.settings.find_one({"id": "app_settings", "company_id": target_company_id}, {"_id": 0})
    if not settings or not settings.get("email_api_key") or not settings.get("sender_email"):
        return False
    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail
        message = Mail(
            from_email=settings["sender_email"],
            to_emails=to_email,
            subject=subject,
            html_content=html_content
        )
        sg = SendGridAPIClient(settings["email_api_key"])
        response = sg.send(message)
        logger.info(f"Email sent to {to_email}: {subject} (status={response.status_code})")
        return response.status_code == 202
    except Exception as e:
        logger.error(f"Email send failed to {to_email}: {e}")
        return False

# --- Background: Check Expiries & Send Emails ---
async def check_expiries():
    now = datetime.now(timezone.utc)
    now_str = now.isoformat()

    settings_rows = await db.settings.find({"id": "app_settings"}, {"_id": 0}).to_list(500)
    users_for_company_map = await db.users.find({"is_active": True}, {"_id": 0, "company_id": 1, "company_name": 1}).to_list(1000)

    company_names = {}
    for user in users_for_company_map:
        company_id = normalise_company_id(user.get("company_id"))
        company_names[company_id] = user.get("company_name") or company_names.get(company_id) or DEFAULT_COMPANY_NAME

    settings_by_company = {}
    for settings in settings_rows:
        company_id = normalise_company_id(settings.get("company_id"))
        settings_by_company[company_id] = settings
        company_names[company_id] = settings.get("company_name") or company_names.get(company_id) or DEFAULT_COMPANY_NAME

    company_ids = sorted(set(company_names.keys()) | set(settings_by_company.keys()) | {DEFAULT_COMPANY_ID})

    for company_id in company_ids:
        company_name = company_names.get(company_id) or DEFAULT_COMPANY_NAME
        settings = settings_by_company.get(company_id) or {
            "company_id": company_id,
            "company_name": company_name,
            "notify_days_before": 14,
            "notify_tag_expiry": True,
            "notify_overdue": True
        }

        notify_days = settings.get("notify_days_before", 14)
        notify_tag = settings.get("notify_tag_expiry", True)
        notify_overdue_pref = settings.get("notify_overdue", True)
        company_name = settings.get("company_name") or company_name or "Tool Tracker"

        ahead = (now + timedelta(days=notify_days)).isoformat()
        admins = await db.users.find({"company_id": company_id, "role": "admin", "is_active": True}, {"_id": 0}).to_list(50)

        # Expiring safety tags
        if notify_tag and admins:
            expiring = await db.tools.find({
                "company_id": company_id,
                "safety_tag_expiry": {"$ne": None, "$lte": ahead, "$gte": now_str}
            }, {"_id": 0}).to_list(500)
            for tool in expiring:
                for admin in admins:
                    existing = await db.notifications.find_one({
                        "company_id": company_id,
                        "tool_id": tool["id"], "type": "tag_expiry",
                        "created_at": {"$gte": (now - timedelta(days=1)).isoformat()}
                    })
                    if not existing:
                        msg = f"Safety tag expiring for {tool['asset_id']}: {tool['description']}"
                        await create_notification(admin["id"], "tag_expiry", msg, tool["id"], company_id=company_id, company_name=company_name)
                        await send_notification_email(
                            admin.get("email", ""),
                            f"[{company_name}] Safety Tag Expiring - {tool['asset_id']}",
                            f"<h2>Safety Tag Expiry Warning</h2>"
                            f"<p>Tool <strong>{tool['asset_id']}</strong> ({tool['description']}) has a safety tag expiring on "
                            f"<strong>{tool['safety_tag_expiry']}</strong>.</p>"
                            f"<p>Please arrange for inspection or renewal.</p>"
                            f"<hr><p style='color:#999;font-size:12px'>{company_name} - Tool Tracker</p>",
                            company_id=company_id,
                            settings=settings
                        )

        # Overdue returns
        if notify_overdue_pref:
            overdue_checkouts = await db.checkouts.find({
                "company_id": company_id,
                "status": "active", "expected_return_date": {"$lt": now_str}
            }, {"_id": 0}).to_list(500)
            for co in overdue_checkouts:
                existing = await db.notifications.find_one({
                    "company_id": company_id,
                    "tool_id": co["tool_id"], "type": "overdue",
                    "created_at": {"$gte": (now - timedelta(days=1)).isoformat()}
                })
                if not existing:
                    msg = f"Tool {co['tool_asset_id']} overdue - held by {co['checked_out_by_name']}"
                    for admin in admins:
                        await create_notification(admin["id"], "overdue", msg, co["tool_id"], company_id=company_id, company_name=company_name)
                        await send_notification_email(
                            admin.get("email", ""),
                            f"[{company_name}] Overdue Tool - {co['tool_asset_id']}",
                            f"<h2>Overdue Tool Return</h2>"
                            f"<p>Tool <strong>{co['tool_asset_id']}</strong> ({co.get('tool_description','')}) is overdue for return.</p>"
                            f"<p>Currently held by: <strong>{co['checked_out_by_name']}</strong><br>"
                            f"Expected return: <strong>{co['expected_return_date']}</strong><br>"
                            f"Site: {co.get('site','-')} | Job: {co.get('job_number','-')}</p>"
                            f"<hr><p style='color:#999;font-size:12px'>{company_name} - Tool Tracker</p>",
                            company_id=company_id,
                            settings=settings
                        )
                    # Also notify the holder
                    holder = await db.users.find_one({"id": co["checked_out_by_id"], "company_id": company_id}, {"_id": 0})
                    if holder:
                        await create_notification(
                            co["checked_out_by_id"], "overdue",
                            f"Your tool {co['tool_asset_id']} is overdue for return!", co["tool_id"],
                            company_id=company_id, company_name=company_name
                        )
                        await send_notification_email(
                            holder.get("email", ""),
                            f"[{company_name}] Your Tool is Overdue - {co['tool_asset_id']}",
                            f"<h2>Tool Return Overdue</h2>"
                            f"<p>Tool <strong>{co['tool_asset_id']}</strong> was due back on <strong>{co['expected_return_date']}</strong>.</p>"
                            f"<p>Please return it as soon as possible or contact your site manager.</p>"
                            f"<hr><p style='color:#999;font-size:12px'>{company_name} - Tool Tracker</p>",
                            company_id=company_id,
                            settings=settings
                        )

        # Expiring certificates
        if admins:
            expiring_certs = await db.certificates.find({
                "company_id": company_id,
                "expiry_date": {"$lte": ahead, "$gte": now_str}
            }, {"_id": 0}).to_list(500)
            for cert in expiring_certs:
                for admin in admins:
                    existing = await db.notifications.find_one({
                        "company_id": company_id,
                        "tool_id": cert.get("tool_id"), "type": "cert_expiry",
                        "created_at": {"$gte": (now - timedelta(days=1)).isoformat()}
                    })
                    if not existing:
                        msg = f"Certificate expiring: {cert['certificate_type']} for {cert.get('tool_asset_id','')} (expires {cert['expiry_date'][:10]})"
                        await create_notification(admin["id"], "cert_expiry", msg, cert.get("tool_id"), company_id=company_id, company_name=company_name)
                        await send_notification_email(
                            admin.get("email", ""),
                            f"[{company_name}] Certificate Expiring - {cert.get('tool_asset_id','')}",
                            f"<h2>Certificate Expiry Warning</h2>"
                            f"<p><strong>{cert['certificate_type']}</strong> for tool <strong>{cert.get('tool_asset_id','')}</strong> "
                            f"expires on <strong>{cert['expiry_date'][:10]}</strong>.</p>"
                            f"<p>Inspector: {cert.get('issuer_name','')} | License: {cert.get('issuer_license_number','N/A')}</p>"
                            f"<p>Please arrange renewal to maintain compliance.</p>"
                            f"<hr><p style='color:#999;font-size:12px'>{company_name} - Tool Tracker</p>",
                            company_id=company_id,
                            settings=settings
                        )

        # Auto-flag tools with expired certificates
        expired_certs = await db.certificates.find({
            "company_id": company_id,
            "expiry_date": {"$lt": now_str}
        }, {"_id": 0}).to_list(500)
        flagged_tools = set()
        worker_user = {"company_id": company_id, "company_name": company_name}
        for cert in expired_certs:
            tid = cert.get("tool_id")
            if tid and tid not in flagged_tools:
                flagged_tools.add(tid)
                await update_tool_compliance_status(tid, worker_user)

# --- Periodic Background Scheduler ---
async def periodic_expiry_check():
    """Run expiry/overdue checks every hour."""
    while True:
        await asyncio.sleep(3600)  # 1 hour
        try:
            logger.info("Running periodic expiry/overdue check...")
            await check_expiries()
            logger.info("Periodic check completed.")
        except Exception as e:
            logger.error(f"Periodic expiry check failed: {e}")

@app.on_event("startup")
async def startup_tasks():
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.users.create_index("company_id")
    await db.users.update_many(
        {"company_id": {"$exists": False}},
        {"$set": {"company_id": DEFAULT_COMPANY_ID, "company_name": DEFAULT_COMPANY_NAME}}
    )
    await db.tools.create_index("id", unique=True)
    await db.tools.create_index("asset_id", unique=True)
    await db.tools.create_index("status")
    await db.tools.create_index("company_id")
    await db.categories.create_index("company_id")
    await db.audit_log.create_index("company_id")
    for collection_name in ["tools", "categories", "audit_log", "checkouts", "handovers", "maintenance_actions", "notifications", "settings", "certificates"]:
        await db[collection_name].update_many(
            {"company_id": {"$exists": False}},
            {"$set": {"company_id": DEFAULT_COMPANY_ID, "company_name": DEFAULT_COMPANY_NAME}}
        )
    await db.checkouts.create_index("company_id")
    await db.checkouts.create_index("tool_id")
    await db.checkouts.create_index("status")
    await db.handovers.create_index("company_id")
    await db.maintenance_actions.create_index("company_id")
    await db.notifications.create_index("company_id")
    await db.notifications.create_index("user_id")
    await db.settings.create_index("company_id")
    await db.audit_log.create_index("tool_id")
    await db.certificates.create_index("company_id")
    await db.certificates.create_index("tool_id")
    await db.certificates.create_index("expiry_date")
    # Check expiries on startup
    # Seed / repair configured admin
    admin_email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    admin_name = os.environ.get("ADMIN_NAME", "Admin").strip() or "Admin"

    if admin_email and admin_password:
        existing = await db.users.find_one({"email": admin_email})

        if existing is None:
            admin_user_id = str(uuid.uuid4())
            await db.users.insert_one({
                "id": admin_user_id,
                "email": admin_email,
                "password": hash_password(admin_password),
                "name": admin_name,
                "role": "admin",
                "company_id": DEFAULT_COMPANY_ID,
                "company_name": DEFAULT_COMPANY_NAME,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "is_active": True
            })
            logger.info(f"Configured Tool Tracker admin user created: {admin_email}")
        else:
            update_data = {
                "email": admin_email,
                "name": existing.get("name") or admin_name,
                "role": "admin",
                "is_active": True,
                "company_id": existing.get("company_id") or DEFAULT_COMPANY_ID,
                "company_name": existing.get("company_name") or DEFAULT_COMPANY_NAME
            }

            if not existing.get("password") or not verify_password(admin_password, existing["password"]):
                update_data["password"] = hash_password(admin_password)

            await db.users.update_one(
                {"_id": existing["_id"]},
                {"$set": update_data}
            )
            logger.info(f"Configured Tool Tracker admin user repaired: {admin_email}")
    try:
        await check_expiries()
    except Exception as e:
        logger.error(f"Expiry check failed: {e}")
    # Launch periodic background task
    asyncio.create_task(periodic_expiry_check())
    logger.info("Periodic expiry checker started (every 1 hour)")

app.include_router(api_router)

# Mount uploads directory for serving tool photos
app.mount("/api/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
