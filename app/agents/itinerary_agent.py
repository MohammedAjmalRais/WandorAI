import json

from app.models import BudgetEstimate, FlightOption, HotelOption, ResearchResult, TravelContext, WeatherForecast
from app.services.gemini import generate_json, generate_text


BUDGET_SYSTEM = """You estimate trip budgets using provided real-world flight and hotel data.
Treat prices as estimates, not guarantees. Return JSON:
{
  "flights": number|null,
  "accommodation": number|null,
  "activities": number|null,
  "food": number|null,
  "local_transport": number|null,
  "total": number|null,
  "currency": "INR",
  "notes": string,
  "breakdown": object
}
"""


import re

def clean_markdown_tables(text: str) -> str:
    """Converts any raw markdown tables and pipe-delimited grids into clean bullet cards."""
    if not text:
        return ""

    # Split single-line concatenated tables (e.g. `| |`) into proper linebreaks
    text = re.sub(r'\|\s*\|\s*', '|\n|', text)
    
    lines = text.split('\n')
    cleaned_lines = []
    table_lines = []
    
    def process_table(tbl: list[str]) -> list[str]:
        if not tbl:
            return []
        rows = []
        for line in tbl:
            # Skip separator line (|---|---|)
            if re.match(r'^\s*\|?[\s\-:]+(\|[\s\-:]+)+\|?\s*$', line):
                continue
            cells = [c.strip() for c in line.split('|')]
            if cells and not cells[0]:
                cells.pop(0)
            if cells and not cells[-1]:
                cells.pop()
            if cells:
                rows.append(cells)
                
        if not rows:
            return []
            
        header = rows[0]
        data_rows = rows[1:] if len(rows) > 1 else []
        
        output = []
        for row in data_rows:
            if not row:
                continue
            title = row[0]
            subtitle = ""
            if len(row) > 1 and len(header) > 1:
                h1_lower = header[1].lower()
                if "location" in h1_lower or "neighborhood" in h1_lower or "route" in h1_lower or "airline" in h1_lower:
                    subtitle = f" ({row[1]})"
            
            output.append(f"- **{title}**{subtitle}")
            start_idx = 2 if subtitle else 1
            for idx in range(start_idx, len(row)):
                col_name = header[idx] if idx < len(header) else f"Detail {idx+1}"
                val = row[idx]
                if val:
                    output.append(f"  - **{col_name}:** {val}")
            output.append("")
        return output

    in_table = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('|') and stripped.endswith('|'):
            table_lines.append(stripped)
            in_table = True
        else:
            if in_table:
                cleaned_lines.extend(process_table(table_lines))
                table_lines = []
                in_table = False
            cleaned_lines.append(line)
            
    if in_table:
        cleaned_lines.extend(process_table(table_lines))

    result = '\n'.join(cleaned_lines)
    # Strip any remaining stray pipe table delimiters
    result = re.sub(r'\|[\s\-:]+\|', '', result)
    result = re.sub(r'\|\s*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*\|\s*', '', result, flags=re.MULTILINE)
    result = re.sub(r'\s*\|\s*', ' — ', result)
    return result


ITINERARY_SYSTEM = """You create practical, personalized day-by-day travel itineraries.
Use flights, hotels, weather, research, budget, and user preferences.
Be specific but realistic about timing, neighborhoods, and travel time.

CRITICAL Formatting & Styling Rules:
- STRICT PROHIBITION: NEVER use markdown tables, ASCII tables, table columns, horizontal dashes (|---|---|), or pipe characters (|). Markdown tables are completely prohibited.
- Present all recommendations (hotels, flights, day plans, costs) as clean, elegant, indented bullet points and cards.
- Format for hotels:
  - **Hotel Name** — Location / Neighborhood
    - **Price:** ₹X,XXX / night (Total: ₹XX,XXX)
    - **Rating:** 4.5 ★ (XXX reviews)
    - **Key Amenities:** Wi-Fi, Air Conditioning, Breakfast
- Format for flights:
  - **Airline Name** — Flight Number / Route
    - **Departure & Arrival:** Departure Time ➔ Arrival Time (Duration, Stops)
    - **Price:** ₹X,XXX
- Use primary heading (#) for the main title, e.g., "# Your Travel Itinerary".
- Use secondary headings (##) for main sections: "## Trip Overview", "## Recommended Flight & Hotel Picks", "## Day-by-Day Itinerary", "## Practical Tips".
- Format each day's heading as a secondary heading, e.g., "## Day 1: Arrival & Exploration".
- Use third-level headings (###) for day segments, e.g., "### Morning", "### Afternoon", "### Evening".
- Use bold text (**word**) for emphasis, key times, locations, names, and pricing.
- Leave double blank lines (\n\n) between headings, sections, list items, and paragraphs to ensure the reader has clear breathing room.
- CRITICAL: You MUST explicitly list the recommended flights and hotels in your text response, including their names and prices."""


class ItineraryAgent:
    async def estimate_budget(
        self,
        context: TravelContext,
        flights: list[FlightOption],
        hotels: list[HotelOption],
    ) -> BudgetEstimate:
        prompt = f"""Travel context:
{context.model_dump_json()}

Flights:
{json.dumps([f.model_dump(exclude={'raw'}) for f in flights], indent=2)}

Hotels:
{json.dumps([h.model_dump(exclude={'raw'}) for h in hotels], indent=2)}

Estimate a reasonable total trip budget."""

        data = await generate_json(prompt, system=BUDGET_SYSTEM)
        return BudgetEstimate.model_validate(data)

    async def generate_itinerary(
        self,
        context: TravelContext,
        flights: list[FlightOption],
        hotels: list[HotelOption],
        weather: WeatherForecast | None,
        research: list[ResearchResult],
        budget: BudgetEstimate | None,
        user_request: str,
    ) -> str:
        weather_block = weather.model_dump(exclude={"raw"}) if weather else {}
        research_block = [r.model_dump() for r in research]
        budget_block = budget.model_dump() if budget else {}

        prompt = f"""Original user request:
{user_request}

Travel context:
{context.model_dump_json()}

Selected flight options:
{json.dumps([f.model_dump(exclude={'raw'}) for f in flights[:3]], indent=2)}

Selected hotel options:
{json.dumps([h.model_dump(exclude={'raw'}) for h in hotels[:3]], indent=2)}

Weather:
{json.dumps(weather_block, indent=2)}

Destination research:
{json.dumps(research_block, indent=2)}

Budget estimate:
{json.dumps(budget_block, indent=2)}

Create a personalized itinerary with:
1. Trip overview
2. Recommended flight and hotel picks with rationale (Present as clean bullet cards with bold titles, prices, ratings, and key amenities — NEVER use tables, columns, or pipes)
3. Day-by-day plan aligned with weather and interests
4. Budget summary (estimate)
5. Practical tips
"""

        raw_itinerary = await generate_text(prompt, system=ITINERARY_SYSTEM)
        return clean_markdown_tables(raw_itinerary)
