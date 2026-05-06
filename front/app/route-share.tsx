import React, { useEffect } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { ThemedText } from "@/components/themed-text";

export default function RouteShareScreen() {
  const params = useLocalSearchParams<{
    fromLat?: string;
    fromLng?: string;
    fromLabel?: string;
    toLat?: string;
    toLng?: string;
    toLabel?: string;
    googleMaps?: string;
  }>();

  useEffect(() => {
    const fromLat = Number.parseFloat(params.fromLat ?? "");
    const fromLng = Number.parseFloat(params.fromLng ?? "");
    const toLat = Number.parseFloat(params.toLat ?? "");
    const toLng = Number.parseFloat(params.toLng ?? "");

    if (
      !Number.isFinite(fromLat) ||
      !Number.isFinite(fromLng) ||
      !Number.isFinite(toLat) ||
      !Number.isFinite(toLng)
    ) {
      router.replace("/(tabs)");
      return;
    }

    const fallbackGoogleMaps = `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=transit`;
    const googleMapsUrl =
      typeof params.googleMaps === "string" && params.googleMaps.trim().length > 0
        ? params.googleMaps
        : fallbackGoogleMaps;

    if (Platform.OS === "web") {
      window.location.replace(googleMapsUrl);
      return;
    }

    router.replace({
      pathname: "/(tabs)",
      params: {
        fromLat: String(fromLat),
        fromLng: String(fromLng),
        fromLabel: typeof params.fromLabel === "string" ? params.fromLabel : "",
        toLat: String(toLat),
        toLng: String(toLng),
        toLabel: typeof params.toLabel === "string" ? params.toLabel : "",
      },
    });
  }, [
    params.fromLat,
    params.fromLng,
    params.fromLabel,
    params.toLat,
    params.toLng,
    params.toLabel,
    params.googleMaps,
  ]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      <ThemedText style={styles.text}>Opening shared route...</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  text: {
    fontSize: 14,
  },
});
