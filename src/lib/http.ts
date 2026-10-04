import { ZodError } from "zod";
import { CsvError } from "./csv";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: string[],
  ) {
    super(message);
  }
}

export type IdCtx = { params: { id: string } };

/** Wraps a route handler: uniform JSON error responses, no try/catch noise in routes. */
export function handle<C = unknown>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) {
        return Response.json({ error: e.message, details: e.details }, { status: e.status });
      }
      if (e instanceof CsvError) {
        return Response.json({ error: e.message, details: e.details }, { status: 422 });
      }
      if (e instanceof ZodError) {
        return Response.json(
          { error: "Invalid request", details: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
          { status: 400 },
        );
      }
      console.error("[api] unhandled error", e);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
