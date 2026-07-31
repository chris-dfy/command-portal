type BrowserRecognitionEvent = {
  results?: ArrayLike<ArrayLike<{ transcript?: string }>>;
};

type BrowserRecognitionError = {
  error?: string;
};

type BrowserRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: BrowserRecognitionEvent) => void) | null;
  onerror: ((event: BrowserRecognitionError) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};

type BrowserRecognitionConstructor = new () => BrowserRecognition;

type SpeechWindow = Window & typeof globalThis & {
  SpeechRecognition?: BrowserRecognitionConstructor;
  webkitSpeechRecognition?: BrowserRecognitionConstructor;
};

const speechWindow = (): SpeechWindow | null => (
  typeof window === "undefined" ? null : window as SpeechWindow
);

export function browserSpeechAvailability() {
  const scope = speechWindow();
  return {
    input: Boolean(scope && (scope.SpeechRecognition || scope.webkitSpeechRecognition)),
    output: Boolean(scope?.speechSynthesis && scope.SpeechSynthesisUtterance),
  };
}

export async function recognizeBrowserSpeech(timeoutMs = 8_000): Promise<string> {
  const scope = speechWindow();
  const Recognition = scope?.SpeechRecognition ?? scope?.webkitSpeechRecognition;
  if (!Recognition) {
    throw new Error("Browser microphone transcription is unavailable. Type the request instead.");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Browser speech timeout must be a positive integer.");
  }

  return await new Promise<string>((resolve, reject) => {
    const recognition = new Recognition();
    let settled = false;
    const finish = (result: { transcript?: string; error?: Error }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      if (result.error) reject(result.error);
      else resolve(result.transcript ?? "");
    };
    const timer = setTimeout(() => {
      recognition.abort();
      finish({ error: new Error(`Browser microphone did not capture speech within ${Math.ceil(timeoutMs / 1_000)} seconds. Type the request instead.`) });
    }, timeoutMs);

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() ?? "";
      finish(transcript
        ? { transcript }
        : { error: new Error("Browser microphone did not return a transcript. Type the request instead.") });
    };
    recognition.onerror = (event) => finish({
      error: new Error(event.error === "not-allowed"
        ? "Microphone permission was denied. Allow microphone access or type the request instead."
        : "Browser microphone transcription failed. Type the request instead."),
    });
    recognition.onend = () => finish({
      error: new Error("Browser microphone ended without a transcript. Type the request instead."),
    });
    recognition.start();
  });
}

export function speakBrowserResponse(text: string): boolean {
  const scope = speechWindow();
  if (!text.trim() || !scope?.speechSynthesis || !scope.SpeechSynthesisUtterance) return false;
  const utterance = new scope.SpeechSynthesisUtterance(text.trim());
  utterance.lang = navigator.language || "en-US";
  utterance.rate = 1;
  scope.speechSynthesis.cancel();
  scope.speechSynthesis.speak(utterance);
  return true;
}
