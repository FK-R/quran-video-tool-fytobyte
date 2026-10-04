export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: string[],
  ) {
    super(message);
  }
}

export function errorLines(e: unknown): string[] {
  if (e instanceof ApiError) return [e.message, ...(e.details ?? [])];
  return [e instanceof Error ? e.message : "Unexpected error"];
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error ?? res.statusText, res.status, body?.details);
  return body as T;
}

export const jsonBody = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

/** Raw-body upload with progress (fetch cannot report upload progress). */
export function uploadFile<T>(url: string, file: File, onProgress: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("x-filename", encodeURIComponent(file.name));
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress((e.loaded / e.total) * 100);
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new ApiError(body?.error ?? "Upload failed", xhr.status, body?.details));
    };
    xhr.onerror = () => reject(new ApiError("Network error during upload", 0));
    xhr.send(file);
  });
}
