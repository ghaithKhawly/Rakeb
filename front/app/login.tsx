import { useState } from "react";
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  SafeAreaView,
} from "react-native";
import { API_BASE_URL, api } from "@/config/api";
import { Colors } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { AxiosError } from "axios";
import { useAuth } from "@/hooks/AuthContext";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      const response = await api.post("/api/auth/login", {
        username,
        password,
      });

      const { token, user } = response.data;

      await signIn(token, user);

      Alert.alert("Success", "Logged in successfully");
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      const message =
        axiosError.response?.data?.error ||
        (axiosError.response
          ? "Login failed"
          : `Cannot reach backend at ${API_BASE_URL}. If using a phone, set EXPO_PUBLIC_API_URL to your PC LAN IP.`);
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!username || !password) {
      Alert.alert("Error", "Please fill in username and password first");
      return;
    }

    setLoading(true);
    try {
      const registerResponse = await api.post("/api/auth/register", {
        username,
        password,
      });

      const { token, userId } = registerResponse.data as {
        token: string;
        userId: number;
      };
      await signIn(token, { id: userId, username });
      Alert.alert("Success", "Account created and logged in");
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      const message =
        axiosError.response?.data?.error ||
        (axiosError.response
          ? "Registration failed"
          : `Cannot reach backend at ${API_BASE_URL}. If using a phone, set EXPO_PUBLIC_API_URL to your PC LAN IP.`);
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 20 : 0}
        >
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="bus" size={40} color={Colors.dark.primary} />
            </View>
            <Text style={styles.title}>System Access</Text>
            <Text style={styles.subtitle}>Transit Network Control</Text>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>USERNAME</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter username"
                placeholderTextColor={Colors.dark.icon}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>PASSWORD</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter password"
                placeholderTextColor={Colors.dark.icon}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>
                {loading ? "AUTHENTICATING..." : "SIGN IN"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>CREATE ACCOUNT</Text>
            </TouchableOpacity>

            <Text style={styles.apiHint}>Backend: {API_BASE_URL}</Text>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: "center",
  },
  header: {
    marginBottom: 48,
    alignItems: "center",
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(45, 212, 191, 0.1)", // Light teal background
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.icon,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  formContainer: {
    gap: 24,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.icon,
    letterSpacing: 1,
  },
  input: {
    height: 56,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  button: {
    height: 56,
    backgroundColor: Colors.dark.primary,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: Colors.dark.border,
  },
  buttonText: {
    color: Colors.dark.background,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
  },
  secondaryButton: {
    height: 46,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
  },
  secondaryButtonText: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  apiHint: {
    color: Colors.dark.icon,
    fontSize: 11,
    textAlign: "center",
    marginTop: 6,
  },
});
