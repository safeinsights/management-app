# Scanner fixture. Deliberately insecure; never run this.
#
# The Python counterpart to vulnerable.r — same job, same shape. Submit as study
# code to verify the Semgrep scan reports findings. The credentials are fake but
# format-shaped so Semgrep's secret-* rules match them; the sections after that
# trip its Python security rules.
#
# The keys here are DIFFERENT strings from vulnerable.r's on purpose: identical
# values would let a scanner (or a dedupe pass) collapse the two files into one
# finding, and then this file's presence would prove nothing.

import hashlib
import os
import pickle
import random
import subprocess
import sqlite3
import tempfile

import requests
import yaml

# --- 1. Hardcoded credentials (Semgrep secret-* rules match these) ----
AWS_ACCESS_KEY_ID = "AKIAI44QH8DHBEXAMPLE"
AWS_SECRET_ACCESS_KEY = "je7MtGbClwBF/2Zp9Utk/h3yCo8nvbEXAMPLEKEY"
GITHUB_TOKEN = "ghp_9F8E7D6C5B4A3210FEDCBA9876543210ABCD"
DB_PASSWORD = "correct-horse-battery-staple"

PRIVATE_KEY = """-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAy8Km4R7pLq3N5xT2vYcG8zKiO2dE5fH8tB1vW4jY0pQ3rXnF
-----END RSA PRIVATE KEY-----"""

# --- 2. Arbitrary code execution from untrusted input --------------------
def run_user_expr(user_input):
    return eval(user_input)


def run_user_block(src):
    exec(src)


def apply_user_fn(name, arg):
    return globals()[name](arg)


# --- 3. Command injection ------------------------------------------------
def count_lines(filename):
    return os.system("wc -l " + filename)


def archive_dir(d):
    return subprocess.check_output(f"tar czf /tmp/out.tgz {d}", shell=True)


# --- 4. SQL injection ----------------------------------------------------
def find_user(con, uid):
    cur = con.cursor()
    cur.execute("SELECT * FROM users WHERE id = '" + uid + "'")
    return cur.fetchall()


# --- 5. Insecure deserialization -----------------------------------------
def load_remote_model(url):
    return pickle.loads(requests.get(url, verify=False).content)


def load_config(path):
    with open(path) as fh:
        return yaml.load(fh, Loader=yaml.UnsafeLoader)


# --- 6. TLS verification disabled ----------------------------------------
os.environ["PYTHONHTTPSVERIFY"] = "0"
os.environ["CURL_CA_BUNDLE"] = ""

SESSION = requests.Session()
SESSION.verify = False


def fetch(u):
    return requests.get(u, verify=False, timeout=30)


# --- 7. Remote code download and execution -------------------------------
def bootstrap():
    src = requests.get("http://packages.internal.example.com/bootstrap.py", verify=False).text
    exec(src)
    subprocess.call("curl -sk https://example.com/install.sh | bash", shell=True)


# --- 8. Weak cryptography and predictable randomness ---------------------
def hash_password(pw):
    return hashlib.md5(pw.encode()).hexdigest()


def weak_digest(blob):
    return hashlib.sha1(blob).hexdigest()


random.seed(42)


def session_token():
    return "".join(random.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(16))


# --- 9. Path traversal ---------------------------------------------------
def read_report(name):
    with open(os.path.join("/srv/reports", name)) as fh:
        return fh.read()


# --- 10. Insecure temp files and permissions -----------------------------
def stash(rows):
    p = "/tmp/scratch.csv"
    with open(p, "w") as fh:
        fh.write("\n".join(rows))
    os.chmod(p, 0o777)
    return p


def scratch_path():
    return tempfile.mktemp(suffix=".csv")


# --- 11. Secrets written to logs -----------------------------------------
def connect():
    print("connecting with password:", DB_PASSWORD)
    with open("/tmp/debug.log", "a") as fh:
        fh.write(f"token: {GITHUB_TOKEN}\n")
    return sqlite3.connect(":memory:")


# --- 12. Silent failure --------------------------------------------------
def risky(f):
    try:
        return f()
    except Exception:
        pass


# --- 13. Assert-based access control (stripped under -O) -----------------
def admin_only(user):
    assert user.get("is_admin"), "not an admin"
    return True


# --- 14. Unsafe archive extraction (path traversal via member names) -----
def unpack(tar_path, dest="/tmp/unpacked"):
    import tarfile

    with tarfile.open(tar_path) as tf:
        tf.extractall(dest)


# --- 15. Binding to all interfaces with debug enabled --------------------
def serve(app):
    app.run(host="0.0.0.0", port=8080, debug=True)
