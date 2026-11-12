"""Smoke test of the Reclamation Service in the shared Docker environment (standard library only).

Run it INSIDE the container, nothing to install on the machine:
    docker compose exec reclamation-service python docker/smoke_test.py
It uses the test accounts of the imported realm (etudiant1 / enseignant1 / admin1, see
keycloak/campushub-realm.json) and calls the service THROUGH the API Gateway, like the frontend.
Everything it creates (one reclamation, one conversation, the Notification it triggers) is deleted
at the end. Exit code 0 = every required check passed; "WARN" lines are optional parts (Course,
Notification) that depend on other services.

Tokens are requested from keycloak:8080 with the Host header of the browser-side address
(localhost:8180), so their issuer is the one every service expects (KEYCLOAK_ISSUER_URI).
"""

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

GATEWAY = os.environ.get("SMOKE_GATEWAY_URL", "http://api-gateway:8080").rstrip("/")
BASE = GATEWAY + "/api/v1/reclamation"
KEYCLOAK = os.environ.get("SMOKE_KEYCLOAK_URL", "http://keycloak:8080").rstrip("/")
ISSUER = os.environ.get("KEYCLOAK_ISSUER_URI", "http://localhost:8180/realms/campushub")
EUREKA = os.environ.get("SMOKE_EUREKA_URL", "http://eureka-server:8761").rstrip("/")
PASSWORD = os.environ.get("SMOKE_PASSWORD", "Test1234!")
# What the service itself is configured with (the container's own environment)
HOST = os.environ.get("EUREKA_INSTANCE_HOST", "reclamation-service")
PORT = os.environ.get("EUREKA_INSTANCE_PORT", os.environ.get("PORT", "8087"))
PUBLIC = os.environ.get("PUBLIC_API_URL", "http://localhost:8080/api/v1/reclamation").rstrip("/")
USERS = {"student": os.environ.get("SMOKE_STUDENT", "etudiant1"),
         "teacher": os.environ.get("SMOKE_TEACHER", "enseignant1"),
         "admin": os.environ.get("SMOKE_ADMIN", "admin1")}
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
FAILED, WARNED = [], []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""), flush=True)
    if not ok:
        FAILED.append(name)
    return ok


def warn(name, detail=""):
    print(f"WARN {name}" + (f"  [{detail}]" if detail else ""), flush=True)
    WARNED.append(name)


def http(method, url, token=None, body=None, ctype=None, headers=None, timeout=30):
    h = dict(headers or {})
    if token:
        h["Authorization"] = "Bearer " + token
    if isinstance(body, (dict, list)):
        body, ctype = json.dumps(body).encode(), "application/json"
    if ctype:
        h["Content-Type"] = ctype
    request = urllib.request.Request(url, data=body, method=method, headers=h)
    try:
        with OPENER.open(request, timeout=timeout) as r:
            raw = r.read()
            status = r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read(), e.code
    except OSError as e:
        return 0, {"error": f"{type(e).__name__}: {e}"}
    try:
        return status, json.loads(raw) if raw else None
    except ValueError:
        return status, {"raw": raw[:200].decode("utf-8", "replace")}


def token_for(username):
    issuer = urllib.parse.urlsplit(ISSUER)
    form = urllib.parse.urlencode({"grant_type": "password", "client_id": "campushub-frontend",
                                   "username": username, "password": PASSWORD}).encode()
    status, body = http("POST", f"{KEYCLOAK}{issuer.path}/protocol/openid-connect/token", body=form,
                        ctype="application/x-www-form-urlencoded", headers={"Host": issuer.netloc})
    access = (body or {}).get("access_token")
    if status != 200 or not access:
        return None, f"{status} {body}"
    payload = access.split(".")[1]  # read only to show the issuer; the services verify the signature
    claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    return access, claims


def multipart(field, filename, data):
    boundary = "smoke" + uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{filename}\"\r\n"
            "Content-Type: application/pdf\r\n\r\n").encode() + data + f"\r\n--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def main():
    print(f"Gateway {GATEWAY} | Keycloak {KEYCLOAK} (issuer {ISSUER}) | Eureka {EUREKA}\n")
    status, body = http("GET", f"{EUREKA}/eureka/apps/RECLAMATION-SERVICE", headers={"Accept": "application/json"})
    instances = (body or {}).get("application", {}).get("instance", []) if status == 200 else []
    instances = instances if isinstance(instances, list) else [instances]
    check(f"Eureka lists RECLAMATION-SERVICE UP as {HOST}:{PORT}",
          any(i.get("status") == "UP" and i.get("hostName") == HOST
              and str(i.get("port", {}).get("$")) == str(PORT) for i in instances), f"{status} {instances[:1]}")

    tokens = {}
    for role, username in USERS.items():
        access, claims = token_for(username)
        if check(f"Keycloak token for {username}", access is not None, str(claims)[:200]):
            check(f"its issuer is {ISSUER}", claims.get("iss") == ISSUER, claims.get("iss"))
            tokens[role] = access
    if len(tokens) < 3:
        return finish()
    student, teacher, admin = tokens["student"], tokens["teacher"], tokens["admin"]

    status, body = http("GET", f"{BASE}/health", student)
    check("GET /api/v1/reclamation/health through the Gateway -> 200 UP",
          status == 200 and (body or {}).get("status") == "UP", f"{status} {body}")
    status, _ = http("GET", f"{BASE}/reclamations/")
    check("no token -> 401 (Gateway)", status == 401, str(status))

    reference = f"[smoke-test] {uuid.uuid4().hex[:8]}"
    status, rec = http("POST", f"{BASE}/reclamations/", student,
                       {"category": "other", "subject": reference, "description": "Smoke test, deleted at the end."})
    rid = (rec or {}).get("id")
    check("student creates a reclamation -> 201 (MongoDB)", status == 201 and rid, f"{status} {rec}")
    try:
        if rid:
            status, body = http("GET", f"{BASE}/reclamations/{rid}/", student)
            check("student reads it -> 200", status == 200 and (body or {}).get("subject") == reference, str(status))
            status, body = http("GET", f"{BASE}/reclamations/?ordering=-created_at", student)
            check("student lists it", status == 200 and any(r.get("id") == rid for r in (body or {}).get("results", [])),
                  str(status))
            nxt = (body or {}).get("next")
            check("pagination links (if any) go through the Gateway", nxt is None or nxt.startswith(PUBLIC + "/"),
                  str(nxt))
            status, _ = http("POST", f"{BASE}/reclamations/{rid}/change-status/", student, {"status": "in_progress"})
            check("student cannot change the status -> 403", status == 403, str(status))
        status, _ = http("GET", f"{BASE}/reclamations/", teacher)
        check("teacher cannot use the reclamations API -> 403", status == 403, str(status))
        status, _ = http("GET", f"{BASE}/reclamations/stats/", admin)
        check("admin reads the statistics -> 200", status == 200, str(status))

        pdf, ctype = multipart("file", "smoke.pdf", b"%PDF-1.4 smoke test")
        status, _ = http("POST", f"{BASE}/documents", student, pdf, ctype)
        check("student cannot upload a regulation document -> 403", status == 403, str(status))
        status, _ = http("GET", f"{BASE}/documents", student)
        check("student reads the document list -> 200 (SQLite)", status == 200, str(status))

        status, conv = http("POST", f"{BASE}/conversations", student, {"title": "smoke test"})
        cid = (conv or {}).get("id")
        if check("student creates a private conversation -> 201", status == 201 and cid, f"{status} {conv}"):
            status, _ = http("GET", f"{BASE}/conversations/{cid}", admin)
            check("another user (admin) cannot read it -> 404", status == 404, str(status))
            status, _ = http("DELETE", f"{BASE}/conversations/{cid}", student)
            check("student deletes it -> 204", status == 204, str(status))

        status, body = http("POST", f"{BASE}/reclamations/", student,
                            {"category": "grade", "subject": reference + " course",
                             "description": "Smoke test: unknown course, never saved.", "course_id": 2147483000})
        if status == 404:
            print("PASS Course reached over the Docker network: unknown course -> 404, nothing saved")
        elif status == 503:
            warn("Course Service unavailable -> 503 (nothing saved): is course-service running?", str(body))
        elif status == 401:
            warn("Course refused the Keycloak token -> 401: Course must run with KEYCLOAK_ISSUER_URI", str(body))
        else:
            warn(f"unexpected answer for an unknown course: {status}", str(body))
            if status == 201 and (body or {}).get("id"):
                http("DELETE", f"{BASE}/reclamations/{body['id']}/", student)

        if rid:
            note = None
            for _ in range(20):  # the event is asynchronous: RabbitMQ -> notification-consumer
                status, body = http("GET", f"{GATEWAY}/api/v1/notifications", admin)
                note = next((n for n in (body or {}).get("data", []) or []
                             if (n.get("data") or {}).get("reclamationId") == rid), None)
                if note:
                    break
                time.sleep(1)
            if note:
                print("PASS Notification created the administrator notification (RabbitMQ reclamation.created)")
                http("DELETE", f"{GATEWAY}/api/v1/notifications/{note['id']}", admin)
            else:
                warn("no administrator notification within 20 s: check notification-consumer, "
                     "RECLAMATION_EVENTS_ENABLED and RECLAMATION_ADMIN_IDS (docker compose logs notification-consumer)")
    finally:
        if rid:
            status, _ = http("DELETE", f"{BASE}/reclamations/{rid}/", student)
            check("cleanup: student deletes the test reclamation -> 204", status == 204, str(status))
    return finish()


def finish():
    print(f"\n{'OK' if not FAILED else 'FAILED'}: {len(FAILED)} failed, {len(WARNED)} warning(s)")
    for name in FAILED:
        print("  FAILED:", name)
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
