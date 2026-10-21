# JeVStudio — Azure OpenAI Mini TTS

Optional cloud text-to-speech using an existing Azure `gpt-4o-mini-tts`
deployment. It works on macOS, Windows and Linux without a local GPU.

## Configure

1. Open **Settings → Models → Speech generation** and find **Azure Mini TTS**.
2. Paste your Azure resource endpoint or the complete deployment URL, such as
   `https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT/audio/speech?api-version=2025-03-01-preview`.
   A full speech URL supplies the deployment name and API version automatically.
   With a resource endpoint, enter the deployment name separately. This is the
   name assigned in Foundry, which can differ from `gpt-4o-mini-tts`.
3. Enter your API key, choose a preset voice and optionally add voice instructions.
4. Enable Azure cloud speech and save. Select **Azure OpenAI Mini TTS (cloud)**
   in the TTS engine list, then open the voice workspace and generate from text.

Configuration and catalogue reads make no Azure requests. Only explicit speech
generation sends text and voice instructions to Azure and can incur charges.
If the panel reports an older backend without Azure support, use **Restart
backend**, then **Retry**. For an externally managed backend, restart that
backend process yourself before retrying; restarting only the renderer is insufficient.
The API key is encrypted in the existing local settings store and never returned
to the renderer. Delete the saved key in the panel to disable the engine.

This engine uses preset voices; it does not clone uploaded audio or saved voice
profiles. Selecting it preserves existing local references but excludes them from
speech requests. Local engines remain the default. Output uses the same export
and synthetic-audio watermark pipeline as other engines.

Requests use the Azure OpenAI speech API, with 24 kHz PCM decoded into the normal
audio pipeline. Each request accepts up to 4,096 characters. Failed requests are
not automatically retried. No additional dependencies are required.

References: [Azure endpoint and deployment names](https://learn.microsoft.com/en-us/azure/foundry-classic/openai/how-to/switching-endpoints),
[Speech API](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create).
