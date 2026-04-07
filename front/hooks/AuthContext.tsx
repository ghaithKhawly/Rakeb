import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import * as SecureStore from "expo-secure-store";
import { api } from "@/config/api";
import { useRouter } from "expo-router";

// Define User type
interface User {
  id: number;
  username: string;
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

  useEffect(() => {
    // Check for stored token on app launch
    const loadAuthData = async () => {
      try {
        const storedToken = await SecureStore.getItemAsync("auth_token");
        const storedUser = await SecureStore.getItemAsync("auth_user");

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
          // Set default header for future requests
          api.defaults.headers.common["Authorization"] =
            `Bearer ${storedToken}`;

          if (__DEV__) {
            console.log("[Auth] restored token", {
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

  const signIn = async (newToken: string, newUser: User) => {
    try {
      setToken(newToken);
      setUser(newUser);

      // Persist data
      await SecureStore.setItemAsync("auth_token", newToken);
      await SecureStore.setItemAsync("auth_user", JSON.stringify(newUser));

      // Configure axios
      api.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;

      if (__DEV__) {
        console.log("[Auth] sign-in token", {
          tokenMasked: maskToken(newToken),
          claims: decodeJwtPayload(newToken),
        });
      }

      router.replace("/(tabs)");
    } catch (error) {
      console.error("Sign in error", error);
    }
  };

  const signOut = async () => {
    try {
      setToken(null);
      setUser(null);

      // Clear storage
      await SecureStore.deleteItemAsync("auth_token");
      await SecureStore.deleteItemAsync("auth_user");

      // Clear axios header
      delete api.defaults.headers.common["Authorization"];

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
