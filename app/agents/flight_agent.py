from typing import Any

from app.models import FlightOption, TravelContext
from app.services.airport import AirportService
from app.services.flight_api import FlightApiService

class FlightSearchAgent:
    def __init__(self) -> None:
        self.api = FlightApiService()
        self.airports = AirportService()

    async def search(self, context: TravelContext) -> tuple[list[FlightOption], list[str]]:
        errors: list[str] = []
        if not context.destination:
            return [], ["Destination is required for flight search"]
        if not context.departure_date:
            return [], ["Departure date is required for flight search"]

        origin_iata = context.origin_iata or await self.airports.resolve_to_iata(context.origin or "")
        dest_iata = context.destination_iata or await self.airports.resolve_to_iata(context.destination)

        if not dest_iata:
            errors.append(f"Could not resolve IATA code for destination: {context.destination}")
            return [], errors

        if not origin_iata:
            errors.append(
                "Origin airport could not be resolved; skipping flight search. "
                "Provide a departure city for flight options."
            )
            return [], errors

        try:
            payload = await self.api.search_flights(
                origin_iata=origin_iata,
                destination_iata=dest_iata,
                departure_date=context.departure_date,
                return_date=context.return_date,
                adults=context.travelers,
                currency=context.currency,
            )
        except Exception as e:
            errors.append(f"Flight search failed: {str(e)}")
            return [], errors

        if payload.get("error"):
            errors.append(str(payload["error"]))
            return [], errors

        flights = self._parse_flights(payload)
        enriched = [
            FlightOption.model_validate(self.airports.enrich_flight_airports(f.model_dump()))
            for f in flights
        ]
        return enriched[:5], errors

    def _parse_flights(self, payload: dict[str, Any]) -> list[FlightOption]:
        options: list[FlightOption] = []
        best = payload.get("best_flights") or []
        other = payload.get("other_flights") or []
        for item in best + other:
            legs = item.get("flights") or []
            first = legs[0] if legs else {}
            last = legs[-1] if legs else {}
            price = item.get("price")
            options.append(
                FlightOption(
                    airline=first.get("airline"),
                    flight_number=first.get("flight_number"),
                    departure_airport=first.get("departure_airport", {}).get("id")
                    if isinstance(first.get("departure_airport"), dict)
                    else first.get("departure_airport"),
                    arrival_airport=last.get("arrival_airport", {}).get("id")
                    if isinstance(last.get("arrival_airport"), dict)
                    else last.get("arrival_airport"),
                    departure_time=first.get("departure_airport", {}).get("time")
                    if isinstance(first.get("departure_airport"), dict)
                    else None,
                    arrival_time=last.get("arrival_airport", {}).get("time")
                    if isinstance(last.get("arrival_airport"), dict)
                    else None,
                    duration=str(item.get("total_duration") or ""),
                    stops=max(len(legs) - 1, 0) if legs else None,
                    price=float(price) if price is not None else None,
                    booking_link=item.get("booking_token"),
                    raw=item,
                )
            )
        return options
