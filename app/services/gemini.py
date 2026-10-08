import json
import re
import asyncio
import logging
from typing import Any

from google import genai
from google.genai import types
from groq import AsyncGroq

from app.config import get_settings

logger = logging.getLogger(__name__)


def _get_client() -> genai.Client:
    settings = get_settings()
    return genai.Client(api_key=settings.google_api_key)


def _extract_json(text: str) -> dict[str, Any]:
    """Extract JSON object from model response."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if fence:
        text = fence.group(1)
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


import time

# Cooldown tracker for temporarily degraded/exhausted models (model_name -> cooldown_expiry_timestamp)
_MODEL_COOLDOWNS: dict[str, float] = {}
_GEMINI_PROVIDER_COOLDOWN: float = 0.0
COOLDOWN_SECONDS = 300.0


def _get_candidate_models(settings) -> list[str]:
    """Returns only healthy models that are NOT currently on cooldown."""
    all_models = [settings.gemini_model] + settings.gemini_fallback_models
    now = time.time()
    
    healthy = []
    for m in all_models:
        # If model is confirmed non-existent globally (404), skip completely
        if now < _MODEL_COOLDOWNS.get(f"404_{m}", 0):
            continue
        # If model is on active cooldown, skip it
        if now < _MODEL_COOLDOWNS.get(m, 0):
            continue
        healthy.append(m)
            
    return healthy


async def _generate_with_groq(prompt: str, system_instruction: str, settings) -> str:
    """Generate response using Groq with multi-key and multi-model fallback."""
    groq_keys: list[str] = []
    if settings.groq_api_key:
        groq_keys.append(settings.groq_api_key)
    if settings.groq_api_key_fallback and settings.groq_api_key_fallback != settings.groq_api_key:
        groq_keys.append(settings.groq_api_key_fallback)
        
    if not groq_keys:
        raise RuntimeError("No GROQ_API_KEY is configured in backend settings.")

    groq_models = [settings.groq_model] + getattr(settings, "groq_fallback_models", ["openai/gpt-oss-20b", "qwen/qwen3.8-27b"])
    messages = [
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": prompt}
    ]

    last_error = None
    for api_key in groq_keys:
        groq_client = AsyncGroq(api_key=api_key)
        for model in groq_models:
            try:
                logger.info(f"Attempting Groq generation using model: {model}")
                groq_response = await groq_client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=0.2,
                    max_tokens=4096,
                )
                content = groq_response.choices[0].message.content or ""
                if content:
                    return content
            except Exception as e:
                logger.warning(f"Groq model {model} attempt failed: {e}. Trying next available fallback...")
                last_error = e
                continue

    raise RuntimeError(f"All Groq models and keys failed. Last error: {last_error}")


async def _generate_with_gemini(prompt: str, system_instruction: str, settings) -> str:
    """Generate response using Gemini with candidate models fallback."""
    if not settings.google_api_key:
        raise RuntimeError("GOOGLE_API_KEY is not configured.")

    models_to_try = _get_candidate_models(settings)
    if not models_to_try:
        raise RuntimeError("All Gemini models are currently on cooldown.")

    client = _get_client()
    logger.info(f"Attempting Gemini generation across models: {models_to_try}")

    for model in models_to_try:
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
        )

        try:
            response = await client.aio.models.generate_content(
                model=model,
                contents=prompt,
                config=config,
            )
            return response.text or ""
        except Exception as e:
            err_msg = str(e)
            if "404" in err_msg or "NOT_FOUND" in err_msg:
                logger.warning(f"Model {model} not found (404). Skipping immediately.")
                _MODEL_COOLDOWNS[f"404_{model}"] = time.time() + 3600.0
                continue

            logger.warning(f"Model {model} failed (attempt 1): {e}. Retrying in 2 seconds...")
            await asyncio.sleep(2.0)

            try:
                response = await client.aio.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=config,
                )
                return response.text or ""
            except Exception as e2:
                logger.warning(
                    f"Model {model} failed on retry: {e2}. "
                    f"Entering {COOLDOWN_SECONDS}s cooldown; falling back to next model."
                )
                _MODEL_COOLDOWNS[model] = time.time() + COOLDOWN_SECONDS
                continue

    raise RuntimeError("All Gemini models failed.")


async def generate_text(prompt: str, system: str | None = None) -> str:
    global _GEMINI_PROVIDER_COOLDOWN
    settings = get_settings()
    system_instruction = system or "You are a helpful travel planning assistant."

    # 1. Primary provider is Groq (temporary switch to openai/gpt-oss-120b)
    if settings.primary_llm_provider.lower() == "groq":
        try:
            return await _generate_with_groq(prompt, system_instruction, settings)
        except Exception as groq_err:
            logger.error(f"Groq generation failed ({groq_err}). Falling back to Gemini as secondary provider.")
            if settings.google_api_key:
                return await _generate_with_gemini(prompt, system_instruction, settings)
            raise

    # 2. Primary provider is Gemini (standard flow)
    now = time.time()
    if now < _GEMINI_PROVIDER_COOLDOWN:
        remaining = int(_GEMINI_PROVIDER_COOLDOWN - now)
        logger.info(f"Gemini provider is on active cooldown ({remaining}s remaining). Using Groq directly.")
        return await _generate_with_groq(prompt, system_instruction, settings)

    try:
        return await _generate_with_gemini(prompt, system_instruction, settings)
    except Exception as gemini_err:
        _GEMINI_PROVIDER_COOLDOWN = time.time() + COOLDOWN_SECONDS
        logger.error(f"All Gemini models failed ({gemini_err}). Entering {COOLDOWN_SECONDS}s cooldown and falling back to Groq.")
        return await _generate_with_groq(prompt, system_instruction, settings)


async def generate_json(prompt: str, system: str | None = None) -> dict[str, Any]:
    text = await generate_text(
        prompt + "\n\nRespond with valid JSON only, no markdown fences.",
        system=system,
    )
    return _extract_json(text)
