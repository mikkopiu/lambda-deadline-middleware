/**
 * Integration tests for the deadline middleware with real AWS SDK v3 clients.
 *
 * These tests verify the full middleware lifecycle by using real SDK clients
 * with a custom HTTP request handler (not mockClient), ensuring the middleware
 * stack actually executes including our deadline middleware.
 *
 * We primarily use DynamoDB and S3 clients for success-path tests as they
 * accept minimal responses. SQS has additional checksum validation middleware
 * that requires proper MD5 response bodies — we test it separately with
 * correct responses to prove service-agnostic compatibility.
 */
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { DynamoDBClient, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { HttpHandlerOptions, HttpRequest } from "@smithy/types";

import { withLambdaDeadline } from "../../src/handler-wrapper.js";
import { deadlineMiddleware } from "../../src/registration.js";
import { DeadlineExceededError, isDeadlineExceeded } from "../../src/error.js";
import type { LambdaContextLike } from "../../src/context-store.js";

/** Creates a minimal fake HTTP handler that returns a 200 response */
function createFakeHandler(options?: {
  delay?: number;
  onRequest?: (request: HttpRequest, handlerOptions?: HttpHandlerOptions) => void;
}) {
  const { delay = 0, onRequest } = options ?? {};

  return {
    handle: async (request: HttpRequest, handlerOptions?: HttpHandlerOptions) => {
      onRequest?.(request, handlerOptions);

      if (delay > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, delay);
        });
      }

      return {
        response: {
          statusCode: 200,
          headers: {
            "content-type": "application/json",
            "x-amzn-requestid": "fake-request-id",
          },
          body: undefined,
        },
      };
    },
    updateHttpClientConfig: () => {},
    httpHandlerConfigs: () => ({}),
  };
}

/** Creates a fake handler for SQS that returns proper MD5 checksums */
function createSqsFakeHandler(options?: {
  delay?: number;
  onRequest?: (request: HttpRequest, handlerOptions?: HttpHandlerOptions) => void;
}) {
  const { delay = 0, onRequest } = options ?? {};

  return {
    handle: async (request: HttpRequest, handlerOptions?: HttpHandlerOptions) => {
      onRequest?.(request, handlerOptions);

      if (delay > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, delay);
        });
      }

      // Extract message body from the request to compute MD5
      let messageBody = "test";
      const body: unknown = request.body;
      if (
        typeof body === "string" ||
        (body !== null && body !== undefined && typeof body === "object")
      ) {
        try {
          const rawBody = typeof body === "string" ? body : JSON.stringify(body);
          const parsed: unknown = JSON.parse(rawBody);
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            "MessageBody" in parsed &&
            typeof (parsed as Record<string, unknown>)["MessageBody"] === "string"
          ) {
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- extracting MessageBody from parsed JSON
            messageBody = (parsed as Record<string, unknown>)["MessageBody"] as string;
          }
        } catch {
          // ignore parse errors, use default
        }
      }

      const md5 = createHash("md5").update(messageBody).digest("hex");
      const responseBody = JSON.stringify({
        MessageId: "fake-msg-id",
        MD5OfMessageBody: md5,
      });

      return {
        response: {
          statusCode: 200,
          headers: {
            "content-type": "application/x-amz-json-1.0",
            "x-amzn-requestid": "fake-request-id",
          },
          body: Readable.from(Buffer.from(responseBody)),
        },
      };
    },
    updateHttpClientConfig: () => {},
    httpHandlerConfigs: () => ({}),
  };
}

function createDynamoClient(handler: ReturnType<typeof createFakeHandler>) {
  return new DynamoDBClient({
    region: "us-east-1",
    requestHandler: handler,
    credentials: { accessKeyId: "fake", secretAccessKey: "fake" },
  });
}

function createS3Client(handler: ReturnType<typeof createFakeHandler>) {
  return new S3Client({
    region: "us-east-1",
    requestHandler: handler,
    credentials: { accessKeyId: "fake", secretAccessKey: "fake" },
  });
}

function createSqsClient(
  handler: ReturnType<typeof createSqsFakeHandler>,
  opts?: { maxAttempts?: number },
) {
  return new SQSClient({
    region: "us-east-1",
    requestHandler: handler,
    credentials: { accessKeyId: "fake", secretAccessKey: "fake" },
    ...opts,
  });
}

describe("SDK Client Integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Normal flow — SDK calls succeed with deadline middleware active", () => {
    it("SQS SendMessage succeeds within Lambda context", async () => {
      const handler = createSqsFakeHandler();
      const sqs = createSqsClient(handler);
      sqs.middlewareStack.use(deadlineMiddleware());

      const lambdaHandler = withLambdaDeadline(async () => {
        const result = await sqs.send(
          new SendMessageCommand({
            QueueUrl: "https://sqs.us-east-1.amazonaws.com/123/queue",
            MessageBody: "hello world",
          }),
        );
        return result.MessageId;
      });

      const context: LambdaContextLike = {
        getRemainingTimeInMillis: () => 5000,
      };

      const result = await lambdaHandler({}, context);
      expect(result).toBe("fake-msg-id");
    });

    it("DynamoDB PutItem succeeds within Lambda context", async () => {
      const handler = createFakeHandler();
      const dynamo = createDynamoClient(handler);
      dynamo.middlewareStack.use(deadlineMiddleware());

      const lambdaHandler = withLambdaDeadline(async () => {
        await dynamo.send(
          new PutItemCommand({
            TableName: "test-table",
            Item: { pk: { S: "key-1" } },
          }),
        );
        return "ok";
      });

      const context: LambdaContextLike = {
        getRemainingTimeInMillis: () => 10000,
      };

      const result = await lambdaHandler({}, context);
      expect(result).toBe("ok");
    });

    it("S3 PutObject succeeds within Lambda context", async () => {
      const handler = createFakeHandler();
      const s3 = createS3Client(handler);
      s3.middlewareStack.use(deadlineMiddleware());

      const lambdaHandler = withLambdaDeadline(async () => {
        await s3.send(
          new PutObjectCommand({
            Bucket: "test-bucket",
            Key: "test-key",
            Body: "content",
          }),
        );
        return "ok";
      });

      const context: LambdaContextLike = {
        getRemainingTimeInMillis: () => 8000,
      };

      const result = await lambdaHandler({}, context);
      expect(result).toBe("ok");
    });
  });

  describe("Timeout — deadline fires and aborts SDK call", () => {
    it("throws DeadlineExceededError when remaining time is less than flush buffer", async () => {
      const handler = createFakeHandler();
      const dynamo = createDynamoClient(handler);
      dynamo.middlewareStack.use(deadlineMiddleware({ flushBufferMs: 1000 }));

      const lambdaHandler = withLambdaDeadline(async () =>
        dynamo.send(
          new PutItemCommand({
            TableName: "test-table",
            Item: { pk: { S: "key-1" } },
          }),
        ),
      );

      // Remaining time (500ms) < flush buffer (1000ms) → immediate abort
      const context: LambdaContextLike = {
        getRemainingTimeInMillis: () => 500,
      };

      const error = await lambdaHandler({}, context).catch((e: unknown) => e);
      expect(isDeadlineExceeded(error)).toBe(true);
      expect(error).toBeInstanceOf(DeadlineExceededError);
    });

    it("throws DeadlineExceededError when remaining time equals flush buffer", async () => {
      const handler = createFakeHandler();
      const dynamo = createDynamoClient(handler);
      dynamo.middlewareStack.use(deadlineMiddleware({ flushBufferMs: 2000 }));

      const lambdaHandler = withLambdaDeadline(async () =>
        dynamo.send(
          new GetItemCommand({
            TableName: "t",
            Key: { pk: { S: "k" } },
          }),
        ),
      );

      // Remaining time (2000ms) == flush buffer (2000ms) → immediate abort
      const context: LambdaContextLike = {
        getRemainingTimeInMillis: () => 2000,
      };

      const error = await lambdaHandler({}, context).catch((e: unknown) => e);
      expect(isDeadlineExceeded(error)).toBe(true);
    });

    it("aborts via timeout when HTTP response takes longer than deadline", async () => {
      // A handler that respects abort signals on the request object
      const abortAwareHandler = {
        handle: async (request: HttpRequest) => {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- accessing signal from opaque Smithy HttpRequest
          const signal = (request as unknown as { signal?: AbortSignal }).signal;

          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(resolve, 200);
            if (signal) {
              if (signal.aborted) {
                clearTimeout(timeout);
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- signal.reason is unknown; we know it's Error from our abort call
                reject((signal.reason as Error | undefined) ?? new Error("aborted"));
                return;
              }
              signal.addEventListener(
                "abort",
                () => {
                  clearTimeout(timeout);
                  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- signal.reason is unknown; we know it's Error from our abort call
                  reject((signal.reason as Error | undefined) ?? new Error("aborted"));
                },
                { once: true },
              );
            }
          });

          return {
            response: {
              statusCode: 200,
              headers: { "content-type": "application/json", "x-amzn-requestid": "x" },
              body: undefined,
            },
          };
        },
        updateHttpClientConfig: () => {},
        httpHandlerConfigs: () => ({}),
      };

      const dynamo = new DynamoDBClient({
        region: "us-east-1",
        requestHandler: abortAwareHandler,
        credentials: { accessKeyId: "fake", secretAccessKey: "fake" },
        maxAttempts: 1,
      });
      dynamo.middlewareStack.use(deadlineMiddleware({ flushBufferMs: 0 }));

      const lambdaHandler = withLambdaDeadline(async () =>
        dynamo.send(
          new PutItemCommand({
            TableName: "test-table",
            Item: { pk: { S: "key-1" } },
          }),
        ),
      );

      // 50ms deadline, handler takes 200ms → abort fires
      const context: LambdaContextLike = {
        getRemainingTimeInMillis: () => 50,
      };

      const error = await lambdaHandler({}, context).catch((e: unknown) => e);
      expect(error).toBeDefined();
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("No-op — outside Lambda context", () => {
    it("DynamoDB call proceeds without deadline when no Lambda context", async () => {
      let requestHandlerCalled = false;
      const handler = createFakeHandler({
        onRequest: () => {
          requestHandlerCalled = true;
        },
      });
      const dynamo = createDynamoClient(handler);
      dynamo.middlewareStack.use(deadlineMiddleware());

      // Call directly without withLambdaDeadline → no context store active
      await dynamo.send(
        new PutItemCommand({
          TableName: "test-table",
          Item: { pk: { S: "key-1" } },
        }),
      );

      expect(requestHandlerCalled).toBe(true);
    });

    it("S3 call proceeds without deadline when no Lambda context", async () => {
      let requestHandlerCalled = false;
      const handler = createFakeHandler({
        onRequest: () => {
          requestHandlerCalled = true;
        },
      });
      const s3 = createS3Client(handler);
      s3.middlewareStack.use(deadlineMiddleware());

      await s3.send(
        new PutObjectCommand({
          Bucket: "test-bucket",
          Key: "key",
          Body: "data",
        }),
      );

      expect(requestHandlerCalled).toBe(true);
    });

    it("SQS call proceeds without deadline when no Lambda context", async () => {
      const handler = createSqsFakeHandler();
      const sqs = createSqsClient(handler);
      sqs.middlewareStack.use(deadlineMiddleware());

      const result = await sqs.send(
        new SendMessageCommand({
          QueueUrl: "https://sqs.us-east-1.amazonaws.com/123/queue",
          MessageBody: "test",
        }),
      );

      expect(result.MessageId).toBe("fake-msg-id");
    });
  });

  describe("Signal composition — caller-provided AbortSignal", () => {
    it("aborts when caller signal fires before deadline", async () => {
      // The caller's abortSignal is passed via handlerOptions by the SDK,
      // separate from our middleware's signal. This test verifies that
      // the SDK propagates the caller abort independently.
      const abortAwareHandler = {
        handle: async (request: HttpRequest, handlerOptions?: HttpHandlerOptions) => {
          // The SDK passes caller abort signal via handlerOptions.abortSignal
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- handlerOptions has no typed abortSignal property
          const callerSignal = (handlerOptions as { abortSignal?: AbortSignal } | undefined)
            ?.abortSignal;
          // Our middleware puts its signal on request.signal
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- accessing signal from opaque Smithy HttpRequest
          const deadlineSignal = (request as unknown as { signal?: AbortSignal }).signal;

          // Create a combined signal to listen to both
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- filter(Boolean) guarantees non-null elements
          const signals = [callerSignal, deadlineSignal].filter(Boolean) as AbortSignal[];
          const combined = signals.length > 0 ? AbortSignal.any(signals) : undefined;

          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(resolve, 500);
            if (combined) {
              if (combined.aborted) {
                clearTimeout(timeout);
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- signal.reason is unknown; we know it's Error from our abort call
                reject((combined.reason as Error | undefined) ?? new Error("aborted"));
                return;
              }
              combined.addEventListener(
                "abort",
                () => {
                  clearTimeout(timeout);
                  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- signal.reason is unknown; we know it's Error from our abort call
                  reject((combined.reason as Error | undefined) ?? new Error("aborted"));
                },
                { once: true },
              );
            }
          });

          return {
            response: {
              statusCode: 200,
              headers: { "content-type": "application/json", "x-amzn-requestid": "x" },
              body: undefined,
            },
          };
        },
        updateHttpClientConfig: () => {},
        httpHandlerConfigs: () => ({}),
      };

      const dynamo = new DynamoDBClient({
        region: "us-east-1",
        requestHandler: abortAwareHandler,
        credentials: { accessKeyId: "fake", secretAccessKey: "fake" },
        maxAttempts: 1,
      });
      dynamo.middlewareStack.use(deadlineMiddleware({ flushBufferMs: 0 }));

      const callerController = new AbortController();

      const lambdaHandler = withLambdaDeadline(async () => {
        // Abort after 10ms via caller signal
        setTimeout(() => {
          callerController.abort(new Error("caller abort"));
        }, 10);
        return dynamo.send(
          new PutItemCommand({
            TableName: "test-table",
            Item: { pk: { S: "key-1" } },
          }),
          { abortSignal: callerController.signal },
        );
      });

      const context: LambdaContextLike = {
        getRemainingTimeInMillis: () => 10000, // Long deadline — won't fire
      };

      const error = await lambdaHandler({}, context).catch((e: unknown) => e);
      expect(error).toBeDefined();
      expect(error).toBeInstanceOf(Error);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrowing after instanceof check above
      expect((error as Error).message).toBe("caller abort");
    });

    it("succeeds when neither caller signal nor deadline fires", async () => {
      const handler = createSqsFakeHandler();
      const sqs = createSqsClient(handler);
      sqs.middlewareStack.use(deadlineMiddleware({ flushBufferMs: 0 }));
      const callerController = new AbortController();

      const lambdaHandler = withLambdaDeadline(async () => {
        const result = await sqs.send(
          new SendMessageCommand({
            QueueUrl: "https://sqs.us-east-1.amazonaws.com/123/queue",
            MessageBody: "test",
          }),
          { abortSignal: callerController.signal },
        );
        return result.MessageId;
      });

      const context: LambdaContextLike = {
        getRemainingTimeInMillis: () => 10000,
      };

      const result = await lambdaHandler({}, context);
      expect(result).toBe("fake-msg-id");
    });
  });

  describe("Retry behavior — fresh deadline per attempt", () => {
    it("computes fresh deadline for each retry attempt with decreasing remaining time", async () => {
      let callCount = 0;
      let remainingTime = 5000;

      const handler = {
        // oxlint-disable-next-line typescript/require-await -- async to satisfy HttpHandler interface without awaiting
        handle: async () => {
          callCount++;
          if (callCount === 1) {
            // First attempt: simulate time passing, return retryable 503
            remainingTime = 3000;
            return {
              response: {
                statusCode: 503,
                headers: {
                  "content-type": "application/json",
                  "x-amzn-requestid": "fake-request-id",
                },
                body: undefined,
              },
            };
          }
          // Second attempt: succeed
          return {
            response: {
              statusCode: 200,
              headers: {
                "content-type": "application/json",
                "x-amzn-requestid": "fake-request-id",
              },
              body: undefined,
            },
          };
        },
        updateHttpClientConfig: () => {},
        httpHandlerConfigs: () => ({}),
      };

      const dynamo = new DynamoDBClient({
        region: "us-east-1",
        requestHandler: handler,
        credentials: { accessKeyId: "fake", secretAccessKey: "fake" },
        maxAttempts: 3,
      });
      dynamo.middlewareStack.use(deadlineMiddleware({ flushBufferMs: 500 }));

      const lambdaHandler = withLambdaDeadline(async () => {
        await dynamo.send(
          new PutItemCommand({
            TableName: "test-table",
            Item: { pk: { S: "key-1" } },
          }),
        );
        return "ok";
      });

      const context: LambdaContextLike = {
        getRemainingTimeInMillis: () => remainingTime,
      };

      const result = await lambdaHandler({}, context);
      expect(result).toBe("ok");
      expect(callCount).toBe(2);
    });

    it("fails with DeadlineExceededError when retry has insufficient time", async () => {
      let remainingTime = 3000;

      const handler = {
        // oxlint-disable-next-line typescript/require-await -- async to satisfy HttpHandler interface without awaiting
        handle: async () => {
          // Time drops below buffer after first call
          remainingTime = 800;
          return {
            response: {
              statusCode: 503,
              headers: {
                "content-type": "application/json",
                "x-amzn-requestid": "fake-request-id",
              },
              body: undefined,
            },
          };
        },
        updateHttpClientConfig: () => {},
        httpHandlerConfigs: () => ({}),
      };

      const dynamo = new DynamoDBClient({
        region: "us-east-1",
        requestHandler: handler,
        credentials: { accessKeyId: "fake", secretAccessKey: "fake" },
        maxAttempts: 3,
      });
      dynamo.middlewareStack.use(deadlineMiddleware({ flushBufferMs: 1000 }));

      const lambdaHandler = withLambdaDeadline(async () =>
        dynamo.send(
          new PutItemCommand({
            TableName: "test-table",
            Item: { pk: { S: "key-1" } },
          }),
        ),
      );

      const context: LambdaContextLike = {
        getRemainingTimeInMillis: () => remainingTime,
      };

      const error = await lambdaHandler({}, context).catch((e: unknown) => e);
      expect(isDeadlineExceeded(error)).toBe(true);
    });
  });

  describe("Full middleware lifecycle", () => {
    it("wraps handler, registers middleware, makes successful call end-to-end", async () => {
      const handler = createFakeHandler();
      const dynamo = createDynamoClient(handler);
      dynamo.middlewareStack.use(deadlineMiddleware({ flushBufferMs: 500 }));

      const lambdaHandler = withLambdaDeadline(async (event: { key: string }) => {
        await dynamo.send(
          new PutItemCommand({
            TableName: "test-table",
            Item: { pk: { S: event.key }, data: { S: "value" } },
          }),
        );
        return "done";
      });

      const context: LambdaContextLike = {
        getRemainingTimeInMillis: () => 15000,
      };

      const result = await lambdaHandler({ key: "key-1" }, context);
      expect(result).toBe("done");
    });

    it("multiple SDK clients in same handler share context", async () => {
      let sqsCallCount = 0;
      let dynamoCallCount = 0;

      const sqsHandler = createSqsFakeHandler({
        onRequest: () => {
          sqsCallCount++;
        },
      });
      const dynamoHandler = createFakeHandler({
        onRequest: () => {
          dynamoCallCount++;
        },
      });

      const sqs = createSqsClient(sqsHandler);
      sqs.middlewareStack.use(deadlineMiddleware());
      const dynamo = createDynamoClient(dynamoHandler);
      dynamo.middlewareStack.use(deadlineMiddleware());

      const lambdaHandler = withLambdaDeadline(async () => {
        await dynamo.send(
          new PutItemCommand({
            TableName: "test-table",
            Item: { pk: { S: "key" } },
          }),
        );

        const sqsResult = await sqs.send(
          new SendMessageCommand({
            QueueUrl: "https://sqs.us-east-1.amazonaws.com/123/queue",
            MessageBody: "processed",
          }),
        );

        return sqsResult.MessageId;
      });

      const context: LambdaContextLike = {
        getRemainingTimeInMillis: () => 10000,
      };

      const result = await lambdaHandler({}, context);
      expect(result).toBe("fake-msg-id");
      expect(dynamoCallCount).toBe(1);
      expect(sqsCallCount).toBe(1);
    });
  });
});
