<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api/client';
import { useAssistantStore, type AssistantSearchFilters } from '@/stores/assistant';

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface AssistantAction {
  type: 'apply_search' | 'open_project';
  filters?: AssistantSearchFilters;
  projectId?: number;
}

interface ChatResponse {
  message: string;
  actions: AssistantAction[];
}

const SUGGESTIONS = [
  'Find active lidar projects',
  'How many ESTO projects are completed?',
  'Show industry-led radar projects',
  'Who works on formation flying?',
];

const store = useAssistantStore();
const router = useRouter();
const route = useRoute();

const input = ref('');
const sending = ref(false);
const error = ref('');
const messages = ref<ChatMessage[]>([
  {
    role: 'assistant',
    content:
      'Hi — I can answer questions about this ESTO technology portfolio and run searches for you. Try “find active lidar projects” or ask about a PI.',
  },
]);
const listEl = ref<HTMLElement | null>(null);

const isAdminRoute = computed(() => route.path.startsWith('/admin'));
const showFab = computed(() => !isAdminRoute.value);

async function scrollToBottom() {
  await nextTick();
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
}

watch(
  () => messages.value.length,
  () => scrollToBottom(),
);

watch(
  () => store.open,
  (open) => {
    if (open) scrollToBottom();
  },
);

function useSuggestion(text: string) {
  input.value = text;
  void send();
}

async function applyActions(actions: AssistantAction[]) {
  for (const action of actions) {
    if (action.type === 'apply_search' && action.filters) {
      store.requestSearch(action.filters);
      if (route.name !== 'search') {
        await router.push({ name: 'search' });
      }
    } else if (action.type === 'open_project' && action.projectId) {
      store.closePanel();
      await router.push({ name: 'project-detail', params: { id: String(action.projectId) } });
    }
  }
}

async function send() {
  const text = input.value.trim();
  if (!text || sending.value) return;

  error.value = '';
  messages.value.push({ role: 'user', content: text });
  input.value = '';
  sending.value = true;

  const payload = {
    messages: messages.value.slice(-12).map((m) => ({
      role: m.role,
      content: m.content,
    })),
    searchContext: store.liveContext ?? undefined,
  };

  const baseURL = api.defaults.baseURL || '/api';
  console.info('[HelpAgent] POST', `${baseURL}/assistant/chat`, {
    messageCount: payload.messages.length,
    searchContext: payload.searchContext,
  });

  try {
    const { data, status } = await api.post<ChatResponse>('/assistant/chat', payload);
    console.info('[HelpAgent] response', {
      status,
      actions: data.actions?.map((a) => a.type) ?? [],
      replyPreview: data.message?.slice(0, 120),
    });

    messages.value.push({ role: 'assistant', content: data.message });
    if (data.actions?.length) {
      await applyActions(data.actions);
    }
  } catch (err: unknown) {
    const ax = err as {
      message?: string;
      code?: string;
      response?: { status?: number; data?: { message?: string | string[]; statusCode?: number } };
      config?: { baseURL?: string; url?: string };
    };
    const status = ax.response?.status;
    const raw = ax.response?.data?.message;
    const apiMessage = Array.isArray(raw) ? raw.join(', ') : raw;
    const detail =
      apiMessage ||
      (status ? `HTTP ${status}` : null) ||
      ax.message ||
      'Unknown error';

    console.error('[HelpAgent] request failed', {
      baseURL: ax.config?.baseURL ?? baseURL,
      url: ax.config?.url,
      status,
      code: ax.code,
      detail,
      body: ax.response?.data,
    });

    error.value = detail;
    let userFacing: string;
    if (!ax.response) {
      userFacing = `Could not reach the API at ${baseURL}/assistant/chat (${detail}). Is the API running on port 3001?`;
    } else if (
      status === 503 &&
      /not configured|GEMINI_API_KEY is missing|Set GEMINI_API_KEY in the environment/i.test(detail)
    ) {
      userFacing =
        'The help agent is not configured yet. Add GEMINI_API_KEY to the API .env and restart the server.';
    } else if (
      status === 502 ||
      /Gemini API|Connect Timeout|fetch failed|UND_ERR_CONNECT_TIMEOUT/i.test(detail)
    ) {
      userFacing =
        'The API is running and your key is loaded, but the call to Google Gemini timed out or failed. ' +
        'That is usually intermittent outbound network blocking to generativelanguage.googleapis.com. ' +
        `Details: ${detail}`;
    } else {
      userFacing = `Assistant error (${status ?? 'unknown'}): ${detail}`;
    }
    messages.value.push({ role: 'assistant', content: userFacing });
  } finally {
    sending.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    void send();
  }
}
</script>

<template>
  <template v-if="showFab">
    <button
      type="button"
      class="help-agent-fab"
      :class="{ 'help-agent-fab--open': store.open, 'help-agent-fab--idle': !store.open }"
      :aria-label="store.open ? 'Close help agent' : 'Open help agent'"
      :title="store.open ? 'Close' : 'Ask the portfolio helper'"
      @click="store.togglePanel()"
    >
      <span class="help-agent-fab__ring" aria-hidden="true" />
      <span class="help-agent-fab__bubble" aria-hidden="true">
        <span v-if="!store.open" class="help-agent-fab__hint">Ask me!</span>
        <!-- Cute little satellite buddy -->
        <svg
          v-if="!store.open"
          class="help-agent-mascot"
          viewBox="0 0 64 64"
          width="40"
          height="40"
          aria-hidden="true"
        >
          <ellipse class="mascot-shadow" cx="32" cy="58" rx="14" ry="3" />
          <g class="mascot-body">
            <line class="mascot-antenna" x1="32" y1="14" x2="32" y2="6" />
            <circle class="mascot-antenna-tip" cx="32" cy="5" r="3" />
            <rect class="mascot-panel" x="10" y="28" width="8" height="16" rx="2" />
            <rect class="mascot-panel" x="46" y="28" width="8" height="16" rx="2" />
            <rect class="mascot-shell" x="16" y="16" width="32" height="30" rx="10" />
            <rect class="mascot-face" x="20" y="22" width="24" height="16" rx="6" />
            <g class="mascot-eyes">
              <circle class="mascot-eye" cx="27" cy="30" r="2.6" />
              <circle class="mascot-eye" cx="37" cy="30" r="2.6" />
            </g>
            <path class="mascot-smile" d="M26 34.5c2 2.2 10 2.2 12 0" />
            <circle class="mascot-blush" cx="23.5" cy="33" r="1.6" />
            <circle class="mascot-blush" cx="40.5" cy="33" r="1.6" />
          </g>
        </svg>
        <v-icon v-else icon="mdi-close" size="28" color="white" />
      </span>
    </button>

    <v-navigation-drawer
      v-model="store.open"
      location="right"
      temporary
      width="400"
      class="help-agent-drawer"
    >
      <div class="help-agent-header pa-4">
        <div class="d-flex align-center ga-3">
          <div class="help-agent-header-mascot" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="36" height="36">
              <rect fill="#0b3d91" x="16" y="16" width="32" height="30" rx="10" />
              <rect fill="#e8f2ff" x="20" y="22" width="24" height="16" rx="6" />
              <circle fill="#0b3d91" cx="27" cy="30" r="2.4" />
              <circle fill="#0b3d91" cx="37" cy="30" r="2.4" />
              <path
                fill="none"
                stroke="#0b3d91"
                stroke-width="1.8"
                stroke-linecap="round"
                d="M26 34.5c2 2.2 10 2.2 12 0"
              />
              <circle fill="#8fd1fb" cx="32" cy="5" r="3" />
              <line stroke="#8fd1fb" stroke-width="2" x1="32" y1="14" x2="32" y2="7" />
            </svg>
          </div>
          <div>
            <div class="text-subtitle-1 font-weight-bold">Portfolio Helper</div>
            <div class="text-caption text-medium-emphasis">Ask questions or run a search</div>
          </div>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" density="comfortable" @click="store.closePanel()" />
        </div>
      </div>

      <v-divider />

      <div ref="listEl" class="help-agent-messages pa-4">
        <div
          v-for="(m, i) in messages"
          :key="i"
          class="help-agent-bubble mb-3"
          :class="m.role === 'user' ? 'help-agent-bubble--user' : 'help-agent-bubble--assistant'"
        >
          {{ m.content }}
        </div>
        <div v-if="sending" class="text-caption text-medium-emphasis d-flex align-center ga-2">
          <v-progress-circular indeterminate size="16" width="2" />
          Looking that up…
        </div>
      </div>

      <div class="help-agent-suggestions px-4 pb-2">
        <v-chip
          v-for="s in SUGGESTIONS"
          :key="s"
          size="small"
          variant="outlined"
          class="ma-1"
          :disabled="sending"
          @click="useSuggestion(s)"
        >
          {{ s }}
        </v-chip>
      </div>

      <div class="help-agent-composer pa-4 pt-2">
        <v-textarea
          v-model="input"
          rows="2"
          auto-grow
          max-rows="4"
          hide-details
          placeholder="Ask about projects, PIs, categories…"
          variant="outlined"
          density="comfortable"
          :disabled="sending"
          @keydown="onKeydown"
        />
        <div class="d-flex justify-end mt-2">
          <v-btn
            color="primary"
            prepend-icon="mdi-send"
            :loading="sending"
            :disabled="!input.trim()"
            @click="send"
          >
            Send
          </v-btn>
        </div>
      </div>
    </v-navigation-drawer>
  </template>
</template>

<style scoped>
.help-agent-fab {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2000;
  width: 72px;
  height: 72px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.help-agent-fab__ring {
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  background: rgba(11, 61, 145, 0.18);
  transform: scale(0.92);
  opacity: 0;
}

.help-agent-fab__bubble {
  position: absolute;
  inset: 8px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: linear-gradient(160deg, #1a75cf 0%, #0b3d91 70%);
  box-shadow:
    0 10px 24px rgba(11, 61, 145, 0.35),
    0 2px 0 rgba(255, 255, 255, 0.18) inset;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease;
}

.help-agent-fab__hint {
  position: absolute;
  right: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  white-space: nowrap;
  padding: 6px 10px;
  border-radius: 999px;
  background: #0b3d91;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  box-shadow: 0 6px 16px rgba(11, 61, 145, 0.28);
  opacity: 0;
  pointer-events: none;
  animation: help-hint-pop 7s ease-in-out infinite;
}

.help-agent-fab__hint::after {
  content: '';
  position: absolute;
  right: -5px;
  top: 50%;
  width: 10px;
  height: 10px;
  background: #0b3d91;
  transform: translateY(-50%) rotate(45deg);
}

.help-agent-fab:hover .help-agent-fab__bubble,
.help-agent-fab:focus-visible .help-agent-fab__bubble {
  transform: scale(1.06);
  box-shadow:
    0 14px 28px rgba(11, 61, 145, 0.42),
    0 2px 0 rgba(255, 255, 255, 0.22) inset;
}

.help-agent-fab:focus-visible {
  outline: none;
}

.help-agent-fab:focus-visible .help-agent-fab__bubble {
  outline: 2px solid #8fd1fb;
  outline-offset: 3px;
}

.help-agent-fab--idle {
  animation: help-float 3.2s ease-in-out infinite;
}

.help-agent-fab--idle .help-agent-fab__ring {
  animation: help-pulse 3.2s ease-out infinite;
}

.help-agent-fab--open {
  animation: none;
}

.help-agent-fab--open .help-agent-fab__bubble {
  background: linear-gradient(160deg, #3d4a63 0%, #1b1f27 75%);
}

.help-agent-mascot {
  overflow: visible;
}

.mascot-shell {
  fill: #f4f8ff;
}

.mascot-face {
  fill: #dcecff;
}

.mascot-panel {
  fill: #8fd1fb;
}

.mascot-antenna {
  stroke: #8fd1fb;
  stroke-width: 2.5;
  stroke-linecap: round;
}

.mascot-antenna-tip {
  fill: #ffd166;
}

.mascot-eye {
  fill: #0b3d91;
  transform-origin: center;
  transform-box: fill-box;
}

.mascot-smile {
  fill: none;
  stroke: #0b3d91;
  stroke-width: 1.8;
  stroke-linecap: round;
}

.mascot-blush {
  fill: #ff9eb5;
  opacity: 0.7;
}

.mascot-shadow {
  fill: rgba(8, 20, 48, 0.22);
}

.help-agent-fab--idle .mascot-body {
  transform-origin: 32px 40px;
  animation: help-wiggle 3.2s ease-in-out infinite;
}

.help-agent-fab--idle .mascot-antenna-tip {
  transform-origin: 32px 5px;
  animation: help-antenna 1.6s ease-in-out infinite;
}

.help-agent-fab--idle .mascot-eyes {
  animation: help-blink 4.5s step-end infinite;
}

.help-agent-fab--idle .mascot-shadow {
  transform-origin: 32px 58px;
  animation: help-shadow 3.2s ease-in-out infinite;
}

.help-agent-header-mascot {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: linear-gradient(160deg, rgba(26, 117, 207, 0.18), rgba(11, 61, 145, 0.1));
}

.help-agent-drawer {
  display: flex;
  flex-direction: column;
}

.help-agent-header {
  background: linear-gradient(135deg, rgba(11, 61, 145, 0.12), rgba(26, 117, 207, 0.06));
}

.help-agent-messages {
  flex: 1;
  overflow-y: auto;
  min-height: 280px;
  max-height: calc(100vh - 320px);
}

.help-agent-bubble {
  max-width: 92%;
  padding: 10px 12px;
  border-radius: 12px;
  white-space: pre-wrap;
  line-height: 1.45;
  font-size: 0.925rem;
}

.help-agent-bubble--user {
  margin-left: auto;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  border-bottom-right-radius: 4px;
}

.help-agent-bubble--assistant {
  margin-right: auto;
  background: rgba(var(--v-theme-on-surface), 0.06);
  border-bottom-left-radius: 4px;
}

.help-agent-composer {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

@keyframes help-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

@keyframes help-pulse {
  0% {
    transform: scale(0.9);
    opacity: 0.55;
  }
  70%,
  100% {
    transform: scale(1.35);
    opacity: 0;
  }
}

@keyframes help-wiggle {
  0%,
  100% {
    transform: rotate(-2deg);
  }
  50% {
    transform: rotate(2.5deg);
  }
}

@keyframes help-antenna {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-2px);
  }
}

@keyframes help-blink {
  0%,
  42%,
  46%,
  100% {
    transform: scaleY(1);
  }
  44% {
    transform: scaleY(0.12);
  }
}

@keyframes help-shadow {
  0%,
  100% {
    transform: scaleX(1);
    opacity: 0.55;
  }
  50% {
    transform: scaleX(0.78);
    opacity: 0.3;
  }
}

@keyframes help-hint-pop {
  0%,
  12%,
  28%,
  100% {
    opacity: 0;
    transform: translateY(-50%) translateX(6px);
  }
  16%,
  24% {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .help-agent-fab--idle,
  .help-agent-fab--idle .help-agent-fab__ring,
  .help-agent-fab--idle .mascot-body,
  .help-agent-fab--idle .mascot-antenna-tip,
  .help-agent-fab--idle .mascot-eyes,
  .help-agent-fab--idle .mascot-shadow,
  .help-agent-fab__hint {
    animation: none !important;
  }

  .help-agent-fab__hint {
    opacity: 0;
  }
}
</style>
