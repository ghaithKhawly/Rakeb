import { Redirect } from "expo-router";
import { useAuth } from "@/hooks/AuthContext";
import { View, ActivityIndicator } from "react-native";

export default function Index() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/login" />;
}
