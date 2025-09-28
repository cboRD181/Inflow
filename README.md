# Inflow

Seamlessly query an LLM on your current page context. Begin typing your question to open a chat with your current viewport as context.

Alternatively, use the configurable hotkey (`Cmd+Shift+O` or `Ctrl+Shift+O` by default) to invoke Inflow. You can configure this and other settings from the extension options. Click "Change Hotkey" in the settings panel to reconfigure.

## Features

- **Seamless Invocation**: Start typing to invoke, or use a hotkey.
- **Context-aware**: Automatically includes the current page's content in its queries.
- **Adaptive UI**: The chat panel adapts its colors to match the current website's theme.
- **Streaming Responses**: Get fast, real-time answers from the LLM.
- **Provider Support**: Works with OpenRouter, OpenAI, Google Gemini, Anthropic, or any custom OpenAI-compatible API endpoint.
- **Privacy-focused**: Your API key is stored locally on your device and never transmitted to anyone other than the LLM provider you've configured. Keystroke detection is local only.

## Notes

- Permissions are broad (`<all_urls>`) to allow the injection of the chat panel on any site.
- The streaming parser expects an OpenAI-compatible SSE format.
