# Example R script for testing
print("Hello from main.r")

# Add some basic data analysis
data <- data.frame(
  x = 1:10,
  y = rnorm(10)
)

# Simple linear model
model <- lm(y ~ x, data = data)
print(summary(model))
