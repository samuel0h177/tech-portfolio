<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api/client';
import { useAssistantStore, type AssistantSearchFilters } from '@/stores/assistant';
import { usePortfolioContextStore } from '@/stores/portfolioContext';

type ChatRole = 'user' | 'assistant';

interface TraceStep {
  kind: 'status' | 'thinking' | 'tool' | 'tool_done';
  label: string;
  detail?: string;
}

interface ChatMessage {
  role: ChatRole;
  content: string;
  steps?: TraceStep[];
  pending?: boolean;
  stopped?: boolean;
}

interface AssistantAction {
  type: 'apply_search' | 'open_project';
  filters?: AssistantSearchFilters;
  projectId?: number;
}

type StreamEvent =
  | { type: 'status'; message: string }
  | { type: 'thinking'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'token'; text: string }
  | { type: 'reply_reset' }
  | { type: 'tool_start'; name: string; label: string; args?: Record<string, unknown> }
  | { type: 'tool_done'; name: string; summary: string }
  | { type: 'message'; message: string; actions: AssistantAction[] }
  | { type: 'error'; message: string }
  | { type: 'done' };

const store = useAssistantStore();
const portfolio = usePortfolioContextStore();
const router = useRouter();
const route = useRoute();

const input = ref('');
const sending = ref(false);
const error = ref('');
const abortController = ref<AbortController | null>(null);
let requestId = 0;
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

const viewingLabel = computed(() => {
  const p = portfolio.projectContext;
  if (!p) return '';
  const code = p.projectCode?.trim();
  const title = p.title?.trim();
  if (code && title) return `${code} — ${title}`;
  return title || code || `Project #${p.id}`;
});

async function scrollToBottom() {
  await nextTick();
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
}

watch(
  () => messages.value.length,
  () => scrollToBottom(),
);

watch(
  () => {
    const last = messages.value[messages.value.length - 1];
    return `${last?.steps?.length ?? 0}:${last?.content?.length ?? 0}`;
  },
  () => scrollToBottom(),
);

watch(
  () => store.open,
  (open) => {
    if (open) scrollToBottom();
  },
);

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

function historyPayload() {
  return messages.value
    .filter(
      (m) =>
        m.role === 'user' ||
        (m.role === 'assistant' && m.content && !m.pending && !m.stopped),
    )
    .slice(-6)
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && (err.name === 'AbortError' || err.name === 'APIUserAbortError'))
  );
}

function finalizeStopped(msg: ChatMessage) {
  msg.pending = false;
  if (!msg.content) {
    msg.content = 'Stopped.';
    msg.stopped = true;
  }
}

function abortCurrent() {
  abortController.value?.abort();
  abortController.value = null;
  const last = messages.value[messages.value.length - 1];
  if (last?.role === 'assistant' && last.pending) {
    finalizeStopped(last);
  }
}

function stop() {
  abortCurrent();
}

function pushStep(msg: ChatMessage, step: TraceStep) {
  if (!msg.steps) msg.steps = [];
  msg.steps.push(step);
  void scrollToBottom();
}

function formatStreamError(detail: string, status?: number, baseURL?: string): string {
  if (!status && /Failed to fetch|NetworkError|Load failed/i.test(detail)) {
    return `Could not reach the API at ${baseURL}/assistant/chat/stream (${detail}). Is the API running on port 3001?`;
  }
  if (
    status === 503 ||
    /GEMINI_API_KEY|LM_STUDIO_MODEL|not configured|LLM_PROVIDER|Cannot reach LM Studio|Cannot reach the Gemini API|lms server start/i.test(
      detail,
    )
  ) {
    if (/GEMINI_API_KEY|Gemini API/i.test(detail)) {
      return (
        'Help agent is not ready. Set `GEMINI_API_KEY` in `.env` and restart the API. ' +
        `Details: ${detail}`
      );
    }
    return (
      'Local help agent is not ready. Start LM Studio (`lms server start`), load a tool-capable model, set `LM_STUDIO_MODEL` in `.env`, and restart the API. ' +
      `Details: ${detail}`
    );
  }
  if (status === 502 || /Gemini API call failed|LM Studio API call failed|Context size/i.test(detail)) {
    return `The model call failed: ${detail}`;
  }
  return `Assistant error (${status ?? 'unknown'}): ${detail}`;
}

async function send() {
  const text = input.value.trim();
  if (!text) return;

  abortCurrent();

  error.value = '';
  messages.value.push({ role: 'user', content: text });
  input.value = '';

  const id = ++requestId;
  const ac = new AbortController();
  abortController.value = ac;
  sending.value = true;

  messages.value.push({
    role: 'assistant',
    content: '',
    steps: [],
    pending: true,
  });
  // Must use the reactive array entry so token/step updates paint live.
  const pending = messages.value[messages.value.length - 1]!;

  const payload = {
    messages: historyPayload(),
    searchContext: portfolio.liveContext ?? undefined,
    projectContext: portfolio.projectContext
      ? {
          id: portfolio.projectContext.id,
          title: portfolio.projectContext.title,
          projectCode: portfolio.projectContext.projectCode ?? undefined,
        }
      : undefined,
  };

  const baseURL = (api.defaults.baseURL || '/api').replace(/\/$/, '');
  const url = `${baseURL}/assistant/chat/stream`;
  console.info('[HelpAgent] POST stream', url, {
    messageCount: payload.messages.length,
    searchContext: payload.searchContext,
    projectContext: payload.projectContext,
  });

  let actions: AssistantAction[] = [];
  let gotMessage = false;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    const auth = localStorage.getItem('esto_token');
    if (auth) headers.Authorization = `Bearer ${auth}`;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: ac.signal,
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { message?: string | string[] };
        const raw = body.message;
        detail = Array.isArray(raw) ? raw.join(', ') : raw || detail;
      } catch {
        /* ignore */
      }
      throw Object.assign(new Error(detail), { status: res.status });
    }

    if (!res.body) {
      throw new Error('No response body from chat stream');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const appendThinking = (text: string) => {
      if (!pending.steps) pending.steps = [];
      const last = pending.steps[pending.steps.length - 1];
      if (last?.kind === 'thinking') {
        last.detail = (last.detail || '') + text;
      } else {
        pending.steps.push({ kind: 'thinking', label: 'Reasoning', detail: text });
      }
      void scrollToBottom();
    };

    const handleEvent = (event: StreamEvent) => {
      switch (event.type) {
        case 'status':
          pushStep(pending, { kind: 'status', label: event.message });
          break;
        case 'thinking':
          pushStep(pending, { kind: 'thinking', label: 'Reasoning', detail: event.text });
          break;
        case 'thinking_delta':
          appendThinking(event.text);
          break;
        case 'token':
          pending.content = (pending.content || '') + event.text;
          void scrollToBottom();
          break;
        case 'reply_reset':
          if (pending.content) {
            pushStep(pending, { kind: 'thinking', label: 'Draft', detail: pending.content });
            pending.content = '';
          }
          break;
        case 'tool_start':
          pushStep(pending, { kind: 'tool', label: event.label });
          break;
        case 'tool_done':
          pushStep(pending, { kind: 'tool_done', label: event.summary });
          break;
        case 'message':
          pending.content = event.message;
          actions = event.actions ?? [];
          gotMessage = true;
          break;
        case 'error':
          error.value = event.message;
          pending.content = formatStreamError(event.message, undefined, baseURL);
          gotMessage = true;
          break;
        case 'done':
          break;
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';
      for (const chunk of chunks) {
        for (const line of chunk.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const raw = trimmed.slice(5).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            handleEvent(JSON.parse(raw) as StreamEvent);
          } catch (parseErr) {
            console.warn('[HelpAgent] bad SSE chunk', raw, parseErr);
          }
        }
      }
    }

    if (ac.signal.aborted || id !== requestId) {
      finalizeStopped(pending);
      return;
    }

    pending.pending = false;
    if (!gotMessage && !pending.content) {
      pending.content = 'Sorry — no response came back from the helper.';
    }

    if (actions.length) {
      await applyActions(actions);
    }
  } catch (err: unknown) {
    if (isAbortError(err) || id !== requestId) {
      finalizeStopped(pending);
      return;
    }
    const ax = err as { message?: string; status?: number };
    const detail = ax.message || 'Unknown error';
    error.value = detail;
    console.error('[HelpAgent] stream failed', err);
    pending.pending = false;
    pending.content = formatStreamError(detail, ax.status, baseURL);
  } finally {
    if (id === requestId) {
      sending.value = false;
      if (abortController.value === ac) abortController.value = null;
    }
    void scrollToBottom();
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    void send();
  }
}

function stepIcon(kind: TraceStep['kind']): string {
  switch (kind) {
    case 'thinking':
      return 'mdi-brain';
    case 'tool':
      return 'mdi-cog-play-outline';
    case 'tool_done':
      return 'mdi-check-circle-outline';
    default:
      return 'mdi-dots-horizontal-circle-outline';
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
        <!-- Cartoony feminine satellite -->
        <svg
          v-if="!store.open"
          class="help-agent-mascot"
          viewBox="0 0 64 64"
          width="44"
          height="44"
          aria-hidden="true"
        >
          <ellipse class="mascot-shadow" cx="32" cy="58" rx="15" ry="3.2" />
          <g class="mascot-body">
            <!-- Solar panels -->
            <g class="mascot-panel mascot-panel--left">
              <rect x="2" y="24" width="14" height="20" rx="2.5" />
              <line x1="5.5" y1="26" x2="5.5" y2="42" />
              <line x1="9" y1="26" x2="9" y2="42" />
              <line x1="12.5" y1="26" x2="12.5" y2="42" />
            </g>
            <g class="mascot-panel mascot-panel--right">
              <rect x="48" y="24" width="14" height="20" rx="2.5" />
              <line x1="51.5" y1="26" x2="51.5" y2="42" />
              <line x1="55" y1="26" x2="55" y2="42" />
              <line x1="58.5" y1="26" x2="58.5" y2="42" />
            </g>
            <line class="mascot-boom" x1="16" y1="34" x2="20" y2="34" />
            <line class="mascot-boom" x1="44" y1="34" x2="48" y2="34" />

            <!-- Antenna + bow -->
            <line class="mascot-antenna" x1="32" y1="18" x2="32" y2="7" />
            <g class="mascot-antenna-tip">
              <circle cx="32" cy="5.5" r="3.2" />
              <path class="mascot-bow" d="M26 7.5c2.2-3.5 5.2-1.2 6 0 0.8-1.2 3.8-3.5 6 0-2.4 0.4-4.2 2.2-6 2.2-1.8 0-3.6-1.8-6-2.2z" />
            </g>

            <!-- Body -->
            <circle class="mascot-shell" cx="32" cy="34" r="14.5" />
            <ellipse class="mascot-face" cx="32" cy="33" rx="11" ry="10" />
            <ellipse class="mascot-shine" cx="26" cy="27" rx="3.2" ry="2.2" />

            <!-- Eyes + lashes -->
            <g class="mascot-eyes">
              <g class="mascot-eye-group" transform="translate(26 31)">
                <path class="mascot-lash" d="M-4.2-4.2 C-3.2-5.6 -1.6-6.2 0-5.4" />
                <path class="mascot-lash" d="M-1.2-5.8 C0-6.8 1.4-6.8 2.4-5.6" />
                <path class="mascot-lash" d="M2.2-4.5 C3.4-5.6 4.8-5.2 5.2-3.8" />
                <circle class="mascot-eye" cx="0" cy="0" r="3.1" />
                <circle class="mascot-eye-shine" cx="1.1" cy="-1" r="1" />
              </g>
              <g class="mascot-eye-group" transform="translate(38 31)">
                <path class="mascot-lash" d="M-4.2-4.2 C-3.2-5.6 -1.6-6.2 0-5.4" />
                <path class="mascot-lash" d="M-1.2-5.8 C0-6.8 1.4-6.8 2.4-5.6" />
                <path class="mascot-lash" d="M2.2-4.5 C3.4-5.6 4.8-5.2 5.2-3.8" />
                <circle class="mascot-eye" cx="0" cy="0" r="3.1" />
                <circle class="mascot-eye-shine" cx="1.1" cy="-1" r="1" />
              </g>
            </g>

            <path class="mascot-smile" d="M26.5 37.5c2.4 3.2 8.6 3.2 11 0" />
            <circle class="mascot-blush" cx="23.5" cy="36.5" r="2.1" />
            <circle class="mascot-blush" cx="40.5" cy="36.5" r="2.1" />
          </g>
        </svg>
        <v-icon v-else icon="mdi-close" size="28" color="#6d28d9" />
      </span>
    </button>

    <v-navigation-drawer
      v-model="store.open"
      location="right"
      temporary
      :scrim="false"
      width="400"
      class="help-agent-drawer"
    >
      <div class="help-agent-header pa-4">
        <div class="d-flex align-center ga-3">
          <div class="help-agent-header-mascot" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="38" height="38">
              <rect fill="#c4b5fd" x="4" y="26" width="12" height="16" rx="2" />
              <rect fill="#c4b5fd" x="48" y="26" width="12" height="16" rx="2" />
              <line stroke="#a78bfa" stroke-width="2" x1="16" y1="34" x2="20" y2="34" />
              <line stroke="#a78bfa" stroke-width="2" x1="44" y1="34" x2="48" y2="34" />
              <line stroke="#f9a8d4" stroke-width="2.2" stroke-linecap="round" x1="32" y1="18" x2="32" y2="8" />
              <circle fill="#fbbf24" cx="32" cy="6" r="2.8" />
              <circle fill="#f3e8ff" cx="32" cy="34" r="13" />
              <ellipse fill="#fff7fb" cx="32" cy="33" rx="10" ry="9" />
              <circle fill="#6d28d9" cx="26.5" cy="31" r="2.6" />
              <circle fill="#6d28d9" cx="37.5" cy="31" r="2.6" />
              <circle fill="#fff" cx="27.4" cy="30.2" r="0.8" />
              <circle fill="#fff" cx="38.4" cy="30.2" r="0.8" />
              <path fill="none" stroke="#6d28d9" stroke-width="1.7" stroke-linecap="round" d="M27 37c2 2.6 8 2.6 10 0" />
              <circle fill="#fda4af" cx="24" cy="36" r="1.7" opacity="0.85" />
              <circle fill="#fda4af" cx="40" cy="36" r="1.7" opacity="0.85" />
            </svg>
          </div>
          <div>
            <div class="text-subtitle-1 font-weight-bold">Portfolio Helper</div>
            <div class="text-caption text-medium-emphasis">Ask questions or run a search</div>
            <div v-if="viewingLabel" class="text-caption help-agent-viewing mt-1">
              Viewing: {{ viewingLabel }}
            </div>
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
          <div
            v-if="m.steps?.length"
            class="help-agent-trace"
            :class="{ 'mb-2': !!m.content || m.pending }"
          >
            <div class="help-agent-trace__title">{{ m.pending ? 'Working…' : 'How I got here' }}</div>
            <div
              v-for="(step, si) in m.steps"
              :key="si"
              class="help-agent-trace__step"
              :class="`help-agent-trace__step--${step.kind}`"
            >
              <v-icon size="14" class="help-agent-trace__icon">{{ stepIcon(step.kind) }}</v-icon>
              <div class="help-agent-trace__body">
                <div class="help-agent-trace__label">{{ step.label }}</div>
                <div v-if="step.detail" class="help-agent-trace__detail">{{ step.detail }}</div>
              </div>
            </div>
          </div>
          <div
            v-if="m.content"
            class="help-agent-bubble__text"
            :class="{
              'help-agent-bubble__text--streaming': m.pending && !!m.content,
              'help-agent-bubble__text--stopped': m.stopped,
            }"
          >
            {{ m.content }}
          </div>
          <div
            v-else-if="m.pending"
            class="text-caption text-medium-emphasis d-flex align-center ga-2"
          >
            <v-progress-circular indeterminate size="16" width="2" />
            Thinking…
          </div>
        </div>
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
          @keydown="onKeydown"
        />
        <div class="d-flex justify-start mt-2 ga-2 help-agent-composer__actions">
          <v-btn
            v-if="sending"
            color="error"
            variant="tonal"
            prepend-icon="mdi-stop"
            @click="stop"
          >
            Stop
          </v-btn>
          <v-btn
            color="primary"
            prepend-icon="mdi-send"
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
  background: rgba(167, 139, 250, 0.28);
  transform: scale(0.92);
  opacity: 0;
}

.help-agent-fab__bubble {
  position: absolute;
  inset: 8px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: linear-gradient(160deg, #e9d5ff 0%, #c4b5fd 45%, #a78bfa 100%);
  box-shadow:
    0 10px 24px rgba(139, 92, 246, 0.32),
    0 2px 0 rgba(255, 255, 255, 0.35) inset;
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
  background: #a78bfa;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  box-shadow: 0 6px 16px rgba(139, 92, 246, 0.28);
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
  background: #a78bfa;
  transform: translateY(-50%) rotate(45deg);
}

.help-agent-fab:hover .help-agent-fab__bubble,
.help-agent-fab:focus-visible .help-agent-fab__bubble {
  transform: scale(1.06);
  box-shadow:
    0 14px 28px rgba(139, 92, 246, 0.4),
    0 2px 0 rgba(255, 255, 255, 0.4) inset;
}

.help-agent-fab:focus-visible {
  outline: none;
}

.help-agent-fab:focus-visible .help-agent-fab__bubble {
  outline: 2px solid #f5d0fe;
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
  background: linear-gradient(160deg, #e9d5ff 0%, #c4b5fd 45%, #a78bfa 100%);
}

.help-agent-mascot {
  overflow: visible;
}

.mascot-shell {
  fill: #faf5ff;
  stroke: #ddd6fe;
  stroke-width: 1.2;
}

.mascot-face {
  fill: #fff7fb;
}

.mascot-shine {
  fill: rgba(255, 255, 255, 0.75);
}

.mascot-panel rect {
  fill: #c4b5fd;
  stroke: #a78bfa;
  stroke-width: 1;
}

.mascot-panel line {
  stroke: #ddd6fe;
  stroke-width: 1.1;
}

.mascot-boom {
  stroke: #a78bfa;
  stroke-width: 2.2;
  stroke-linecap: round;
}

.mascot-antenna {
  stroke: #f9a8d4;
  stroke-width: 2.4;
  stroke-linecap: round;
}

.mascot-antenna-tip circle {
  fill: #fbbf24;
}

.mascot-bow {
  fill: #f472b6;
}

.mascot-eye {
  fill: #6d28d9;
  transform-origin: center;
  transform-box: fill-box;
}

.mascot-eye-shine {
  fill: #ffffff;
}

.mascot-lash {
  fill: none;
  stroke: #6d28d9;
  stroke-width: 1.15;
  stroke-linecap: round;
}

.mascot-smile {
  fill: none;
  stroke: #7c3aed;
  stroke-width: 1.8;
  stroke-linecap: round;
}

.mascot-blush {
  fill: #fb7185;
  opacity: 0.75;
}

.mascot-shadow {
  fill: rgba(88, 28, 135, 0.22);
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
  background: linear-gradient(160deg, rgba(233, 213, 255, 0.9), rgba(196, 181, 253, 0.55));
}

.help-agent-drawer {
  display: flex;
  flex-direction: column;
}

.help-agent-header {
  background: linear-gradient(135deg, rgba(196, 181, 253, 0.22), rgba(233, 213, 255, 0.12));
}

.help-agent-viewing {
  color: #7c3aed;
  font-weight: 600;
  line-height: 1.3;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.help-agent-messages {
  flex: 1;
  overflow-y: auto;
  min-height: 280px;
  max-height: calc(100vh - 320px);
}

.help-agent-trace {
  border-left: 2px solid rgba(124, 58, 237, 0.28);
  padding: 4px 0 4px 10px;
  margin-bottom: 2px;
}

.help-agent-trace__title {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #7c3aed;
  margin-bottom: 6px;
}

.help-agent-trace__step {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 6px;
}

.help-agent-trace__step:last-child {
  margin-bottom: 0;
}

.help-agent-trace__icon {
  margin-top: 1px;
  color: #8b5cf6;
  opacity: 0.9;
}

.help-agent-trace__label {
  font-size: 0.78rem;
  line-height: 1.35;
  color: rgba(55, 48, 80, 0.88);
}

.help-agent-trace__detail {
  margin-top: 2px;
  font-size: 0.72rem;
  line-height: 1.4;
  color: rgba(75, 85, 99, 0.92);
  white-space: pre-wrap;
  max-height: 7.5rem;
  overflow: auto;
}

.help-agent-trace__step--thinking .help-agent-trace__detail {
  font-style: italic;
}

.help-agent-bubble__text {
  white-space: pre-wrap;
}

.help-agent-bubble__text--stopped {
  color: rgba(75, 85, 99, 0.72);
  font-style: italic;
}

.help-agent-bubble__text--streaming::after {
  content: "|";
  display: inline-block;
  width: 0.45em;
  margin-left: 1px;
  color: #7c3aed;
  animation: help-caret 0.9s steps(1) infinite;
}

@keyframes help-caret {
  50% {
    opacity: 0;
  }
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
  /* Keep send clear of the floating close FAB in the bottom-right */
  padding-bottom: 88px !important;
}

.help-agent-composer__actions {
  max-width: calc(100% - 72px);
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
