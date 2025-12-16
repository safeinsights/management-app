import os
import json
import requests
import pandas as pd

# --- 1. Set Trusted Output App API Endpoint ---
trusted_output_endpoint = os.getenv("TRUSTED_OUTPUT_ENDPOINT")

# --- 2. Retrieve the basic auth credentials from environment variable ---
auth_credentials = os.getenv("TRUSTED_OUTPUT_BASIC_AUTH")

if not trusted_output_endpoint or not auth_credentials:
    raise ValueError("Missing TRUSTED_OUTPUT_ENDPOINT or TRUSTED_OUTPUT_BASIC_AUTH environment variables")

# --- 3. Write the query results to a CSV file ---
csv_file_path = "query_result.csv"
pd.DataFrame({"result": [80]}).to_csv(csv_file_path, index=False)

# --- 4. Split the credentials into username and password ---
username, password = auth_credentials.split(":", 1)

# --- 5. Send PUT request to update job status ---
status_payload = {"status": "JOB-RUNNING"}

response = requests.put(
    url=trusted_output_endpoint,
    json=status_payload,   # JSON body
    auth=(username, password),  # Basic auth
    headers={"Content-Type": "application/json"}
)

try:
    response_content = response.json()
except ValueError:
    response_content = response.text

print("PUT Response:", response_content)

# --- 6. Send aggregate results (CSV) to Trusted Output App ---
upload_url = f"{trusted_output_endpoint}/upload"

with open(csv_file_path, "rb") as file:
    files = {"file": (csv_file_path, file)}
    response = requests.post(
        url=upload_url,
        files=files,
        auth=(username, password)
    )

try:
    response_content = response.json()
except ValueError:
    response_content = response.text

print("POST Response:", response_content)

# --- 7. Check the API response ---
if response.status_code == 200:
    print("File uploaded successfully.")
else:
    print(f"File upload failed. Status code: {response.status_code}")
