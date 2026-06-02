import React, {
  createContext,
  useContext,
  useCallback,
  useRef,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { api } from "@/config/api";
import { useRouter } from "expo-router";
import {
  deleteStoredValue,
  getStoredValue,
  setStoredValue,
} from "@/utils/storage";

// Define User type
interface User {
  id: number;
  username: string;
  role?: "rider" | "driver" | "admin" | string;
}

// Define Context type
interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
}

function maskToken(token: string): string {
  if (token.length <= 16) {
    return "***";
  }
  return `${token.slice(0, 8)}...${token.slice(-8)}`;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + "=".repeat(padLength);
    const decoded = atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Create Context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider Component
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const tokenRef = useRef<string | null>(null);

  const clearAuthState = useCallback(async () => {
    setToken(null);
    tokenRef.current = null;
    setUser(null);

    await deleteStoredValue("auth_token");
    await deleteStoredValue("auth_user");
    delete api.defaults.headers.common["Authorization"];
  }, []);

  useEffect(() => {
    // Check for stored token on app launch
    const loadAuthData = async () => {
      try {
        const storedToken = await getStoredValue("auth_token");
        const storedUser = await getStoredValue("auth_user");

        if (storedToken && storedUser) {
          setToken(storedToken);
          tokenRef.current = storedToken;
          setUser(JSON.parse(storedUser));
          // Set default header for future requests
          api.defaults.headers.common["Authorization"] =
            `Bearer ${storedToken}`;

          if (__DEV__) {
            console.log("[Auth] restored token", {
              token: storedToken,
              tokenMasked: maskToken(storedToken),
              claims: decodeJwtPayload(storedToken),
            });
          }
        }
      } catch (error) {
        console.error("Failed to load auth data", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadAuthData();
  }, []);

  useEffect(() => {
    const interceptorId = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const requestAuthHeader =
          error?.config?.headers?.Authorization ??
          error?.config?.headers?.authorization;
        const currentToken = tokenRef.current;
        const hasCurrentBearerToken =
          typeof requestAuthHeader === "string" &&
          typeof currentToken === "string" &&
          requestAuthHeader === `Bearer ${currentToken}`;

        if (error?.response?.status === 401 && hasCurrentBearerToken) {
          await clearAuthState();
          router.replace("/login");
        }

        return Promise.reject(error);
      },
    );

    return () => {
      api.interceptors.response.eject(interceptorId);
    };
  }, [clearAuthState, router, token]);

  const signIn = async (newToken: string, newUser: User) => {
    try {
      setToken(newToken);
      tokenRef.current = newToken;
      setUser(newUser);

      // Persist data
      await setStoredValue("auth_token", newToken);
      await setStoredValue("auth_user", JSON.stringify(newUser));

      // Configure axios
      api.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;

      if (__DEV__) {
        console.log("[Auth] sign-in token", {
          token: newToken,
          tokenMasked: maskToken(newToken),
          claims: decodeJwtPayload(newToken),
        });
      }

      router.replace(newUser.role === "admin" ? ("/admin" as never) : "/(tabs)");
    } catch (error) {
      console.error("Sign in error", error);
    }
  };

  const signOut = async () => {
    try {
      await clearAuthState();

      router.replace("/login");
    } catch (error) {
      console.error("Sign out error", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom Hook
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
