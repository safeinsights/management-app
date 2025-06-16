export const DEFAULT_CODE = `
library(arrow)
library(paws)
library(furrr)
library(dplyr)
library(future)
library(jsonlite)
library(httr)  # For sending files to an API
library(readr) # For writing CSV files

# Set Trusted Output App API Endpoint
trusted_output_endpoint <- Sys.getenv("TRUSTED_OUTPUT_ENDPOINT")

# AWS S3 bucket and folder (prefix) details
bucket_name <- "quasar-sandbox-events"
s3_folder <- "rjr-parquet/created_highlight/year=2021/"  # S3 folder (prefix) containing the Parquet files
# s3_folder <- "" # All files in the S3 bucket (used for testing smaller buckets)

# Assume Machine IAM permissions.
# If testing locally, make sure to export AWS Access key, secret and session for access

# Region for S3 bucket is needed to be set. us-east-2 is for Event capture Sandbox
Sys.setenv("AWS_DEFAULT_REGION" = "us-east-2")

# Initialize the S3 client
s3 <- paws::s3()

# Step 1: List all Parquet files in the S3 folder
# List all objects in the given S3 bucket and folder (prefix)
list_objects <- s3$list_objects_v2(Bucket = bucket_name, Prefix = s3_folder)

# Extract the file names (keys) from the result
s3_files <- list_objects$Contents

# Filter for only .parquet files and print them
if (length(s3_files) > 0) {
  file_names <- sapply(s3_files, function(x) x$Key)
  parquet_files <- file_names[grepl("\\.parquet$", file_names)]

  if (length(parquet_files) > 0) {
    print(parquet_files)
  } else {
    print("No .parquet files found in the specified folder.")
  }
} else {
  stop("No Parquet files found in the specified S3 folder.")
}

# Initialize parallel processing using furrr and future
plan(multisession, workers = 2)  # hard coded to 2 CPU cores

# Function to read a Parquet file either directly from S3 or by downloading it first
read_parquet_file <- function(s3_key) {
  message("Reading Parquet file: ", s3_key)

  # Construct the full S3 URI
  s3_uri <- paste0("s3://", bucket_name, "/", s3_key)

  # Method 1: Directly read from S3 using Arrow's s3 support (if configured)
  tryCatch({
    s3fs <- s3_bucket(bucket_name, anonymous = FALSE)
    parquet_data <- read_parquet(s3fs$path(s3_key))
    return(parquet_data)
  }, error = function(e) {
    message("Direct S3 read failed for: ", s3_key, " Error: ", e$message)

    # Method 2: Download the file locally using aws.s3, then read it
    # temp_file <- tempfile(fileext = ".parquet")
    # save_object(s3_key, bucket = bucket_name, file = temp_file)
    # parquet_data <- read_parquet(temp_file)
    # unlink(temp_file)  # Clean up the temp file
    # return(parquet_data)
  })
}

# Step 2: Process the Parquet files in parallel using furrr
# We will split the files into chunks based on batch size and run the reading process in parallel
batch_size <- 1000  # Adjust the batch size based on available memory and number of files

# Read all files in parallel
parquet_data_list <- future_map(parquet_files, read_parquet_file, .progress = TRUE)

# Step 3: Optionally combine all data into a single data frame
all_parquet_data <- bind_rows(parquet_data_list)

# Print the combined data preview
print(head(all_parquet_data))

# Save the combined data to a new parquet file locally (if needed)
# write_parquet(all_parquet_data, "combined_data.parquet")

# Clean up the parallel workers
plan(sequential)  # Reset the plan back to sequential processing

# Do some researcher with all_parquet_data
# Stubbed until we figure out what we should here, but for now
# just create a dummy CSV file. The parquet data is not used because it has
# NULL columns which cause and error int he data frame
numbers <- c("1", "2", "3", "4", "5")
results <- data.frame(numbers)

# Write the parquet results to a CSV file
output_csv <- "aggregate_results.csv"
write_csv(results, output_csv)

# write_csv_arrow(results, output_csv)

# Send aggregate results to Trusted Output App
response <- POST(
  url = trusted_output_endpoint,
  body = list(file = upload_file(output_csv)),  # Attach the CSV file
  encode = "multipart"  # Multipart form data encoding
)

# DEBUG: Print the response content
# response_content <- content(response, as = "parsed", type = "application/json")
# print(response_content)

# Check the API response
if (response$status_code == 200) {
  print("File uploaded successfully.")
} else {
  print(paste("File upload failed. Status code:", response$status_code))
}

# Performance Notes
# When loading 468 parquet files from the sandbox bucket, each ~7KB, this
# script took ~3mins to read and combine the files into the single
# parquet_data_list when limited to 2CPU cores on a powerful Mac.
#
# In production Event Capture, there are ~1500 files per day, each ~7KB to
# ~10KB. At 2 cores, we can extrapolate that this script will take 10-15mins to
# read a single days worth of parquet files. To view data over a semester, that
# may be 5-6 hours, just to read the data. Then the research will start.
`
