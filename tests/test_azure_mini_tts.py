from __future__ import annotations

import importlib
import json

import httpx
import numpy as np
import pytest


@pytest.fixture
def azure(monkeypatch):
    from services import settings_store

    text = {}
    secrets = {}
    monkeypatch.setattr(settings_store, "get_text", lambda key, default=None: text.get(key, default))
    monkeypatch.setattr(settings_store, "set_text", lambda key, value: text.__setitem__(key, value))
    monkeypatch.setattr(settings_store, "get_secret", secrets.get)
    monkeypatch.setattr(settings_store, "set_secret", lambda key, value: secrets.__setitem__(key, value) if value else secrets.pop(key, None))
    monkeypatch.setattr(settings_store, "list_secret_names", lambda: list(secrets))
    module = importlib.import_module("engines.azure_tts")
    return module, text, secrets


def configure(module, **changes):
    return module.save_config({
        "enabled": True,
        "endpoint": "https://jevstudio-foundry.openai.azure.com/openai/deployments/jvs4otts/audio/speech?api-version=2025-03-01-preview",
        **changes,
    }, "test-azure-secret")


def capture_requests(monkeypatch, handler):
    import openai

    original = openai.AzureOpenAI
    requests = []

    def respond(request):
        requests.append(request)
        return handler(request)

    def client(**kwargs):
        kwargs["http_client"].close()
        kwargs["http_client"] = httpx.Client(transport=httpx.MockTransport(respond), follow_redirects=False)
        return original(**kwargs)

    monkeypatch.setattr(openai, "AzureOpenAI", client)
    return requests


def test_full_azure_deployment_url_and_key_storage(azure):
    module, text, secrets = azure
    config = configure(module)
    assert config["endpoint"] == "https://jevstudio-foundry.openai.azure.com"
    assert config["deployment"] == "jvs4otts"
    assert config["api_version"] == "2025-03-01-preview"
    assert config["has_key"] is True
    assert secrets[module.SECRET_NAME] == "test-azure-secret"
    assert "test-azure-secret" not in json.dumps(config)
    assert "test-azure-secret" not in json.dumps(text)
    assert module.AzureMiniTTSBackend.is_available()[0]


@pytest.mark.parametrize("endpoint", [
    "http://jevstudio-foundry.openai.azure.com",
    "https://user:password@jevstudio-foundry.openai.azure.com",
    "https://jevstudio-foundry.openai.azure.com.attacker.example",
    "https://jevstudio-foundry.openai.azure.com/api/projects/project",
    "https://jevstudio-foundry.openai.azure.com#secret",
    "https://jevstudio-foundry.openai.azure.com?api-key=secret",
    "https://jevstudio-foundry.openai.azure.com:bad",
    "https://jevstudio-foundry.openai.azure.com/\\example",
])
def test_rejects_invalid_endpoints_without_persisting(azure, endpoint):
    module, text, secrets = azure
    with pytest.raises(ValueError):
        configure(module, endpoint=endpoint)
    assert not text
    assert not secrets


def test_cloud_is_opt_in_and_never_probed(azure, monkeypatch):
    module, _, _ = azure
    requests = capture_requests(monkeypatch, lambda request: pytest.fail("Unexpected cloud request"))
    assert module.get_config()["enabled"] is False
    assert module.AzureMiniTTSBackend.is_available()[0] is False
    with pytest.raises(ValueError):
        module.save_config({"enabled": True})
    with pytest.raises(module.TTSInputError):
        module.AzureMiniTTSBackend().generate("Hello")
    assert not requests


def test_synthesizes_azure_pcm_using_deployment_and_live_settings(azure, monkeypatch):
    module, _, _ = azure
    configure(module, voice="coral", instructions="Speak in Colombian Spanish.")
    pcm = np.array([0, 16384, -32768], dtype="<i2").tobytes()
    requests = capture_requests(monkeypatch, lambda request: httpx.Response(200, content=pcm))
    engine = module.AzureMiniTTSBackend()
    output = engine.generate("Hola", speed=1.25)
    assert output.shape == (1, 3)
    assert engine.sample_rate == 24000
    assert output.tolist()[0] == pytest.approx([0.0, 0.5, -1.0])
    request = requests[0]
    assert request.url.path == "/openai/deployments/jvs4otts/audio/speech"
    assert request.url.params["api-version"] == "2025-03-01-preview"
    assert request.headers["api-key"] == "test-azure-secret"
    assert json.loads(request.content) == {
        "model": "jvs4otts", "input": "Hola", "voice": "coral", "response_format": "pcm",
        "speed": 1.25, "instructions": "Speak in Colombian Spanish.",
    }
    module.save_config({"voice": "alloy"})
    engine.generate("Otra frase")
    assert json.loads(requests[-1].content)["voice"] == "alloy"


@pytest.mark.parametrize("status", [401, 404, 429, 500])
def test_errors_hide_key_and_text_and_do_not_retry_paid_requests(azure, monkeypatch, status):
    module, _, _ = azure
    configure(module)
    requests = capture_requests(monkeypatch, lambda request: httpx.Response(status, json={
        "error": {"message": "test-azure-secret private-user-script", "type": "error"},
    }))
    with pytest.raises(RuntimeError) as error:
        module.AzureMiniTTSBackend().generate("private-user-script")
    assert f"HTTP {status}" in str(error.value)
    assert "test-azure-secret" not in str(error.value)
    assert "private-user-script" not in str(error.value)
    assert len(requests) == 1


@pytest.mark.parametrize("text,kwargs", [
    ("", {}), ("x" * 4097, {}), ("Hello", {"ref_audio": "/private/sample.wav"}),
    ("Hello", {"speed": float("nan")}), ("Hello", {"speed": 0.0}),
])
def test_rejects_bad_generation_input_before_sending(azure, monkeypatch, text, kwargs):
    module, _, _ = azure
    configure(module)
    requests = capture_requests(monkeypatch, lambda request: pytest.fail("Unexpected cloud request"))
    with pytest.raises(module.TTSInputError):
        module.AzureMiniTTSBackend().generate(text, **kwargs)
    assert not requests


def test_clearing_key_disables_engine(azure):
    module, _, secrets = azure
    configure(module)
    module.save_config({"enabled": False}, "")
    assert not secrets
    assert not module.AzureMiniTTSBackend.is_available()[0]


def test_settings_handlers_never_return_the_key(azure):
    module, _, _ = azure
    settings = importlib.import_module("api.routers.settings")
    result = settings.set_azure_tts(settings._AzureTTSBody(
        enabled=True, endpoint="https://example.openai.azure.com", deployment="custom-name",
        api_key="new-azure-secret",
    ))
    assert result["has_key"]
    assert "new-azure-secret" not in json.dumps(settings.get_azure_tts())
    assert module.get_config()["deployment"] == "custom-name"
