export type AuthResponse = {
  jwt: string;
  user: {
    id: number;
    username: string;
    email: string;
    firstName?: string;
    lastName?: string;
    position?: string;
    department?: string;
  };
};

type StrapiError = {
  error?: {
    message?: string;
  };
};

export function getApiUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  if (typeof window !== "undefined" && window.location.port === "8080") {
    return window.location.origin;
  }

  return "http://localhost:1337";
}

async function request<T>(path: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(`${getApiUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as StrapiError;
    throw new Error(data.error?.message || "Request failed");
  }

  return response.json() as Promise<T>;
}

export function login(identifier: string, password: string) {
  return request<AuthResponse>("/api/auth/local", { identifier, password });
}

export function register(username: string, email: string, password: string) {
  return request<AuthResponse>("/api/auth/local/register", {
    username,
    email,
    password,
  });
}
