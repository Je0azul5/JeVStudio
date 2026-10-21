from __future__ import annotations

import math
import re
from urllib.parse import parse_qs, unquote, urlsplit

from services.tts_backend import TTSBackend, TTSInputError

CONFIG_KEY = "tts.azure.config"
SECRET_NAME = "tts_azure_api_key"
VOICES = ("alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar")
DEFAULT_CONFIG = {
    "enabled": False,
    "endpoint": "",
    "deployment": "",
    "api_version": "2025-03-01-preview",
    "voice": "alloy",
    "instructions": "",
}


def normalize_config(values: dict) -> dict:
    config = {**DEFAULT_CONFIG, **values}
    endpoint = str(config["endpoint"]).strip().rstrip("/")
    if endpoint:
        if any(character.isspace() or ord(character) < 32 or character == "\\" for character in endpoint):
            raise ValueError("Azure endpoint contains invalid characters")
        parsed = urlsplit(endpoint)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username is not None
                or parsed.password is not None or parsed.fragment or parsed.port not in (None, 443)):
            raise ValueError("Azure endpoint must be a credential-free HTTPS resource URL")
        host = parsed.hostname.lower()
        if not any(host.endswith("." + domain) for domain in (
            "openai.azure.com", "services.ai.azure.com", "cognitiveservices.azure.com",
        )):
            raise ValueError("Use the Azure OpenAI resource endpoint")
        match = re.fullmatch(r"/openai/deployments/([^/]+)/audio/speech", parsed.path)
        if match:
            config["deployment"] = unquote(match.group(1))
            query = parse_qs(parsed.query)
            if set(query) - {"api-version"}:
                raise ValueError("Azure speech URL contains unsupported query parameters")
            if query.get("api-version"):
                config["api_version"] = query["api-version"][0]
        elif parsed.path.rstrip("/") not in ("", "/openai", "/openai/v1") or parsed.query:
            raise ValueError("Use the Azure resource URL or its audio/speech deployment URL")
        endpoint = f"https://{host}"
    config["endpoint"] = endpoint
    for key in ("deployment", "api_version", "voice", "instructions"):
        config[key] = str(config[key]).strip()
    if config["deployment"] and not re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", config["deployment"]):
        raise ValueError("Invalid Azure deployment name")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:-preview)?", config["api_version"]):
        raise ValueError("Invalid Azure API version")
    if config["voice"] not in VOICES:
        raise ValueError("Unsupported Azure TTS voice")
    if len(config["instructions"]) > 4000:
        raise ValueError("Azure voice instructions are too long")
    if config["enabled"] and not (endpoint and config["deployment"]):
        raise ValueError("Azure endpoint and deployment are required before enabling cloud speech")
    return config


def get_config() -> dict:
    import json
    from services import settings_store

    raw = settings_store.get_text(CONFIG_KEY)
    config = normalize_config(json.loads(raw) if raw else {})
    return {**config, "has_key": SECRET_NAME in settings_store.list_secret_names(), "voices": list(VOICES)}


def save_config(values: dict, api_key: str | None = None) -> dict:
    import json
    from services import settings_store

    current = get_config()
    config = normalize_config({key: values.get(key, current[key]) for key in DEFAULT_CONFIG})
    if api_key is not None and (len(api_key) > 4096 or any(ord(character) < 32 for character in api_key)):
        raise ValueError("Invalid Azure API key")
    if config["enabled"] and not (api_key.strip() if api_key is not None else current["has_key"]):
        raise ValueError("An Azure API key is required before enabling cloud speech")
    if api_key is not None:
        settings_store.set_secret(SECRET_NAME, api_key.strip())
    settings_store.set_text(CONFIG_KEY, json.dumps(config))
    return get_config()


class AzureMiniTTSBackend(TTSBackend):
    id = "azure-mini-tts"
    display_name = "Azure OpenAI Mini TTS (cloud)"
    supports_cloning = False
    supports_voice_design = False
    gpu_compat = ("cpu",)

    @property
    def sample_rate(self) -> int:
        return 24000

    @property
    def supported_languages(self) -> list[str]:
        return ["multi"]

    @classmethod
    def is_available(cls) -> tuple[bool, str]:
        try:
            config = get_config()
        except (ValueError, TypeError):
            return False, "Configure Azure Mini TTS in Settings > Models > Speech generation"
        if not config["enabled"] or not config["has_key"]:
            return False, "Configure and enable Azure Mini TTS in Settings > Models > Speech generation"
        return True, "ready — Cloud synthesis sends the text to your Azure deployment"

    def generate(self, text: str, **kwargs):
        import numpy as np
        import torch
        import httpx
        from openai import AzureOpenAI, APIError
        from services import settings_store

        config = get_config()
        api_key = settings_store.get_secret(SECRET_NAME) if config["enabled"] else None
        if not api_key or not config["endpoint"] or not config["deployment"]:
            raise TTSInputError("Configure and enable Azure Mini TTS before generating speech")
        if not text.strip():
            raise TTSInputError("Enter text to generate speech")
        if len(text) > 4096:
            raise TTSInputError("Azure Mini TTS accepts at most 4096 characters per request")
        if kwargs.get("ref_audio") or kwargs.get("ref_text"):
            raise TTSInputError("Azure Mini TTS uses preset voices and cannot clone reference audio")
        speed = float(kwargs.get("speed", 1.0))
        if not math.isfinite(speed) or not 0.25 <= speed <= 4.0:
            raise TTSInputError("Azure speech speed must be between 0.25 and 4")
        request = {
            "model": config["deployment"], "input": text, "voice": config["voice"],
            "response_format": "pcm", "speed": speed,
        }
        if config["instructions"]:
            request["instructions"] = config["instructions"]
        try:
            with AzureOpenAI(
                azure_endpoint=config["endpoint"], api_version=config["api_version"],
                api_key=api_key, max_retries=0, timeout=120.0,
                http_client=httpx.Client(follow_redirects=False, timeout=120.0),
            ) as client:
                response = client.audio.speech.create(**request)
                audio = response.read()
        except APIError as error:
            status = getattr(error, "status_code", None)
            detail = f" (HTTP {status})" if status else ""
            raise RuntimeError(f"Azure Mini TTS request failed{detail}. Check the endpoint, deployment, API key and quota.") from None
        if not audio or len(audio) % 2:
            raise RuntimeError("Azure Mini TTS returned invalid PCM audio")
        samples = np.frombuffer(audio, dtype="<i2").astype(np.float32) / 32768.0
        return torch.from_numpy(samples).unsqueeze(0)
