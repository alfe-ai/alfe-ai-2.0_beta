import { NextRequest } from 'next/server';

/**
 * Example Next.js Edge API route demonstrating streaming responses from OpenAI
 * without "[Error occurred]" interruptions.
 */
export const runtime = 'edge';
export const maxDuration = 30;

/**
 * POST handler for streaming OpenAI responses.
 */
export async function POST(req: NextRequest) {
  // 1. Parse incoming request JSON
  const { messages } = await req.json().catch(() => ({ messages: [] }));

  // 2. Validate or set default messages
  const userMessages = Array.isArray(messages) && messages.length > 0
    ? messages
    : [{ role: 'user', content: 'Say hello!' }];

  // 3. Make OpenAI API request with streaming enabled
  const openRouterKey = process.env.OPENROUTER_API_KEY || '';
  if (!openRouterKey) {
    return new Response('[Error]: Missing OpenRouter API key', { status: 500 });
  }

  // Prepare chat completion payload
  const body = JSON.stringify({
    model: 'deepseek/deepseek-chat',
    messages: userMessages,
    temperature: 0.7,
    stream: true
  });

  // Forward request to OpenRouter with fetch
  const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openRouterKey}`,
      'X-Title': 'MyAwesomeApp',
      'HTTP-Referer': 'https://my-awesome-app.example.com'
    },
    body
  });

  if (!openRouterResponse.ok || !openRouterResponse.body) {
    return new Response('[Error]: OpenRouter request failed', { status: 500 });
  }

  // 4. Create a readable stream to transform OpenAI chunks to SSE format
  const readableStream = new ReadableStream({
    async start(controller) {
      // Use reader to read the response body
      const reader = openRouterResponse.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;

      try {
        while (!done) {
          const { value, done: streamDone } = await reader.read();
          done = streamDone;
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              if (trimmed === '[DONE]') {
                // End of stream; signal SSE client to stop
                controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
                break;
              }
              // SSE data chunk
              controller.enqueue(new TextEncoder().encode(`data: ${trimmed}\n\n`));
            }
          }
        }
      } catch (err) {
        controller.enqueue(new TextEncoder().encode(`data: [Error reading stream]\n\n`));
      } finally {
        controller.close();
        reader.releaseLock();
      }
    }
  });

  // 5. Return event-stream response so client can consume chunks
  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
