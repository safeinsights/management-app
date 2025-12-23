source("libraries/openstax.R")
source("libraries/safeinsights_common.R")

###############################################################################
# Initialize Research Container
# DO NOT TOUCH
initialize()
###############################################################################
# Researcher: Insert query code here

# OpenStax Tutor Example: Count unique tasked_id for date range
results <- query_tutor("
  SELECT COUNT(DISTINCT tasked_id) as unique_tasked_count
  FROM tutor_data
  WHERE created_at >= '2023-02-02' AND created_at <= '2023-02-03'
")

# OpenStax Tutor Exercises Example: Count unique question_id
# exercises_results <- query_tutor_exercises("
#   SELECT COUNT(DISTINCT question_uid) as unique_question_count
#   FROM exercises_data
# ")


###############################################################################
# Researcher: Insert manipulate data and analysis code here


write.csv(result, "results.csv", row.names = FALSE)

###############################################################################
# Researcher: Upload results
toa_results_upload("results.csv")
