from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    google_api_key: str = ""
    groq_api_key: str = ""
    flight_api_key: str = ""
    hotel_api_key: str = ""
    openweather_api_key: str = ""
    tavily_api_key: str = ""
    aviationstack_api_key: str = ""

    primary_llm_provider: str = "groq"
    groq_model: str = "openai/gpt-oss-120b"
    groq_fallback_models: list[str] = ["openai/gpt-oss-20b", "qwen/qwen3.8-27b"]
    gemini_model: str = "gemini-3.5-flash"
    gemini_fallback_models: list[str] = ["gemini-3.7-flash", "gemini-3.8-flash"]
    groq_api_key_fallback: str = ""
    groq_fallback_model: str = "openai/gpt-oss-20b"

    serpapi_base_url: str = "https://serpapi.com/search.json"
    openweather_base_url: str = "https://api.openweathermap.org/data/2.5"
    aviationstack_base_url: str = "http://api.aviationstack.com/v1"


@lru_cache
def get_settings() -> Settings:
    return Settings()
