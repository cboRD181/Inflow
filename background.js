chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'streamCompletion') {
    // This is a fire-and-forget message for the old implementation.
    // The new implementation will use chrome.runtime.connect, so we can
    // leave this listener here for now, but it won't be used for streaming.
    return true;
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'streamCompletion') {
    port.onMessage.addListener(async (request) => {
      if (request.action === 'streamCompletion') {
        const { apiUrl, model, messages, apiKey, provider } = request.payload;
        await streamCompletion(apiUrl, model, messages, apiKey, provider, port);
      }
    });
  }
});

async function streamCompletion(apiUrl, model, messages, apiKey, provider, port) {
  try {
    console.log('--- Stream Completion Request ---');
    console.log('API URL:', apiUrl);
    console.log('Model:', model);
    console.log('Messages:', JSON.stringify(messages, null, 2));

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://inflow.local',
        'X-Title': 'Inflow Extension'
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages
      })
    });

    if (!res.ok) {
      const text = await res.text();
      port.postMessage({ error: `API error: ${res.status} ${text}` });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('--- Stream finished ---');
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      console.log('Received chunk:', chunk);
      port.postMessage({ chunk });
    }
    port.postMessage({ done: true });
  } catch (e) {
    console.error('--- Stream Completion Error ---', e);
    port.postMessage({ error: e.message });
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: "coflow_toggle_options" });
  }
});
