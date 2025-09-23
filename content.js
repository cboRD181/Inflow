(() => {
  const WORD_WINDOW_MS = 1200; // time window for alphabetic word + space

  let currentWord = "";
  let wordStartTs = 0;
  let panelHost = null; // container element in page DOM
  let panelRoot = null; // shadow root
  let optionsHost = null;
  let optionsRoot = null;
  let lastScrollY = 0;
  let scrolledViewportSnapshot = null;
  let conversationStarted = false;

  function isTypingInEditable(e) {
    const target = e.target;
    if (!target) return false;
    if (target.isContentEditable) return true;
    if (target.tagName) {
      const tag = target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return true;
    }
    return false;
  }

  function getVisibleText() {
    try {
      const textNodes = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function(node) {
            if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const rect = parent.getBoundingClientRect();
            const style = window.getComputedStyle(parent);
            return (rect.top < window.innerHeight &&
                    rect.bottom > 0 &&
                    style.display !== 'none' &&
                    style.visibility !== 'hidden')
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          }
        }
      );
      let node;
      while ((node = walker.nextNode())) {
        const t = node.textContent.trim();
        if (t) textNodes.push(t);
      }
      return textNodes.join('\n');
    } catch (err) {
      return '';
    }
  }

  function getDominantElement() {
    const elementCounts = new Map();
    const step = 50; // Sample every 50 pixels

    for (let x = 0; x < window.innerWidth; x += step) {
        for (let y = 0; y < window.innerHeight; y += step) {
            const element = document.elementFromPoint(x, y);
            if (element) {
                elementCounts.set(element, (elementCounts.get(element) || 0) + 1);
            }
        }
    }

    let dominantElement = null;
    let maxCount = 0;
    for (const [element, count] of elementCounts.entries()) {
        if (count > maxCount) {
            maxCount = count;
            dominantElement = element;
        }
    }
    return dominantElement;
}

function getEffectiveBackgroundColor(element) {
    let el = element;
    while (el) {
        const style = window.getComputedStyle(el);
        const color = style.backgroundColor;

        if (color && color !== 'transparent') {
            const match = color.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/);
            if (match) {
                const alpha = parseFloat(match[1]);
                if (alpha > 0) {
                    return color;
                }
            } else {
                return color; // Not a transparent rgba color
            }
        }
        el = el.parentElement;
    }
    return 'rgb(255, 255, 255)'; // Default to white
}

  function snapshotContext() {
    return {
      domain: location.hostname,
      title: document.title,
      viewportText: getVisibleText()
    };
  }

  function teardownCurrentPanel() {
    if (panelHost) {
      window.removeEventListener('keydown', onChatEscape, true);
      window.removeEventListener('mousedown', onChatClickOutside, true);
      window.removeEventListener('scroll', onWindowScroll, true);
      if (panelHost.parentNode) panelHost.parentNode.removeChild(panelHost);
      panelHost = null;
      panelRoot = null;
      conversationStarted = false;
    }
    if (optionsHost) {
      window.removeEventListener('keydown', onOptionsEscape, true);
      window.removeEventListener('mousedown', onOptionsClickOutside, true);
      if (optionsHost.parentNode) optionsHost.parentNode.removeChild(optionsHost);
      optionsHost = null;
      optionsRoot = null;
    }
  }

  function onChatEscape(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      teardownCurrentPanel();
    }
  }

  function onChatClickOutside(e) {
    if (!panelHost) return;
    const path = e.composedPath ? e.composedPath() : [];
    if (path.includes(panelHost)) return;
    if (e.target === panelHost || (e.target instanceof Node && panelHost.contains(e.target))) return;
    teardownCurrentPanel();
  }
  
  function onOptionsEscape(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      teardownCurrentPanel();
    }
  }

  function onOptionsClickOutside(e) {
    if (!optionsHost) return;
    const path = e.composedPath ? e.composedPath() : [];
    if (path.includes(optionsHost)) return;
    if (e.target === optionsHost || (e.target instanceof Node && optionsHost.contains(e.target))) return;
    teardownCurrentPanel();
  }

  function injectOptionsPanel() {
    if (optionsHost) return;
    teardownCurrentPanel(); // Close chat panel if open

    optionsHost = document.createElement('div');
    optionsHost.setAttribute('data-coflow', 'options');
    optionsHost.style.all = 'initial';
    optionsHost.style.position = 'fixed';
    optionsHost.style.top = '16px';
    optionsHost.style.right = '16px';
    optionsHost.style.width = '320px';
    optionsHost.style.height = 'auto';
    optionsHost.style.zIndex = '2147483647';
    optionsHost.style.pointerEvents = 'auto';
    optionsHost.style.userSelect = 'none';
    document.documentElement.appendChild(optionsHost);

    optionsRoot = optionsHost.attachShadow({ mode: 'open' });

    function getAdaptiveColors() {
      let pageBg = null;
      try {
        const dominantElement = getDominantElement();
        if (dominantElement) {
          pageBg = getEffectiveBackgroundColor(dominantElement);
        }
      } catch (e) { /* ignore */ }

      const isColorLight = (colorStr) => {
        if (!colorStr) return true;
        const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return true;
        const [r, g, b] = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
        return (0.299 * r + 0.587 * g + 0.114 * b) > 186;
      };

      if (pageBg) {
        const isLight = isColorLight(pageBg);
        return {
          '--panel-bg': pageBg,
          '--input-bg': pageBg,
          '--input-text-color': isLight ? '#111' : '#f3f3f3',
          '--bubble-text-color': isLight ? '#111' : '#f3f3f3',
          '--border-color': isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)',
        };
      }

      const isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (isSystemDark) {
        return {
          '--panel-bg': '#1c1c1e',
          '--input-bg': '#1c1c1e',
          '--input-text-color': '#f3f3f3',
          '--bubble-text-color': '#f3f3f3',
          '--border-color': '#4a4a4f',
        };
      } else {
        return {
          '--panel-bg': '#ffffff',
          '--input-bg': '#ffffff',
          '--input-text-color': '#111',
          '--bubble-text-color': '#111',
          '--border-color': '#d1d1d1',
        };
      }
    }
    const colors = getAdaptiveColors();

    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      *, *::before, *::after { box-sizing: border-box; }
      :root { color-scheme: light dark; }
      .wrapper {
        animation: fadeIn 150ms ease-in-out;
        background: var(--panel-bg);
        display: flex;
        flex-direction: column;
        height: auto;
        user-select: none;
        touch-action: none;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.6), 0 0 40px rgba(0, 0, 0, 0.15);
        border-radius: 14px;
        color: var(--bubble-text-color);
        font-family: -apple-system, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      }
      .content {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        padding: 12px;
        font-size: 12px;
      }
      h1 { font-size: 12px; margin: 0 0 10px; }
      label { display: block; margin: 10px 0 6px; font-weight: 600; }
      input[type="password"], input[type="text"], select { width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--input-text-color); box-sizing: border-box; font-family: -apple-system, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 12px; }
      #apiKey { padding-right: 90px; }
      .input-wrapper { position: relative; }
      #apiKey.obscured { -webkit-text-security: disc; }
      #apiKey.obscured:focus, #apiKey.obscured:active { -webkit-text-security: none; }
      #key-preview { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); pointer-events: none; opacity: 0.5; font-size: 12px; font-family: -apple-system, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: var(--input-text-color); }
      .row { display: flex; gap: 8px; margin-top: 10px; }
      button#save { flex: 1; padding: 10px; border-radius: 8px; border: none; background: #0A2540; color: white; cursor: pointer; font-family: -apple-system, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 600; }
      .note { opacity: 0.8; font-size: 12px; margin-top: 6px; }
      .position-switch { display: flex; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; margin-top: 4px; }
      .position-option { flex: 1; padding: 6px 8px; text-align: center; cursor: pointer; user-select: none; font-size: 12px; }
      .position-option:first-child { border-right: 1px solid var(--border-color); }
      .position-option.active { background: #0A2540; color: white; }
    `;

    const wrapper = document.createElement('div');
    wrapper.className = 'wrapper';

    for (const [key, value] of Object.entries(colors)) {
      wrapper.style.setProperty(key, value);
    }

    const content = document.createElement('div');
    content.className = 'content';

    content.innerHTML = `
      <label for="provider">API Provider</label>
      <select id="provider">
        <option value="openai">OpenAI</option>
        <option value="gemini">Google Gemini</option>
        <option value="anthropic">Anthropic</option>
        <option value="openrouter" selected>OpenRouter</option>
        <option value="custom">Custom</option>
      </select>

      <div id="custom-provider-options" style="display: none;">
        <label for="baseUrl">Base URL</label>
        <input id="baseUrl" type="text" placeholder="https://your-custom-host/v1/" />
      </div>

      <label for="apiKey">API Key</label>
      <div class="input-wrapper">
        <input id="apiKey" type="text" autocomplete="off" />
        <div id="key-preview"></div>
      </div>
      <div class="note">Stored locally only.</div>

      <label for="model">Model</label>
      <input id="model" type="text" placeholder="openai/gpt-4o-mini" />
      <div class="note">Leave blank to use default.</div>

      <label>Chat Window Position</label>
      <div class="position-switch">
        <div class="position-option" data-value="bottom-right">Bottom Right</div>
        <div class="position-option" data-value="top-right">Top Right</div>
      </div>

      <div class="row">
        <button id="save">Save</button>
      </div>
    `;

    wrapper.appendChild(content);

    optionsRoot.appendChild(style);
    optionsRoot.appendChild(wrapper);

    const apiKeyEl = () => optionsRoot.getElementById('apiKey');
    const modelEl = () => optionsRoot.getElementById('model');
    const providerEl = () => optionsRoot.getElementById('provider');
    const baseUrlEl = () => optionsRoot.getElementById('baseUrl');
    const customProviderOptionsEl = () => optionsRoot.getElementById('custom-provider-options');
    const positionOptions = optionsRoot.querySelectorAll('.position-option');
    const keyPreviewEl = () => optionsRoot.getElementById('key-preview');

    apiKeyEl().addEventListener('input', (e) => {
      if (e.target.value) {
        e.target.classList.add('obscured');
      } else {
        e.target.classList.remove('obscured');
      }
    });

    positionOptions.forEach(option => {
      option.addEventListener('click', () => {
        positionOptions.forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
      });
    });

    function handleProviderChange() {
      if (providerEl().value === 'custom') {
        customProviderOptionsEl().style.display = 'block';
      } else {
        customProviderOptionsEl().style.display = 'none';
      }
    }
    
    providerEl().addEventListener('change', handleProviderChange);

    function setProviderSpecificFields(provider, result) {
      const keys = result.api_keys || {};
      const currentKey = keys[provider] || '';
      const apiKeyInput = apiKeyEl();
      apiKeyInput.value = currentKey;

      if (currentKey) {
        keyPreviewEl().textContent = `${currentKey.substring(0, 4)}...${currentKey.substring(currentKey.length - 4)}`;
        apiKeyInput.classList.add('obscured');
      } else {
        keyPreviewEl().textContent = '';
        apiKeyInput.classList.remove('obscured');
      }

      const models = result.api_models || {};
      modelEl().value = models[provider] || '';
    }

    function initialLoad() {
      chrome.storage.local.get(['api_provider', 'api_keys', 'api_models', 'api_base_url', 'chat_window_position'], (result) => {
        const provider = result.api_provider || 'openrouter';
        providerEl().value = provider;
        
        baseUrlEl().value = result.api_base_url || '';
        const position = result.chat_window_position || 'bottom-right';
        positionOptions.forEach(el => {
          el.classList.toggle('active', el.dataset.value === position);
        });
        
        setProviderSpecificFields(provider, result);
        handleProviderChange();
      });
    }

    providerEl().addEventListener('change', () => {
      const provider = providerEl().value;
      chrome.storage.local.get(['api_keys', 'api_models'], (result) => {
        setProviderSpecificFields(provider, result);
      });
    });

    function save() {
      chrome.storage.local.get(['api_keys', 'api_models'], (result) => {
        const keys = result.api_keys || {};
        const newKey = apiKeyEl().value.trim();
        const provider = providerEl().value;
        if (newKey) {
          keys[provider] = newKey;
        } else {
          delete keys[provider];
        }

        const models = result.api_models || {};
        const newModel = modelEl().value.trim();
        if (newModel) {
          models[provider] = newModel;
        } else {
          delete models[provider];
        }

        const baseUrl = baseUrlEl().value.trim();
        const position = optionsRoot.querySelector('.position-option.active').dataset.value;

        chrome.storage.local.set({ 
          api_provider: provider,
          api_keys: keys,
          api_models: models,
          api_base_url: baseUrl,
          chat_window_position: position 
        }, () => {
          teardownCurrentPanel();
        });
      });
    }

    optionsRoot.getElementById('save').addEventListener('click', save);
    initialLoad();

    window.addEventListener('keydown', onOptionsEscape, true);
    window.addEventListener('mousedown', onOptionsClickOutside, true);
  }

  function toggleOptionsPanel() {
    if (optionsHost) {
      teardownCurrentPanel();
    } else {
      injectOptionsPanel();
    }
  }

  function injectPanel(initialQuery) {
    if (panelHost) return;
    teardownCurrentPanel(); // Close options panel if open

    chrome.storage.local.get(['chat_window_position'], (result) => {
      const position = result.chat_window_position || 'bottom-right';

      panelHost = document.createElement('div');
      panelHost.setAttribute('data-coflow', 'panel');

      // Reset all styles on the host element itself to prevent page CSS from leaking.
      // This is more robust than just giving it a unique name.
      panelHost.style.all = 'initial';

      // Now, re-apply the styles needed for positioning our widget container.
      panelHost.style.position = 'fixed';
      if (position === 'bottom-right') {
        panelHost.style.bottom = '16px';
      } else {
        panelHost.style.top = '16px';
      }
      panelHost.style.right = '16px';
      panelHost.style.width = '460px';
      panelHost.style.height = 'auto';
      panelHost.style.zIndex = '2147483647';
      panelHost.style.pointerEvents = 'auto';
      panelHost.style.userSelect = 'none';
      document.documentElement.appendChild(panelHost);

      panelRoot = panelHost.attachShadow({ mode: 'open' });

      // --- Color Adaptation Logic ---
      function getAdaptiveColors() {
        let pageBg = null;
        try {
          const dominantElement = getDominantElement();
          if (dominantElement) {
            pageBg = getEffectiveBackgroundColor(dominantElement);
          }
        } catch (e) { /* ignore */ }

        const isColorLight = (colorStr) => {
          if (!colorStr) return true;
          const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (!match) return true; // Default to assuming light for non-rgb colors
          const [r, g, b] = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
          return (0.299 * r + 0.587 * g + 0.114 * b) > 186;
        };

        const toRgba = (str, alpha) => {
          const match = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (!match) return `rgba(0,0,0,${alpha})`; // Fallback for invalid format
          return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
        };

        if (pageBg) {
          const isLight = isColorLight(pageBg);
          return {
            '--input-bg': pageBg,
            '--bot-bubble-bg': pageBg,
            '--input-text-color': isLight ? '#111' : '#f3f3f3',
            '--bubble-text-color': isLight ? '#111' : '#f3f3f3',
            '--border-color': isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)',
            '--user-bubble-bg': '#0A2540',
            '--user-bubble-text-color': '#fff',
            '--tint-bg': toRgba(pageBg, 0.2)
          };
        }

        // Fallback to theme
        const isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (isSystemDark) {
          return { // Dark theme (current off-black)
            '--input-bg': '#1c1c1e',
            '--bot-bubble-bg': '#2f2f33',
            '--input-text-color': '#f3f3f3',
            '--bubble-text-color': '#f3f3f3',
            '--border-color': '#4a4a4f',
            '--user-bubble-bg': '#0A2540',
            '--user-bubble-text-color': '#fff',
            '--tint-bg': 'rgba(255, 255, 255, 0.2)'
          };
        } else {
          return { // Light theme (off-white)
            '--input-bg': '#ffffff',
            '--bot-bubble-bg': '#f0f2f5',
            '--input-text-color': '#111',
            '--bubble-text-color': '#111',
            '--border-color': '#d1d1d1',
            '--user-bubble-bg': '#0A2540',
            '--user-bubble-text-color': '#fff',
            '--tint-bg': 'rgba(0, 0, 0, 0.2)'
          };
        }
      }
      const colors = getAdaptiveColors();

      // Liquid Glass styles and chat UI
      const style = document.createElement('style');
      style.textContent = `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        *, *::before, *::after { box-sizing: border-box; }
        :root { color-scheme: light dark; }
        .wrapper { animation: fadeIn 150ms ease-in-out; position: relative; display: flex; flex-direction: column; height: auto; max-height: 520px; overflow: hidden; user-select: none; touch-action: none; will-change: left, top, transform; box-shadow: 0 18px 48px rgba(0, 0, 0, 0.6), 0 0 40px rgba(0, 0, 0, 0.15); transition: height 200ms ease, transform 120ms ease, box-shadow 200ms ease, border-radius 200ms ease; transform: scale(1); border-radius: 14px; }
        .effect { position: absolute; z-index: 0; inset: 0; backdrop-filter: blur(4px); filter: url(#glass-distortion); overflow: hidden; isolation: isolate; border-radius: 14px; }
        .tint { z-index: 1; position: absolute; inset: 0; background: var(--tint-bg); border-radius: 14px; }
        .shine { position: absolute; inset: 0; z-index: 2; overflow: hidden; box-shadow: inset 2px 2px 1px 0 rgba(255, 255, 255, 0.1), inset -1px -1px 1px 1px rgba(255, 255, 255, 0.1); border-radius: 14px; }
        .content { position: relative; z-index: 3; width: 100%; height: 100%; display: flex; flex-direction: column; color: var(--bubble-text-color); }
        
        .chat, .header { display: none; }
        .wrapper.is-expanded .chat { display: block; max-height: 400px; overflow-y: auto; }
        .wrapper.is-expanded .header { display: flex; }

        .header { align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--border-color); }
        .live-indicator { width: 8px; height: 8px; background-color: #28a745; border-radius: 50%; flex-shrink: 0; }
        .title { font-family: -apple-system, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.7; }

        .chat { overflow: auto; padding: 10px; }
        .message { user-select: text; margin: 6px 0; padding: 8px 10px; border-radius: 10px; max-width: 88%; white-space: pre-wrap; word-wrap: break-word; font-family: -apple-system, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 15px; border: 1px solid var(--border-color); }
        .message.user { background: var(--user-bubble-bg); color: var(--user-bubble-text-color); margin-left: auto; }
        .message.bot { background: var(--bot-bubble-bg); color: var(--bubble-text-color); }
        .message.loading span { animation: blink 1.4s infinite both; }
        .message.loading span:nth-child(2) { animation-delay: 0.2s; }
        .message.loading span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes blink { 0% { opacity: 0.2; } 20% { opacity: 1; } 100% { opacity: 0.2; } }
 
        .message p, .message ul, .message ol { margin: 0.5em 0; }
        .message > *:first-child { margin-top: 0; }
        .message > *:last-child { margin-bottom: 0; }
        .message strong { font-weight: 600; }
        .message em { font-style: italic; }
        .message ul, .message ol { padding-left: 20px; }
        .message li { margin-bottom: 0.25em; }

        .inputRow { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-top: none; }
        .wrapper.is-expanded .inputRow { border-top: 1px solid var(--border-color); }
        .question { flex: 1; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--input-text-color); font-family: -apple-system, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 15px; }
        
        .question:focus, .question:focus-visible { outline: none; box-shadow: none; }
        .send { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border-radius: 50%; border: none; background: #0A2540; color: white; cursor: pointer; flex-shrink: 0; }
      `;

      const svgFilter = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgFilter.setAttribute('width', '0');
      svgFilter.setAttribute('height', '0');
      svgFilter.setAttribute('style', 'position:absolute');
      svgFilter.innerHTML = `
        <filter
          id="glass-distortion"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          filterUnits="objectBoundingBox"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.01 0.01"
            numOctaves="1"
            seed="5"
            result="turbulence"
          />
          <feComponentTransfer in="turbulence" result="mapped">
            <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
            <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
            <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
          </feComponentTransfer>
          <feGaussianBlur in="turbulence" stdDeviation="3" result="softMap" />
          <feSpecularLighting
            in="softMap"
            surfaceScale="5"
            specularConstant="1"
            specularExponent="100"
            lightingColor="white"
            result="specLight"
          >
            <fePointLight x="-200" y="-200" z="300" />
          </feSpecularLighting>
          <feComposite
            in="specLight"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3="1"
            k4="0"
            result="litImage"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softMap"
            scale="150"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      `;

      const wrapper = document.createElement('div');
      wrapper.className = 'wrapper';

      // Apply adaptive colors via CSS custom properties
      for (const [key, value] of Object.entries(colors)) {
        wrapper.style.setProperty(key, value);
      }

      const effect = document.createElement('div'); effect.className = 'effect';
      const tint = document.createElement('div'); tint.className = 'tint';
      const shine = document.createElement('div'); shine.className = 'shine';
      const content = document.createElement('div'); content.className = 'content';

      // Build content UI
      const header = document.createElement('div'); header.className = 'header';
      const liveIndicator = document.createElement('div'); liveIndicator.className = 'live-indicator';
      const title = document.createElement('div'); title.className = 'title';
      const pageTitleText = document.title.length > 50 ? document.title.substring(0, 47) + '...' : document.title;
      title.textContent = pageTitleText;
      
      header.appendChild(liveIndicator);
      header.appendChild(title);

      const chat = document.createElement('div'); chat.className = 'chat'; chat.id = 'chat';

      const inputRow = document.createElement('form'); inputRow.className = 'inputRow'; inputRow.id = 'inputForm';
      const question = document.createElement('input'); question.className = 'question'; question.id = 'question'; question.type = 'text'; question.placeholder = 'Ask anything…'; question.autocomplete = 'off';
      const send = document.createElement('button'); send.className = 'send'; send.id = 'sendBtn'; send.type = 'submit';
      send.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`;
      inputRow.appendChild(question); inputRow.appendChild(send);

      content.appendChild(header);
      content.appendChild(chat);
      content.appendChild(inputRow);

      wrapper.appendChild(effect);
      wrapper.appendChild(tint);
      wrapper.appendChild(shine);
      wrapper.appendChild(content);

      panelRoot.appendChild(style);
      panelRoot.appendChild(svgFilter);
      panelRoot.appendChild(wrapper);

      // Focus input
      try { question.focus(); } catch (e) {}

      // Smooth scrolling helpers
      const SCROLL_THRESHOLD_PX = 32;
      function isNearBottom() { return (chat.scrollTop + chat.clientHeight) >= (chat.scrollHeight - SCROLL_THRESHOLD_PX); }
      function smoothScrollToBottom() { chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' }); }

      // Chat state
      let context = null;
      let messages = [];
      let controller = null;
      let settings = {};
      let isExpanded = false;

      function appendMessage(role, text) {
        const el = document.createElement('div');
        el.className = `message ${role}`;
        el.textContent = text;
        chat.appendChild(el);
        return el;
      }

      let botEl = null;
      let characterBuffer = [];
      let isTyping = false;
      let finalBotText = "";

      function simpleMarkdownParse(text) {
        let html = text
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/_(.*?)_/g, '<em>$1</em>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>');

        const lines = html.split('\n');
        let processedHtml = '';
        let inList = null; // null, 'ul', or 'ol'

        for (const line of lines) {
          const isUl = /^\s*[-*]\s/.test(line);
          const isOl = /^\s*\d+\.\s/.test(line);

          if (isUl) {
            if (inList !== 'ul') {
              if (inList) processedHtml += `</${inList}>`;
              processedHtml += '<ul>';
              inList = 'ul';
            }
            processedHtml += `<li>${line.replace(/^\s*[-*]\s/, '')}</li>`;
          } else if (isOl) {
            if (inList !== 'ol') {
              if (inList) processedHtml += `</${inList}>`;
              processedHtml += '<ol>';
              inList = 'ol';
            }
            processedHtml += `<li>${line.replace(/^\s*\d+\.\s/, '')}</li>`;
          } else {
            if (inList) {
              processedHtml += `</${inList}>`;
              inList = null;
            }
            if (line.trim()) {
              processedHtml += `<p>${line}</p>`;
            }
          }
        }
        if (inList) {
          processedHtml += `</${inList}>`;
        }
        return processedHtml;
      }
      
      function typeCharacters() {
        if (characterBuffer.length === 0) {
          isTyping = false;
          // One final render to ensure markdown is correct
          if (botEl) {
            botEl.innerHTML = simpleMarkdownParse(finalBotText);
          }
          return;
        }

        isTyping = true;
        const charsToType = Math.min(characterBuffer.length, Math.floor(Math.random() * 3) + 2);
        finalBotText += characterBuffer.splice(0, charsToType).join('');
        
        if (botEl) {
          const shouldScroll = isNearBottom();
          botEl.innerHTML = simpleMarkdownParse(finalBotText);
          if (shouldScroll) smoothScrollToBottom();
        }
        
        setTimeout(typeCharacters, 25);
      }

      function appendLoadingMessage() {
        const el = document.createElement('div');
        el.className = 'message bot loading';
        el.innerHTML = '<span>.</span><span>.</span><span>.</span>';
        chat.appendChild(el);
        smoothScrollToBottom();
        return el;
      }

      function buildPrompt(userText) {
        const headerText = 'You are an AI assistant analyzing webpage content that a user is currently viewing. Use the provided viewport context to answer their question accurately and helpfully.\n\nDo not mention the context or regurgitate it. The user knows you can see their current viewport. Answer directly, leaving the shared context implicit.  Your job is not to use the context as your knowledge bank, but instead to use it to better understand the question and answer it accurately and helpfully.';
        const ctx = context ? `\n\nDOMAIN: ${context.domain}\nTITLE: ${context.title}\nVIEWPORT CONTEXT:\n${context.viewportText}` : '';
        return `${headerText}${ctx}\n\nUSER QUERY:\n${userText}`;
      }

      function loadSettings() {
        return new Promise((resolve) => {
          chrome.storage.local.get(['api_provider', 'api_keys', 'api_models', 'api_base_url'], (result) => {
            const provider = result.api_provider || 'openrouter';
            const keys = result.api_keys || {};
            const models = result.api_models || {};
            settings = {
              provider: provider,
              apiKey: keys[provider] || '',
              baseUrl: result.api_base_url || '',
              model: models[provider] || null
            };
            resolve(settings);
          });
        });
      }

      async function streamCompletion(userText) {
        const prompt = buildPrompt(userText);

        let apiUrl = '';
        switch (settings.provider) {
          case 'openai':
            apiUrl = 'https://api.openai.com/v1/chat/completions';
            break;
          case 'gemini':
            apiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
            break;
          case 'anthropic':
            apiUrl = 'https://api.anthropic.com/v1/chat/completions';
            break;
          case 'openrouter':
            apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
            break;
          case 'custom':
            if (settings.baseUrl) {
              const cleanedUrl = settings.baseUrl.trim().replace(/\/+$/, '');
              if (cleanedUrl.endsWith('/chat/completions')) {
                apiUrl = cleanedUrl;
              } else {
                apiUrl = `${cleanedUrl}/chat/completions`;
              }
            } else {
              throw new Error('Custom base URL is not set.');
            }
            break;
          default:
            apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
        }

        const model = settings.model || 'openai/gpt-4o-mini';
        const payload = {
          apiUrl,
          model,
          messages: [
            { role: 'system', content: 'Be concise and helpful.' },
            ...messages,
            { role: 'user', content: prompt }
          ],
          apiKey: settings.apiKey,
          provider: settings.provider
        };

        const loadingEl = appendLoadingMessage();

        const port = chrome.runtime.connect({ name: 'streamCompletion' });
        port.postMessage({ action: 'streamCompletion', payload });

        port.onMessage.addListener((response) => {
          if (response.error) {
            if (loadingEl) {
              loadingEl.remove();
            }
            appendMessage('bot', `Error: ${response.error}`);
            port.disconnect();
            return;
          }
          if (response.done) {
            messages.push({ role: 'user', content: prompt });
            messages.push({ role: 'assistant', content: finalBotText });
            port.disconnect();
            return;
          }

          const chunk = response.chunk;
          if (chunk) {
            const lines = chunk.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const payload = trimmed.slice(5).trim();
              if (payload === '[DONE]') continue;
              try {
                const json = JSON.parse(payload);
                const delta = json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || '';
                if (delta) {
                  if (!botEl) {
                    if (loadingEl) {
                      loadingEl.remove();
                    }
                    botEl = appendMessage('bot', '');
                  }
                  characterBuffer.push(...delta.split(''));
                  if (!isTyping) {
                    typeCharacters();
                  }
                }
              } catch (e) {}
            }
          }
        });

        port.onDisconnect.addListener(() => {
          console.log('Streaming port disconnected.');
        });
      }

      inputRow.addEventListener('submit', (evt) => {
        evt.preventDefault();

        const text = question.value.trim();
        if (!text) return;

        // Expand the view only on the first valid message submission
        if (!isExpanded) {
          wrapper.classList.add('is-expanded');
          isExpanded = true;
          conversationStarted = true;
          lastScrollY = window.scrollY;
          context = snapshotContext();
        }

        if (scrolledViewportSnapshot) {
          context = scrolledViewportSnapshot;
          scrolledViewportSnapshot = null; // Consume it
        }

        appendMessage('user', text);
        question.value = '';

        // Reset for new response
        botEl = null;
        finalBotText = "";
        characterBuffer.length = 0;

        loadSettings().then((loadedSettings) => {
          if (!loadedSettings.apiKey) {
            appendMessage('bot', 'Please set your API key in the settings.');
            return;
          }
          streamCompletion(text).catch((e) => {
            appendMessage('bot', `Error: ${e.message}`);
          });
        });
      });

      // Seed initial query and focus
      if (initialQuery) {
        question.value = initialQuery;
      }
      setTimeout(() => { try { question.focus(); } catch (e) {} }, 0);

      window.addEventListener('keydown', onChatEscape, true);
      window.addEventListener('mousedown', onChatClickOutside, true);
      window.addEventListener('scroll', onWindowScroll, true);
    });
  }

  function recordKey(e) {
    if (isTypingInEditable(e)) {
      currentWord = '';
      wordStartTs = 0;
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const now = Date.now();

    // Space triggers invocation if preceded by quick alphabetic word
    if (e.key === ' ') {
      if (currentWord && now - wordStartTs <= WORD_WINDOW_MS) {
        // Prevent page scroll caused by space
        e.preventDefault();
        e.stopPropagation();
        const initialQuery = currentWord + ' ';
        currentWord = '';
        wordStartTs = 0;
        injectPanel(initialQuery);
      } else {
        // No active word → ignore and allow default behavior
      }
      return;
    }

    // Backspace edits the current word if present
    if (e.key === 'Backspace') {
      if (currentWord) {
        currentWord = currentWord.slice(0, -1);
      }
      return;
    }

    // Only track alphabetic keys for the word
    if (e.key.length === 1 && /[a-zA-Z']/.test(e.key)) {
      if (!currentWord || (now - wordStartTs) > WORD_WINDOW_MS) {
        currentWord = '';
        wordStartTs = now;
      }
      currentWord += e.key;
      return;
    }

    // Any other key breaks the word
    if (currentWord) {
      currentWord = '';
      wordStartTs = 0;
    }
  }

  function onWindowScroll() {
    if (!conversationStarted) return;

    const SCROLL_THRESHOLD = window.innerHeight / 2;
    if (Math.abs(window.scrollY - lastScrollY) > SCROLL_THRESHOLD) {
      const newSnapshot = snapshotContext();
      if (
        !scrolledViewportSnapshot ||
        (scrolledViewportSnapshot.viewportText !== newSnapshot.viewportText &&
         Math.abs(scrolledViewportSnapshot.viewportText.length - newSnapshot.viewportText.length) > 100)
      ) {
        scrolledViewportSnapshot = newSnapshot;
      }
      lastScrollY = window.scrollY;
    }
  }

  // Start listening
  window.addEventListener('keydown', (e) => {
    if (!panelHost) {
      if (!isTypingInEditable(e)) {
      }
      recordKey(e);
    }
  }, true);

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "coflow_toggle_options") {
      toggleOptionsPanel();
    }
  });
})();


