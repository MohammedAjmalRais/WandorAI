import asyncio
from app.graph import get_planner
from app.models import TravelPlanRequest
import json

async def main():
    planner = get_planner()
    req = TravelPlanRequest(message='plan a trip to Tokyo from 18-08-2026 to 02-09-2026 from Delhi for one traveler.')
    res = await planner.run(req)
    with open("test_output.json", "w", encoding="utf-8") as f:
        f.write(res.model_dump_json(indent=2))

if __name__ == "__main__":
    asyncio.run(main())
