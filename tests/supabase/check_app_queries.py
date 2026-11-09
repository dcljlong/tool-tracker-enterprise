"""Run every .from(table).select(...) string in supabaseApi.js against a local PostgREST,
then do a real check-out / handover / return flow. Usage: python3 check_queries.py <supabaseApi.js>"""
import hmac, hashlib, base64, json, re, sys, time, urllib.request, urllib.parse, urllib.error

BASE = "http://localhost:3999"
SECRET = b"local-test-secret-local-test-secret-123"
UID = "11111111-1111-1111-1111-111111111111"


def b64(d):
    return base64.urlsafe_b64encode(d).rstrip(b"=").decode()


def jwt(sub):
    h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    p = b64(json.dumps({"sub": sub, "role": "authenticated", "exp": int(time.time()) + 3600}).encode())
    s = b64(hmac.new(SECRET, f"{h}.{p}".encode(), hashlib.sha256).digest())
    return f"{h}.{p}.{s}"


TOKEN = jwt(UID)


def call(method, path, body=None, prefer=None):
    req = urllib.request.Request(BASE + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", "application/json")
    if prefer:
        req.add_header("Prefer", prefer)
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read().decode()
            return r.status, json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


src = open(sys.argv[1]).read()
consts = dict(re.findall(r'const (\w+) = "([^"]+)";', src))
pairs = set()
for m in re.finditer(r'\.from\("(tt_\w+)"\)((?:\s*\.\w+\([^()]*(?:\([^()]*\)[^()]*)*\))*)', src):
    table, chain = m.group(1), m.group(2)
    for s in re.findall(r'\.select\(("[^"]*"|\w+)', chain):
        pairs.add((table, consts.get(s, s.strip('"'))))

fails = 0

# seed a company + tool as the signed-in user
st, cid = call("POST", "/rpc/tt_create_company", {"p_name": "Test Co", "p_member_name": "Tester", "p_brand": "long_line"})
assert st == 200, (st, cid)
cid = cid if isinstance(cid, str) else cid.get("id", cid)
st, tool = call("POST", "/tt_tools?select=id", {"company_id": cid, "asset_id": "T-001", "description": "Drill"},
                prefer="return=representation")
assert st == 201, (st, tool)
tool_id = tool[0]["id"]

for table, sel in sorted(pairs):
    st, body = call("GET", f"/{table}?select={urllib.parse.quote(sel)}&limit=1")
    ok = st == 200
    fails += not ok
    print(f"{'OK  ' if ok else 'FAIL'} {table} select={sel[:80]}" + ("" if ok else f"\n     -> {st} {str(body)[:200]}"))

EMBED = "*,tt_tools:tt_tools!tt_checkouts_company_id_tool_id_fkey(asset_id,description)"
flow = []
st, co = call("POST", f"/tt_checkouts?select={urllib.parse.quote(EMBED)}",
              {"company_id": cid, "tool_id": tool_id, "holder_user_id": UID, "holder_name": "pending", "job_number": "4177"},
              prefer="return=representation")
flow.append(("check-out with tool details back", st == 201 and co[0]["tt_tools"]["asset_id"] == "T-001", st, co))
co_id = co[0]["id"] if st == 201 else None
st, t = call("GET", f"/tt_tools?id=eq.{tool_id}&select=status")
flow.append(("tool shows as checked out", st == 200 and t[0]["status"] != "available", st, t))
st, newid = call("POST", "/rpc/tt_hand_over", {"p_checkout": co_id, "p_holder_user": UID, "p_borrower": None,
                                               "p_job": "4009", "p_site_manager": None, "p_notes": "test"})
flow.append(("handover", st == 200, st, newid))
st, r = call("PATCH", f"/tt_checkouts?tool_id=eq.{tool_id}&status=eq.active",
             {"status": "returned", "return_condition": "good", "return_notes": ""}, prefer="return=minimal")
flow.append(("return", st == 204, st, r))
st, t = call("GET", f"/tt_tools?id=eq.{tool_id}&select=status")
flow.append(("tool back to available", st == 200 and t[0]["status"] == "available", st, t))
for name, ok, st, body in flow:
    fails += not ok
    print(f"{'OK  ' if ok else 'FAIL'} flow: {name}" + ("" if ok else f" -> {st} {str(body)[:200]}"))

print(f"\n{len(pairs)} queries + {len(flow)} flow steps, {fails} failed")
sys.exit(1 if fails else 0)
