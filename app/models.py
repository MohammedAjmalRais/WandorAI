from typing import Any, Literal

from pydantic import BaseModel, Field


class TravelContext(BaseModel):
    """Structured travel requirements extracted from natural language."""

    destination: str | None = None
    destination_iata: str | None = Field(None, description="The 3-letter IATA airport code for the destination")
    origin: str | None = None
    origin_iata: str | None = Field(None, description="The 3-letter IATA airport code for the origin")
    duration_days: int | None = None
    departure_date: str | None = None
    return_date: str | None = None
    travelers: int = 1
    budget_preference: Literal["low", "moderate", "high", "luxury"] | None = None
    budget_amount: float | None = None
    currency: str = "INR"
    preferences: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    trip_purpose: str | None = None
    inferred_fields: list[str] = Field(default_factory=list)


class OrchestratorResult(BaseModel):
    travel_context: TravelContext
    missing_fields: list[str] = Field(default_factory=list)
    clarification_question: str | None = None
    confidence: float = 1.0
    reasoning: str = ""


class FlightOption(BaseModel):
    airline: str | None = None
    flight_number: str | None = None
    departure_airport: str | None = None
    arrival_airport: str | None = None
    departure_time: str | None = None
    arrival_time: str | None = None
    duration: str | None = None
    stops: int | None = None
    price: float | None = None
    currency: str = "INR"
    booking_link: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


class HotelOption(BaseModel):
    name: str | None = None
    location: str | None = None
    price_per_night: float | None = None
    total_price: float | None = None
    rating: float | None = None
    review_count: int | None = None
    amenities: list[str] = Field(default_factory=list)
    booking_link: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


class WeatherForecast(BaseModel):
    location: str
    summary: str = ""
    daily: list[dict[str, Any]] = Field(default_factory=list)
    raw: dict[str, Any] = Field(default_factory=dict)


class ResearchResult(BaseModel):
    query: str
    summary: str = ""
    highlights: list[str] = Field(default_factory=list)
    sources: list[dict[str, str]] = Field(default_factory=list)


class BudgetEstimate(BaseModel):
    flights: float | None = None
    accommodation: float | None = None
    activities: float | None = None
    food: float | None = None
    local_transport: float | None = None
    total: float | None = None
    currency: str = "INR"
    notes: str = ""
    breakdown: dict[str, Any] = Field(default_factory=dict)


class TravelPlanRequest(BaseModel):
    message: str = Field(..., min_length=3, description="Natural-language travel request")
    clarification_response: str | None = Field(
        None, description="User reply when the system asks for missing information"
    )
    session_context: dict[str, Any] | None = Field(
        None, description="Prior travel context from a clarification round"
    )


class TravelPlanResponse(BaseModel):
    status: Literal["complete", "needs_clarification", "error"]
    message: str
    clarification_question: str | None = None
    travel_context: TravelContext | None = None
    flights: list[FlightOption] = Field(default_factory=list)
    hotels: list[HotelOption] = Field(default_factory=list)
    weather: WeatherForecast | None = None
    research: list[ResearchResult] = Field(default_factory=list)
    budget: BudgetEstimate | None = None
    itinerary: str | None = None
    session_context: dict[str, Any] | None = None
    errors: list[str] = Field(default_factory=list)

class ChatInitRequest(BaseModel):
    session_id: str
    itinerary_text: str

class ChatQueryRequest(BaseModel):
    session_id: str
    query: str
