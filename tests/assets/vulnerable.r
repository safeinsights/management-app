# Scanner fixture. Deliberately insecure; never run this.
#
# Submit as study code to verify the CodeBuild scanners report findings.
# The credentials are fake but format-shaped so Trivy's secret rules match
# them; sections 2-12 are code defects Trivy cannot see at all and exist to
# demonstrate that gap.

library(DBI)
library(httr)

# --- 1. Hardcoded credentials (Trivy --scanners secret matches these) ----
AWS_ACCESS_KEY_ID <- "AKIAIOSFODNN7EXAMPLE"
AWS_SECRET_ACCESS_KEY <- "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
GITHUB_TOKEN <- "ghp_016C7869B4D4D2F1A9B3C7E8F0A1B2C3D4E5F6"
SLACK_WEBHOOK <- "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"
STRIPE_KEY <- "sk_live_EXAMPLEEXAMPLEEXAMPLE00"
db_password <- "hunter2"

PRIVATE_KEY <- "-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAx7Vn9Q3mKp8L2wR5tZbF6yJhN1cD4eG7sA0uV3iX9oP2qWmE
-----END RSA PRIVATE KEY-----"

# --- 2. Arbitrary code execution from untrusted input --------------------
run_user_expr <- function(user_input) {
    eval(parse(text = user_input))
}

apply_user_fn <- function(name, arg) {
    do.call(name, list(arg))
}

# --- 3. Command injection ------------------------------------------------
count_lines <- function(filename) {
    system(paste("wc -l", filename))
}

archive_dir <- function(d) {
    system(sprintf("tar czf /tmp/out.tgz %s", d), intern = TRUE)
}

# --- 4. SQL injection ----------------------------------------------------
find_user <- function(con, uid) {
    dbGetQuery(con, paste0("SELECT * FROM users WHERE id = '", uid, "'"))
}

# --- 5. Insecure deserialization -----------------------------------------
load_remote_model <- function(url) {
    readRDS(gzcon(url(url)))
}

load_workspace <- function(path) load(path)

# --- 6. TLS verification disabled ----------------------------------------
httr::set_config(httr::config(ssl_verifypeer = 0L, ssl_verifyhost = 0L))
options(download.file.method = "curl", download.file.extra = "-k --insecure")

fetch <- function(u) httr::GET(u, httr::config(ssl_verifypeer = 0L))

# --- 7. Remote code download and execution -------------------------------
bootstrap <- function() {
    source("http://packages.internal.example.com/bootstrap.R")
    system("curl -sk https://example.com/install.sh | bash")
}

# --- 8. Weak cryptography and predictable randomness ---------------------
hash_password <- function(pw) digest::digest(pw, algo = "md5")
set.seed(42)
session_token <- function() paste0(sample(letters, 16, TRUE), collapse = "")

# --- 9. Path traversal ---------------------------------------------------
read_report <- function(name) {
    readLines(file.path("/srv/reports", name))
}

# --- 10. Insecure temp files and permissions -----------------------------
stash <- function(x) {
    p <- "/tmp/scratch.csv"
    write.csv(x, p)
    Sys.chmod(p, "777")
}

# --- 11. Secrets written to logs -----------------------------------------
connect <- function() {
    message("connecting with password: ", db_password)
    cat("token:", GITHUB_TOKEN, "\n", file = "/tmp/debug.log", append = TRUE)
}

# --- 12. Silent failure --------------------------------------------------
risky <- function(f) try(f(), silent = TRUE)
