source("libraries/env.R")
source("libraries/common.R")

initialize_container()

results <- run_query("
  SELECT COUNT(DISTINCT session_id) AS unique_session_count
  FROM event_log
  WHERE created_at >= '2024-01-01' AND created_at < '2024-01-02'
")

write.csv(results, "results.csv", row.names = FALSE)

upload_results("results.csv")