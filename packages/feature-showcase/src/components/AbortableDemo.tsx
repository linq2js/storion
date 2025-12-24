/**
 * Abortable Demo Component
 * Demonstrates abortable features: pause/resume, take/send, checkpoints
 */
import { memo, useState, useRef, useCallback } from "react";
import { abortable, async, type AbortableResult } from "storion/async";

// =============================================================================
// TYPES
// =============================================================================

type WizardEvents = {
  step1: { name: string };
  step2: { email: string };
  step3: { confirm: boolean };
};

// =============================================================================
// SOURCE CODE STRINGS (for display)
// =============================================================================

const WIZARD_CODE = `type WizardEvents = {
  step1: { name: string };
  step2: { email: string };
  step3: { confirm: boolean };
};

const wizardWorkflow = abortable<[], string, WizardEvents>(
  async ({ take, checkpoint }) => {
    // Step 1: Wait for name
    const { name } = await take("step1");

    await checkpoint(); // Pause point

    // Step 2: Wait for email  
    const { email } = await take("step2");

    await checkpoint();

    // Step 3: Wait for confirmation
    const { confirm } = await take("step3");

    if (!confirm) throw new Error("User cancelled");

    return \`Registration complete: \${name} (\${email})\`;
  }
);

// Usage
const result = wizardWorkflow();
result.send("step1", { name: "John" });
result.send("step2", { email: "john@example.com" });
result.send("step3", { confirm: true });
await result; // "Registration complete: John (john@example.com)"`;

const FILE_PROCESSING_CODE = `import { abortable, async } from "storion/async";

const fileProcessingWorkflow = abortable<[string[]], string>(
  async ({ safe, checkpoint, aborted }, files) => {
    const results: string[] = [];

    for (const file of files) {
      if (aborted()) break;

      // Simulate file processing (respects abort signal)
      await safe(async.delay, 800);
      results.push(\`✅ \${file}\`);

      // Checkpoint - can pause here
      await checkpoint();
    }

    return results.join("\\n");
  }
);

// Usage
const result = fileProcessingWorkflow(["a.pdf", "b.png"]);

result.pause();  // Pause at next checkpoint
result.resume(); // Continue execution
result.abort();  // Cancel entirely`;

const COUNTDOWN_CODE = `const countdownWorkflow = abortable(async ({ take }) => {
  const steps = ["Ready...", "Set...", "Go!"];

  for (const step of steps) {
    await take(); // Wait for send()
  }

  return "🎉 Countdown complete!";
});

// Usage - void take/send
const result = countdownWorkflow();
result.send(); // Advance to "Set..."
result.send(); // Advance to "Go!"
result.send(); // Complete
await result;  // "🎉 Countdown complete!"`;

// =============================================================================
// ABORTABLE WORKFLOWS
// =============================================================================

/**
 * Multi-step wizard workflow with external event communication
 */
const wizardWorkflow = abortable<[], string, WizardEvents>(
  async ({ safe, take, checkpoint }) => {
    // Step 1: Wait for name
    const { name } = await take("step1");

    // Allow pause between steps
    await checkpoint();

    // Step 2: Wait for email
    const { email } = await take("step2");

    await checkpoint();

    // Step 3: Wait for confirmation
    const { confirm } = await take("step3");

    if (!confirm) {
      throw new Error("User cancelled");
    }

    // Simulate processing (respects abort signal)
    await safe(async.delay, 500);

    return `Registration complete: ${name} (${email})`;
  }
);

/**
 * File processing workflow with pause/resume capability
 */
const fileProcessingWorkflow = abortable<[string[]], string>(
  async ({ safe, checkpoint, aborted }, files) => {
    const results: string[] = [];

    for (let i = 0; i < files.length; i++) {
      if (aborted()) break;

      // Simulate file processing (respects abort signal)
      await safe(async.delay, 800);
      results.push(`✅ ${files[i]}`);

      // Checkpoint after each file - can pause here
      await checkpoint();
    }

    return results.join("\n");
  }
);

/**
 * Countdown workflow with void take (step-by-step)
 */
const countdownWorkflow = abortable(async ({ take }) => {
  const steps = ["Ready...", "Set...", "Go!"];

  for (const _step of steps) {
    await take(); // Wait for send() call
  }

  return "🎉 Countdown complete!";
});

// =============================================================================
// SHARED COMPONENTS
// =============================================================================

const StatusBadge = memo(function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: "bg-blue-500/20 text-blue-400",
    paused: "bg-yellow-500/20 text-yellow-400",
    waiting: "bg-purple-500/20 text-purple-400",
    success: "bg-green-500/20 text-green-400",
    error: "bg-red-500/20 text-red-400",
    aborted: "bg-zinc-500/20 text-zinc-400",
  };

  return (
    <span
      className={`px-2 py-0.5 rounded text-xs ${
        colors[status] ?? colors.running
      }`}
    >
      {status}
    </span>
  );
});

/**
 * Simple syntax highlighter for TypeScript code
 */
function highlightCode(code: string): React.ReactNode[] {
  const lines = code.split("\n");

  return lines.map((line, lineIdx) => {
    const tokens: React.ReactNode[] = [];
    let remaining = line;
    let key = 0;

    while (remaining.length > 0) {
      // Comments
      const commentMatch = remaining.match(/^(\/\/.*)/);
      if (commentMatch) {
        tokens.push(
          <span key={key++} className="text-zinc-500 italic">
            {commentMatch[1]}
          </span>
        );
        remaining = remaining.slice(commentMatch[1].length);
        continue;
      }

      // Template strings with expressions
      const templateMatch = remaining.match(/^(`[^`]*`)/);
      if (templateMatch) {
        const str = templateMatch[1];
        // Highlight ${} expressions inside
        const parts = str.split(/(\$\{[^}]+\})/g);
        tokens.push(
          <span key={key++} className="text-amber-400">
            {parts.map((part, i) =>
              part.startsWith("${") ? (
                <span key={i}>
                  <span className="text-zinc-400">{"${"}</span>
                  <span className="text-zinc-200">{part.slice(2, -1)}</span>
                  <span className="text-zinc-400">{"}"}</span>
                </span>
              ) : (
                part
              )
            )}
          </span>
        );
        remaining = remaining.slice(str.length);
        continue;
      }

      // Strings (single and double quotes)
      const stringMatch = remaining.match(/^("[^"]*"|'[^']*')/);
      if (stringMatch) {
        tokens.push(
          <span key={key++} className="text-amber-400">
            {stringMatch[1]}
          </span>
        );
        remaining = remaining.slice(stringMatch[1].length);
        continue;
      }

      // Keywords
      const keywordMatch = remaining.match(
        /^(const|let|var|function|async|await|return|if|else|for|of|in|while|throw|new|try|catch|break|continue|export|import|from|type|interface)\b/
      );
      if (keywordMatch) {
        tokens.push(
          <span key={key++} className="text-purple-400">
            {keywordMatch[1]}
          </span>
        );
        remaining = remaining.slice(keywordMatch[1].length);
        continue;
      }

      // Built-in values
      const builtinMatch = remaining.match(/^(true|false|null|undefined)\b/);
      if (builtinMatch) {
        tokens.push(
          <span key={key++} className="text-orange-400">
            {builtinMatch[1]}
          </span>
        );
        remaining = remaining.slice(builtinMatch[1].length);
        continue;
      }

      // Numbers
      const numberMatch = remaining.match(/^(\d+)/);
      if (numberMatch) {
        tokens.push(
          <span key={key++} className="text-cyan-400">
            {numberMatch[1]}
          </span>
        );
        remaining = remaining.slice(numberMatch[1].length);
        continue;
      }

      // Type annotations (after :)
      const typeMatch = remaining.match(/^(:\s*)(\w+)(\[\])?/);
      if (typeMatch) {
        tokens.push(
          <span key={key++}>
            <span className="text-zinc-400">{typeMatch[1]}</span>
            <span className="text-emerald-400">{typeMatch[2]}</span>
            {typeMatch[3] && (
              <span className="text-emerald-400">{typeMatch[3]}</span>
            )}
          </span>
        );
        remaining = remaining.slice(typeMatch[0].length);
        continue;
      }

      // Generic types <...>
      const genericMatch = remaining.match(/^(<[^>]+>)/);
      if (genericMatch) {
        tokens.push(
          <span key={key++} className="text-emerald-400">
            {genericMatch[1]}
          </span>
        );
        remaining = remaining.slice(genericMatch[1].length);
        continue;
      }

      // Function calls (word followed by parenthesis)
      const funcMatch = remaining.match(/^(\w+)(\()/);
      if (funcMatch) {
        tokens.push(
          <span key={key++}>
            <span className="text-blue-400">{funcMatch[1]}</span>
            <span className="text-zinc-300">{funcMatch[2]}</span>
          </span>
        );
        remaining = remaining.slice(funcMatch[0].length);
        continue;
      }

      // Property access .xxx
      const propMatch = remaining.match(/^(\.)([\w$]+)/);
      if (propMatch) {
        tokens.push(
          <span key={key++}>
            <span className="text-zinc-400">{propMatch[1]}</span>
            <span className="text-zinc-200">{propMatch[2]}</span>
          </span>
        );
        remaining = remaining.slice(propMatch[0].length);
        continue;
      }

      // Default: single character
      tokens.push(
        <span key={key++} className="text-zinc-300">
          {remaining[0]}
        </span>
      );
      remaining = remaining.slice(1);
    }

    return (
      <div key={lineIdx} className="leading-5">
        {tokens.length > 0 ? tokens : " "}
      </div>
    );
  });
}

const CodeBlock = memo(function CodeBlock({
  code,
  title,
}: {
  code: string;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-zinc-700/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 bg-zinc-800/50 text-left text-sm font-medium text-zinc-400 hover:bg-zinc-800 flex items-center justify-between"
      >
        <span>
          <span className="text-purple-400 mr-2">{"</>"}</span>
          {title}
        </span>
        <span className={`transition-transform ${isOpen ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div className="bg-zinc-900/80 p-4 overflow-x-auto">
          <pre className="text-xs font-mono">{highlightCode(code)}</pre>
        </div>
      )}
    </div>
  );
});

// =============================================================================
// WIZARD DEMO
// =============================================================================

function WizardDemo() {
  const [result, setResult] = useState<AbortableResult<
    string,
    WizardEvents
  > | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [output, setOutput] = useState<string | null>(null);

  const startWizard = useCallback(() => {
    setOutput(null);
    setCurrentStep(1);
    const r = wizardWorkflow();
    setResult(r);

    // Update status periodically
    const interval = setInterval(() => {
      setStatus(r.status());
      if (r.completed()) {
        clearInterval(interval);
      }
    }, 100);

    r.then((msg) => {
      setOutput(msg);
      setStatus("success");
      setCurrentStep(0);
    }).catch((err) => {
      setOutput(`Error: ${err.message}`);
      setStatus(r.aborted() ? "aborted" : "error");
      setCurrentStep(0);
    });
  }, []);

  const submitStep1 = useCallback(() => {
    if (result && name.trim()) {
      result.send("step1", { name: name.trim() });
      setCurrentStep(2);
    }
  }, [result, name]);

  const submitStep2 = useCallback(() => {
    if (result && email.trim()) {
      result.send("step2", { email: email.trim() });
      setCurrentStep(3);
    }
  }, [result, email]);

  const submitStep3 = useCallback(
    (confirm: boolean) => {
      if (result) {
        result.send("step3", { confirm });
      }
    },
    [result]
  );

  const reset = useCallback(() => {
    result?.abort();
    setResult(null);
    setStatus("idle");
    setCurrentStep(0);
    setName("");
    setEmail("");
    setOutput(null);
  }, [result]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-zinc-400">
          Multi-Step Wizard (take/send)
        </h4>
        <StatusBadge status={status} />
      </div>

      <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50 space-y-4">
        {currentStep === 0 && (
          <div className="text-center py-4">
            <p className="text-zinc-500 mb-4">
              Start a wizard workflow that waits for external events
            </p>
            <button
              onClick={startWizard}
              className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-500 text-sm font-medium"
            >
              Start Wizard
            </button>
          </div>
        )}

        {currentStep === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">Step 1: Enter your name</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full px-3 py-2 rounded-lg bg-zinc-700 border border-zinc-600 text-white placeholder-zinc-500"
            />
            <div className="flex gap-2">
              <button
                onClick={submitStep1}
                disabled={!name.trim()}
                className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-500 text-sm font-medium disabled:opacity-50"
              >
                Next →
              </button>
              <button
                onClick={() => result?.pause()}
                className="px-4 py-2 rounded-lg bg-zinc-700 text-zinc-400 hover:bg-zinc-600 text-sm"
              >
                Pause
              </button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">Step 2: Enter your email</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-3 py-2 rounded-lg bg-zinc-700 border border-zinc-600 text-white placeholder-zinc-500"
            />
            <div className="flex gap-2">
              <button
                onClick={submitStep2}
                disabled={!email.trim()}
                className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-500 text-sm font-medium disabled:opacity-50"
              >
                Next →
              </button>
              <button
                onClick={() => result?.pause()}
                className="px-4 py-2 rounded-lg bg-zinc-700 text-zinc-400 hover:bg-zinc-600 text-sm"
              >
                Pause
              </button>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              Step 3: Confirm registration
            </p>
            <div className="bg-zinc-700/50 rounded-lg p-3 text-sm">
              <p>
                <span className="text-zinc-500">Name:</span> {name}
              </p>
              <p>
                <span className="text-zinc-500">Email:</span> {email}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => submitStep3(true)}
                className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-500 text-sm font-medium"
              >
                ✓ Confirm
              </button>
              <button
                onClick={() => submitStep3(false)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm font-medium"
              >
                ✗ Cancel
              </button>
            </div>
          </div>
        )}

        {status === "paused" && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-center justify-between">
            <span className="text-yellow-400 text-sm">⏸ Workflow paused</span>
            <button
              onClick={() => result?.resume()}
              className="px-3 py-1 rounded bg-yellow-600 text-white text-sm hover:bg-yellow-500"
            >
              Resume
            </button>
          </div>
        )}

        {output && (
          <div
            className={`rounded-lg p-3 text-sm ${
              status === "success"
                ? "bg-green-500/10 border border-green-500/30 text-green-400"
                : "bg-red-500/10 border border-red-500/30 text-red-400"
            }`}
          >
            {output}
          </div>
        )}

        {currentStep > 0 && (
          <button
            onClick={reset}
            className="text-sm text-zinc-500 hover:text-zinc-400"
          >
            Reset
          </button>
        )}
      </div>

      <CodeBlock code={WIZARD_CODE} title="View Source Code" />
    </div>
  );
}

// =============================================================================
// FILE PROCESSING DEMO
// =============================================================================

function FileProcessingDemo() {
  const resultRef = useRef<AbortableResult<string, void> | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [progress, setProgress] = useState<string[]>([]);
  const [output, setOutput] = useState<string | null>(null);

  const files = ["document.pdf", "image.png", "video.mp4", "archive.zip"];

  const startProcessing = useCallback(() => {
    setProgress([]);
    setOutput(null);

    const r = fileProcessingWorkflow(files);
    resultRef.current = r;

    // Update status periodically
    const interval = setInterval(() => {
      setStatus(r.status());
      if (r.completed()) {
        clearInterval(interval);
      }
    }, 100);

    // Track progress via checkpoint timing
    let idx = 0;
    const progressInterval = setInterval(() => {
      if (r.running() || r.waiting()) {
        if (idx < files.length && r.status() === "running") {
          setProgress((prev) => {
            if (prev.length <= idx) {
              return [...prev, `Processing ${files[idx]}...`];
            }
            return prev;
          });
        }
      }
      if (r.completed()) {
        clearInterval(progressInterval);
      }
    }, 200);

    r.then((result) => {
      setOutput(result);
      setStatus("success");
    }).catch((err) => {
      setOutput(`Error: ${err.message}`);
      setStatus(r.aborted() ? "aborted" : "error");
    });
  }, []);

  const pause = useCallback(() => {
    resultRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    resultRef.current?.resume();
  }, []);

  const abort = useCallback(() => {
    resultRef.current?.abort();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-zinc-400">
          File Processing (pause/resume/checkpoint)
        </h4>
        <StatusBadge status={status} />
      </div>

      <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50 space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={startProcessing}
            disabled={status === "running" || status === "paused"}
            className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-500 text-sm font-medium disabled:opacity-50"
          >
            Start Processing
          </button>
          <button
            onClick={pause}
            disabled={status !== "running"}
            className="px-4 py-2 rounded-lg bg-yellow-600 text-white hover:bg-yellow-500 text-sm font-medium disabled:opacity-50"
          >
            ⏸ Pause
          </button>
          <button
            onClick={resume}
            disabled={status !== "paused"}
            className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-500 text-sm font-medium disabled:opacity-50"
          >
            ▶ Resume
          </button>
          <button
            onClick={abort}
            disabled={status !== "running" && status !== "paused"}
            className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm font-medium disabled:opacity-50"
          >
            ✗ Abort
          </button>
        </div>

        {/* Progress */}
        {progress.length > 0 && (
          <div className="space-y-1">
            {progress.map((_, i) => (
              <div
                key={i}
                className="text-sm text-zinc-400 flex items-center gap-2"
              >
                <span className="text-green-400">✓</span> {files[i]}
              </div>
            ))}
            {status === "running" && progress.length < files.length && (
              <div className="text-sm text-blue-400 flex items-center gap-2">
                <span className="animate-spin">⏳</span>{" "}
                {files[progress.length]}
              </div>
            )}
          </div>
        )}

        {status === "paused" && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-yellow-400 text-sm">
            ⏸ Processing paused at checkpoint. Click Resume to continue.
          </div>
        )}

        {output && (
          <div
            className={`rounded-lg p-3 text-sm whitespace-pre-line ${
              status === "success"
                ? "bg-green-500/10 border border-green-500/30 text-green-400"
                : "bg-red-500/10 border border-red-500/30 text-red-400"
            }`}
          >
            {output}
          </div>
        )}
      </div>

      <CodeBlock code={FILE_PROCESSING_CODE} title="View Source Code" />
    </div>
  );
}

// =============================================================================
// COUNTDOWN DEMO
// =============================================================================

function CountdownDemo() {
  const resultRef = useRef<AbortableResult<string, void> | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [step, setStep] = useState(0);
  const [output, setOutput] = useState<string | null>(null);

  const steps = ["Ready...", "Set...", "Go!"];

  const startCountdown = useCallback(() => {
    setStep(0);
    setOutput(null);

    const r = countdownWorkflow();
    resultRef.current = r;

    // Update status
    const interval = setInterval(() => {
      setStatus(r.status());
      if (r.completed()) {
        clearInterval(interval);
      }
    }, 100);

    r.then((result) => {
      setOutput(result);
      setStatus("success");
    }).catch((err) => {
      setOutput(`Error: ${err.message}`);
      setStatus(r.aborted() ? "aborted" : "error");
    });
  }, []);

  const advance = useCallback(() => {
    if (resultRef.current && step < steps.length) {
      resultRef.current.send();
      setStep((s) => s + 1);
    }
  }, [step]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-zinc-400">
          Countdown (void take/send)
        </h4>
        <StatusBadge status={status} />
      </div>

      <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50 space-y-4">
        <div className="flex gap-2">
          <button
            onClick={startCountdown}
            disabled={status === "waiting"}
            className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-500 text-sm font-medium disabled:opacity-50"
          >
            Start Countdown
          </button>
          <button
            onClick={advance}
            disabled={status !== "waiting" || step >= steps.length}
            className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-500 text-sm font-medium disabled:opacity-50"
          >
            Next Step ({step + 1}/{steps.length})
          </button>
        </div>

        {/* Steps visualization */}
        <div className="flex gap-4">
          {steps.map((s, i) => (
            <div
              key={i}
              className={`flex-1 text-center py-3 rounded-lg border transition-all ${
                i < step
                  ? "bg-green-500/20 border-green-500/50 text-green-400"
                  : i === step && status === "waiting"
                  ? "bg-purple-500/20 border-purple-500/50 text-purple-400 animate-pulse"
                  : "bg-zinc-700/30 border-zinc-600/50 text-zinc-500"
              }`}
            >
              {s}
            </div>
          ))}
        </div>

        {output && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm text-center">
            {output}
          </div>
        )}
      </div>

      <CodeBlock code={COUNTDOWN_CODE} title="View Source Code" />
    </div>
  );
}

// =============================================================================
// MAIN DEMO
// =============================================================================

export const AbortableDemo = memo(function AbortableDemo() {
  return (
    <div className="space-y-8">
      <WizardDemo />
      <FileProcessingDemo />
      <CountdownDemo />

      {/* Info */}
      <div className="bg-zinc-800/30 rounded-xl p-4 border border-zinc-700/50">
        <h4 className="text-sm font-medium text-zinc-400 mb-2">
          About Abortable
        </h4>
        <ul className="text-sm text-zinc-500 space-y-1">
          <li>
            • <code className="text-purple-400">take(key)</code> - Wait for
            external event by key
          </li>
          <li>
            • <code className="text-purple-400">send(key, value)</code> - Send
            event to unblock take()
          </li>
          <li>
            • <code className="text-purple-400">checkpoint()</code> - Explicit
            pause point
          </li>
          <li>
            • <code className="text-purple-400">pause()</code> - Pause at next
            checkpoint/take/safe
          </li>
          <li>
            • <code className="text-purple-400">resume()</code> - Resume paused
            execution
          </li>
          <li>
            • <code className="text-purple-400">abort()</code> - Cancel
            execution
          </li>
        </ul>
      </div>
    </div>
  );
});
