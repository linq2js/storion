/**
 * Type check file for abortable functions and wrapper chaining.
 * This file should compile without errors - no runtime tests needed.
 *
 * Run: npx tsc --noEmit src/async/abortable.typeCheck.ts
 */

import {
  abortable,
  type Abortable,
  type AbortableWrapper,
  type IdentityWrapper,
} from "./abortable";
import {
  retry,
  catchError,
  timeout,
  logging,
  debounce,
  throttle,
} from "./wrappers";

// =============================================================================
// Basic abortable creation
// =============================================================================

// Simple function with no args
const noArgs = abortable(async () => "hello");
noArgs satisfies Abortable<[], string>;

// Function with single arg
const singleArg = abortable(async ({}, id: string) => ({ id, name: "test" }));
singleArg satisfies Abortable<[string], { id: string; name: string }>;

// Function with multiple args
const multiArgs = abortable(
  async ({}, a: number, b: string, c: boolean) => a + b.length + (c ? 1 : 0)
);
multiArgs satisfies Abortable<[number, string, boolean], number>;

// Function using signal
const withSignal = abortable(async ({ signal }, url: string) => {
  const res = await fetch(url, { signal });
  return res.json() as Promise<{ data: string }>;
});
withSignal satisfies Abortable<[string], { data: string }>;

// Function using safe
const withSafe = abortable(async ({ safe }, id: number) => {
  const result = await safe(Promise.resolve({ id }));
  return result;
});
withSafe satisfies Abortable<[number], { id: number }>;

// =============================================================================
// Direct call and .withSignal() method
// =============================================================================

// Direct call - should accept the args
const _directResult: Promise<string> = noArgs();
const _directResult2: Promise<{ id: string; name: string }> = singleArg("123");
const _directResult3: Promise<number> = multiArgs(1, "test", true);

// .withSignal() method - should accept signal + args
const controller = new AbortController();
const _withResult: Promise<string> = noArgs.withSignal(controller.signal);
const _withResult2: Promise<{ id: string; name: string }> = singleArg.withSignal(
  controller.signal,
  "123"
);
const _withResult3: Promise<number> = multiArgs.withSignal(
  controller.signal,
  1,
  "test",
  true
);

// =============================================================================
// Single wrapper chaining
// =============================================================================

// retry() preserves types
const withRetry = singleArg.use(retry(3));
withRetry satisfies Abortable<[string], { id: string; name: string }>;
const _retryResult: Promise<{ id: string; name: string }> = withRetry("test");

// retry() with options
const withRetryOptions = singleArg.use(retry({ retries: 5, delay: "linear" }));
withRetryOptions satisfies Abortable<[string], { id: string; name: string }>;

// retry() with number delay
const withRetryDelay = singleArg.use(retry({ retries: 3, delay: 500 }));
withRetryDelay satisfies Abortable<[string], { id: string; name: string }>;

// retry() with custom delay function
const withRetryCustom = singleArg.use(
  retry({ retries: 3, delay: (attempt) => attempt * 1000 })
);
withRetryCustom satisfies Abortable<[string], { id: string; name: string }>;

// catchError() preserves types
const withCatchError = singleArg.use(catchError((err) => console.error(err)));
withCatchError satisfies Abortable<[string], { id: string; name: string }>;

// timeout() preserves types
const withTimeout = singleArg.use(timeout(5000));
withTimeout satisfies Abortable<[string], { id: string; name: string }>;

// logging() preserves types
const withLogging = singleArg.use(logging("singleArg"));
withLogging satisfies Abortable<[string], { id: string; name: string }>;

// debounce() preserves types
const withDebounce = singleArg.use(debounce(300));
withDebounce satisfies Abortable<[string], { id: string; name: string }>;

// throttle() preserves types
const withThrottle = singleArg.use(throttle(1000));
withThrottle satisfies Abortable<[string], { id: string; name: string }>;

// =============================================================================
// Multi-wrapper chaining
// =============================================================================

// Chain multiple wrappers - types should be preserved
const fullChain = singleArg
  .use(retry(3))
  .use(catchError((err) => console.error(err)))
  .use(timeout(5000))
  .use(logging("chain"));

fullChain satisfies Abortable<[string], { id: string; name: string }>;
const _chainResult: Promise<{ id: string; name: string }> =
  fullChain("test-id");
const _chainWithSignal: Promise<{ id: string; name: string }> = fullChain.withSignal(
  controller.signal,
  "test-id"
);

// Chain with multi-arg function
const multiArgChain = multiArgs
  .use(retry({ retries: 2, delay: "fibonacci" }))
  .use(timeout(10000));

multiArgChain satisfies Abortable<[number, string, boolean], number>;
const _multiResult: Promise<number> = multiArgChain(42, "hello", false);

// Chain with no-arg function
const noArgChain = noArgs.use(retry(5)).use(debounce(100));

noArgChain satisfies Abortable<[], string>;
const _noArgResult: Promise<string> = noArgChain();

// =============================================================================
// Custom wrapper creation
// =============================================================================

// Custom wrapper that doesn't change types
const customPassThrough: AbortableWrapper<any[], any> =
  (next) =>
  async (ctx, ...args) => {
    console.log("before");
    const result = await next(ctx, ...args);
    console.log("after");
    return result;
  };

const withCustom = singleArg.use(customPassThrough);
withCustom satisfies Abortable<[string], { id: string; name: string }>;

// =============================================================================
// Complex real-world examples
// =============================================================================

interface User {
  id: string;
  name: string;
  email: string;
}

interface Post {
  id: number;
  title: string;
  body: string;
}

// API service with abortable methods
const userApi = {
  getUser: abortable(async ({ signal }, userId: string): Promise<User> => {
    const res = await fetch(`/api/users/${userId}`, { signal });
    return res.json();
  }),

  createUser: abortable(
    async (
      { signal },
      data: { name: string; email: string }
    ): Promise<User> => {
      const res = await fetch("/api/users", {
        method: "POST",
        body: JSON.stringify(data),
        signal,
      });
      return res.json();
    }
  ),

  getPost: abortable(async ({ signal }, postId: number): Promise<Post> => {
    const res = await fetch(`/api/posts/${postId}`, { signal });
    return res.json();
  }),
};

// Wrap with retry and error handling
const robustGetUser = userApi.getUser
  .use(retry({ retries: 3, delay: "backoff" }))
  .use(catchError((err) => console.error("Failed to get user:", err)))
  .use(timeout(10000));

robustGetUser satisfies Abortable<[string], User>;

// Use the wrapped function
async function fetchUserProfile(userId: string): Promise<User> {
  return robustGetUser(userId);
}

// Create user with mutation pattern
const robustCreateUser = userApi.createUser
  .use(timeout(30000))
  .use(catchError((err) => console.error("Create failed:", err)));

robustCreateUser satisfies Abortable<[{ name: string; email: string }], User>;

// Multiple arg types preserved
const robustGetPost = userApi.getPost.use(retry(2)).use(logging("getPost"));

robustGetPost satisfies Abortable<[number], Post>;
const _postResult: Promise<Post> = robustGetPost(123);

// =============================================================================
// Type preservation tests - ensure types are NOT widened to `any`
// =============================================================================

// These should cause compile errors (proving types are preserved)

// @ts-expect-error - wrong arg type (should be string, not number)
const _wrongArg1: Promise<{ id: string; name: string }> = withRetry(123);

// @ts-expect-error - wrong arg type after chain
const _wrongArg2: Promise<{ id: string; name: string }> = fullChain(123);

// @ts-expect-error - wrong return type expectation
const _wrongReturn1: Promise<number> = withRetry("test");

// @ts-expect-error - wrong return type after chain
const _wrongReturn2: Promise<string> = fullChain("test");

// @ts-expect-error - missing required arg
const _missingArg1: Promise<{ id: string; name: string }> = withRetry();

// @ts-expect-error - too many args
const _extraArg1: Promise<{ id: string; name: string }> = withRetry(
  "id",
  "extra"
);

// @ts-expect-error - wrong args for multi-arg function
const _wrongMultiArgs: Promise<number> = multiArgChain(
  "wrong",
  123,
  "not boolean"
);

// @ts-expect-error - wrong arg with signal
const _wrongWithArg: Promise<{ id: string; name: string }> = fullChain.withSignal(
  controller.signal,
  999
);

// Verify result type is specific, not any (wrap in async function for await)
async function testResultTypes() {
  const result = await withRetry("test");
  const _name: string = result.name; // Should work
  const _id: string = result.id; // Should work
  // @ts-expect-error - property doesn't exist
  const _invalid = result.nonExistent;

  const chainedResult = await fullChain("test");
  const _chainedName: string = chainedResult.name; // Should work
  // @ts-expect-error - property doesn't exist
  const _chainedInvalid = chainedResult.nonExistent;
}

// =============================================================================
// Edge cases
// =============================================================================

// Void return type
const voidFn = abortable(async ({}, msg: string): Promise<void> => {
  console.log(msg);
});
const wrappedVoid = voidFn.use(retry(3));
wrappedVoid satisfies Abortable<[string], void>;

// Complex nested types
interface ComplexData {
  users: User[];
  meta: {
    total: number;
    page: number;
    hasMore: boolean;
  };
}

const complexFn = abortable(
  async ({}, page: number, limit: number): Promise<ComplexData> => {
    return {
      users: [],
      meta: { total: 0, page, hasMore: false },
    };
  }
);

const wrappedComplex = complexFn
  .use(retry({ retries: 3, delay: 1000 }))
  .use(timeout(5000));

wrappedComplex satisfies Abortable<[number, number], ComplexData>;

// Optional args (rest params style)
const optionalArgsFn = abortable(
  async ({}, required: string, optional?: number): Promise<string> => {
    return `${required}-${optional ?? 0}`;
  }
);

const wrappedOptional = optionalArgsFn.use(retry(3));
wrappedOptional satisfies Abortable<[string, (number | undefined)?], string>;

console.log("All type checks passed!");
