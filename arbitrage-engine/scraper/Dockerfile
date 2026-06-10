# Scraper worker image. The default Scrapfly + Claude path needs no browser, so this
# is a slim Python image (Python 3.12 for broad wheel compatibility).
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Default: a SINGLE pass (cron-friendly, free-tier-safe). Render should run this as a
# Cron Job. Secrets (ANTHROPIC_API_KEY, SUPABASE_*, SCRAPFLY_KEY) come from Render env.
# Keep --limit low on the Scrapfly free tier (~25 credits/request, 1000/month).
CMD ["python", "run.py", "--source", "govdeals", "--query", "commercial printer", "--limit", "5"]
